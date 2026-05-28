/**
 * Per-project backend provisioning.
 * Users provide their own Supabase Management API PAT (Personal Access Token).
 * We generate SQL from the app schema and apply it to their Supabase project.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  MBackend,
  MColumn,
  MEdgeFunction,
  MPgFunction,
  MStorageBucket,
  MTable,
  MobileAppSchema,
} from "./mobile-app-schema";
import { callAI } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";

const PG_TYPE: Record<string, string> = {
  text: "text",
  int: "bigint",
  float: "double precision",
  bool: "boolean",
  timestamp: "timestamptz",
  jsonb: "jsonb",
  uuid: "uuid",
};

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

function safeIdent(name: string): string {
  const lower = name.toLowerCase();
  if (!IDENT_RE.test(lower)) throw new Error(`Invalid identifier: ${name}`);
  if (lower.length > 63) throw new Error(`Identifier too long (>63 chars): ${name}`);
  return lower;
}

/**
 * Whitelist of safe DEFAULT expressions. AI-emitted spec values are
 * interpolated raw into SQL, so anything outside this whitelist must be
 * rejected to prevent SQL injection at apply time.
 */
const SAFE_DEFAULT_FNS = new Set([
  "now()",
  "current_timestamp",
  "gen_random_uuid()",
  "auth.uid()",
  "true",
  "false",
  "null",
]);

function safeDefault(def: unknown): string {
  // The AI sometimes emits raw JSON values (numbers, booleans) instead of
  // strings, so accept any primitive and coerce.
  if (def === null || def === undefined) {
    throw new Error("Empty DEFAULT expression");
  }
  const trimmed = String(def).trim();
  const lower = trimmed.toLowerCase();
  if (SAFE_DEFAULT_FNS.has(lower)) return lower;
  // Numeric literal: `-?\d+(\.\d+)?`
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  // Single-quoted string literal with no embedded quotes or backslashes.
  if (/^'[^'\\]*'$/.test(trimmed)) return trimmed;
  throw new Error(
    `Unsafe DEFAULT expression: ${def}. Allowed: now(), gen_random_uuid(), auth.uid(), numeric/boolean/null literals, or simple quoted strings.`,
  );
}

const VALID_ON_DELETE = new Set(["cascade", "restrict", "set null", "no action"]);

function fkClause(srcTable: string, col: MColumn): string {
  if (!col.references) return "";
  const fkName = `fk_${srcTable}_${safeIdent(col.name)}`;
  const refTable = safeIdent(col.references.table);
  const refCol = safeIdent(col.references.column || "id");
  const onDelete = (col.references.onDelete || "cascade").toLowerCase();
  if (!VALID_ON_DELETE.has(onDelete)) {
    throw new Error(`Invalid ON DELETE action: ${col.references.onDelete}`);
  }
  // Use DROP+ADD for idempotency (ADD CONSTRAINT has no IF NOT EXISTS).
  return [
    `ALTER TABLE public.${srcTable} DROP CONSTRAINT IF EXISTS ${fkName};`,
    `ALTER TABLE public.${srcTable} ADD CONSTRAINT ${fkName} ` +
      `FOREIGN KEY (${safeIdent(col.name)}) ` +
      `REFERENCES public.${refTable}(${refCol}) ON DELETE ${onDelete.toUpperCase()};`,
  ].join("\n");
}

function colDef(c: MColumn): string {
  const name = safeIdent(c.name);
  const type = PG_TYPE[c.type];
  if (!type) throw new Error(`Unsupported column type: ${c.type}`);
  const nullable = c.nullable === false ? " NOT NULL" : "";
  const def = c.default ? ` DEFAULT ${safeDefault(c.default)}` : "";
  const uniq = c.unique ? " UNIQUE" : "";
  return `  ${name} ${type}${nullable}${def}${uniq}`;
}

/**
 * Turn a parsed backend spec into idempotent SQL safe to re-apply.
 *
 * Production guarantees:
 *   - CREATE TABLE IF NOT EXISTS for first-run safety.
 *   - ALTER TABLE ADD COLUMN IF NOT EXISTS for schema evolution on re-apply.
 *   - DROP POLICY/CONSTRAINT IF EXISTS before each CREATE for idempotency.
 *   - All identifiers regex-validated via safeIdent.
 *   - All DEFAULT expressions whitelisted via safeDefault (SQL-injection safe).
 *   - RLS enabled with per-op policies (S/I/U/D) on owner tables.
 *   - FK constraints with explicit ON DELETE.
 *   - Indexes (CREATE INDEX IF NOT EXISTS) for query performance.
 *   - updated_at trigger using SET search_path = public (search-path attack safe).
 *
 * Validates inter-table references (FK targets must exist in the spec) before
 * emitting anything — fail fast on bad input.
 */
export function generateBackendSQL(backend: MBackend): string {
  const tables = backend.tables ?? [];
  const buckets = backend.storage ?? [];
  const fns = backend.functions ?? [];
  if (tables.length === 0 && buckets.length === 0 && fns.length === 0) return "";
  if (tables.length > 32) {
    throw new Error(`Too many tables (${tables.length}). Max 32.`);
  }
  if (buckets.length > 6) {
    throw new Error(`Too many storage buckets (${buckets.length}). Max 6.`);
  }
  if (fns.length > 8) {
    throw new Error(`Too many Postgres functions (${fns.length}). Max 8.`);
  }

  // Pre-validate FK targets — fail fast rather than emit broken SQL.
  const tableNames = new Set(tables.map((t) => t.name.toLowerCase()));
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.references && !tableNames.has(c.references.table.toLowerCase())) {
        throw new Error(
          `Column ${t.name}.${c.name} references unknown table "${c.references.table}".`,
        );
      }
    }
  }

  const out: string[] = [];

  // Phase 1 — CREATE TABLEs with full base column set (idempotent).
  for (const t of tables) {
    const tname = safeIdent(t.name);
    const hasUserId = t.columns.some((c) => c.name.toLowerCase() === "user_id");
    const hasId = t.columns.some((c) => c.name.toLowerCase() === "id");

    const baseCols: string[] = [];
    if (!hasId) baseCols.push(`  id uuid PRIMARY KEY DEFAULT gen_random_uuid()`);
    if ((t.rls ?? "owner") === "owner" && !hasUserId) {
      baseCols.push(`  user_id uuid NOT NULL DEFAULT auth.uid()`);
    }
    const userCols = t.columns.map(colDef);
    const tail = [
      `  created_at timestamptz NOT NULL DEFAULT now()`,
      `  updated_at timestamptz NOT NULL DEFAULT now()`,
    ];

    out.push(
      `CREATE TABLE IF NOT EXISTS public.${tname} (\n${[...baseCols, ...userCols, ...tail].join(",\n")}\n);`,
    );
  }

  // Phase 2 — ADD COLUMN IF NOT EXISTS for schema evolution on re-apply.
  // CREATE TABLE IF NOT EXISTS is a no-op when the table already exists, so
  // any column the AI adds on a later run would otherwise be silently dropped.
  //
  // Constraints (NOT NULL / UNIQUE) are deliberately omitted here: existing
  // rows in a pre-existing table may not satisfy them, and `auth.uid()` in a
  // Management-API DDL context evaluates to NULL — combining NOT NULL with
  // that default rejects with "contains null values". Phase 1's CREATE TABLE
  // already enforces NOT NULL on truly new tables; tightening constraints on
  // existing-row tables is left for a follow-up backfill the operator runs
  // manually after a data audit.
  out.push("");
  out.push("-- Schema evolution: add columns that may not exist yet.");
  for (const t of tables) {
    const tname = safeIdent(t.name);
    if ((t.rls ?? "owner") === "owner") {
      const hasUserId = t.columns.some((c) => c.name.toLowerCase() === "user_id");
      if (!hasUserId) {
        out.push(
          `ALTER TABLE public.${tname} ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();`,
        );
      }
    }
    for (const c of t.columns) {
      const name = safeIdent(c.name);
      const type = PG_TYPE[c.type];
      const def = c.default ? ` DEFAULT ${safeDefault(c.default)}` : "";
      out.push(
        `ALTER TABLE public.${tname} ADD COLUMN IF NOT EXISTS ${name} ${type}${def};`,
      );
    }
  }

  // Phase 3 — RLS on every table.
  out.push("");
  for (const t of tables) {
    const tname = safeIdent(t.name);
    out.push(`ALTER TABLE public.${tname} ENABLE ROW LEVEL SECURITY;`);
    const rls = t.rls ?? "owner";
    if (rls === "owner") {
      for (const op of ["select", "insert", "update", "delete"] as const) {
        const polName = `${tname}_own_${op}`;
        const usingClause =
          op === "insert"
            ? `WITH CHECK (auth.uid() = user_id)`
            : `USING (auth.uid() = user_id)`;
        out.push(`DROP POLICY IF EXISTS "${polName}" ON public.${tname};`);
        out.push(
          `CREATE POLICY "${polName}" ON public.${tname} FOR ${op.toUpperCase()} ${usingClause};`,
        );
      }
    } else if (rls === "public_read") {
      out.push(`DROP POLICY IF EXISTS "${tname}_public_read" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_public_read" ON public.${tname} FOR SELECT USING (true);`,
      );
    }
  }

  // Phase 4 — Foreign keys (after all tables exist so references resolve).
  const fkSql: string[] = [];
  for (const t of tables) {
    const tname = safeIdent(t.name);
    for (const c of t.columns) {
      if (c.references) fkSql.push(fkClause(tname, c));
    }
  }
  if (fkSql.length > 0) {
    out.push("");
    out.push("-- Foreign keys");
    out.push(fkSql.join("\n"));
  }

  // Phase 5 — Indexes for query performance.
  const idxSql: string[] = [];
  for (const t of tables) {
    const tname = safeIdent(t.name);
    // Auto-index every FK column (very common query pattern).
    for (const c of t.columns) {
      if (c.references) {
        const cname = safeIdent(c.name);
        idxSql.push(
          `CREATE INDEX IF NOT EXISTS idx_${tname}_${cname} ON public.${tname} (${cname});`,
        );
      }
    }
    // Auto-index user_id on owner tables (RLS predicate uses it on every row).
    if ((t.rls ?? "owner") === "owner") {
      idxSql.push(
        `CREATE INDEX IF NOT EXISTS idx_${tname}_user_id ON public.${tname} (user_id);`,
      );
    }
    // Spec-provided indexes.
    for (const idx of t.indexes ?? []) {
      if (!idx.columns?.length) continue;
      const cols = idx.columns.map(safeIdent);
      const prefix = idx.unique ? "uniq" : "idx";
      const name = `${prefix}_${tname}_${cols.join("_")}`.slice(0, 63);
      const uniq = idx.unique ? "UNIQUE " : "";
      idxSql.push(
        `CREATE ${uniq}INDEX IF NOT EXISTS ${name} ON public.${tname} (${cols.join(", ")});`,
      );
    }
  }
  if (idxSql.length > 0) {
    out.push("");
    out.push("-- Indexes");
    out.push(idxSql.join("\n"));
  }

  // Phase 6 — updated_at trigger function + per-table trigger.
  if (tables.length > 0) {
    out.push("");
    out.push("-- updated_at trigger");
    out.push(`CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;`);
    for (const t of tables) {
      const tname = safeIdent(t.name);
      out.push(`DROP TRIGGER IF EXISTS ${tname}_set_updated_at ON public.${tname};`);
      out.push(
        `CREATE TRIGGER ${tname}_set_updated_at BEFORE UPDATE ON public.${tname} FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();`,
      );
    }
  }

  // Phase 7 — Storage buckets (idempotent via `INSERT ... ON CONFLICT`).
  if (buckets.length > 0) {
    out.push("");
    out.push("-- Storage buckets + per-bucket RLS");
    for (const b of buckets) {
      out.push(generateBucketSQL(b));
    }
  }

  // Phase 8 — Postgres functions (RPCs the architect proposes).
  if (fns.length > 0) {
    out.push("");
    out.push("-- Postgres functions / RPCs");
    for (const f of fns) {
      out.push(generatePgFunctionSQL(f));
    }
  }

  return out.join("\n");
}

// ─── Storage buckets ────────────────────────────────────────────────────────

const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const MIME_RE = /^[a-z0-9.+-]+\/[a-z0-9.+*-]+$/i;

function safeBucketName(name: string): string {
  if (!BUCKET_NAME_RE.test(name)) {
    throw new Error(
      `Invalid bucket name: "${name}". Must be lowercase alphanumeric + hyphens, 3-63 chars, not starting/ending with a hyphen.`,
    );
  }
  return name;
}

function safeMime(m: string): string {
  if (!MIME_RE.test(m)) throw new Error(`Invalid MIME type: "${m}"`);
  return m;
}

function pgStringLiteral(s: string): string {
  // PostgreSQL string literal: single-quote and escape embedded single quotes.
  return "'" + s.replace(/'/g, "''") + "'";
}

/**
 * Emit idempotent SQL to create/update a storage bucket and its RLS policies.
 *
 * Policy semantics:
 *   - `public: true`  → SELECT allowed for anyone (anon + authenticated).
 *   - `public: false` → SELECT allowed only when the object's first folder
 *     segment matches `auth.uid()::text`. Upload allowed when the inserter
 *     places the object under their own UID folder.
 *
 * Path convention enforced: `<bucket>/<auth.uid()>/<rest...>`.
 */
export function generateBucketSQL(b: MStorageBucket): string {
  const name = safeBucketName(b.bucket);
  const isPublic = b.public === true;
  const fileSizeLimit =
    typeof b.fileSizeLimit === "number" && b.fileSizeLimit > 0
      ? Math.min(b.fileSizeLimit, 100 * 1024 * 1024) // hard cap 100 MiB
      : 10 * 1024 * 1024;
  const mimes = (b.allowedMimeTypes ?? []).map(safeMime);
  const mimeArray =
    mimes.length > 0
      ? `ARRAY[${mimes.map(pgStringLiteral).join(", ")}]::text[]`
      : "NULL";

  const lines: string[] = [];

  // Upsert the bucket row. storage.buckets has a stable schema in Supabase.
  lines.push(
    `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) ` +
      `VALUES (${pgStringLiteral(name)}, ${pgStringLiteral(name)}, ${isPublic}, ${fileSizeLimit}, ${mimeArray}) ` +
      `ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;`,
  );

  // Per-bucket RLS policies on storage.objects (idempotent via DROP IF EXISTS).
  const selectPol = `${name}_read`;
  const insertPol = `${name}_insert_own`;
  const updatePol = `${name}_update_own`;
  const deletePol = `${name}_delete_own`;

  const inBucket = `bucket_id = ${pgStringLiteral(name)}`;
  const ownerFolder = `(storage.foldername(name))[1] = auth.uid()::text`;

  const selectUsing = isPublic ? inBucket : `${inBucket} AND ${ownerFolder}`;

  lines.push(`DROP POLICY IF EXISTS "${selectPol}" ON storage.objects;`);
  lines.push(
    `CREATE POLICY "${selectPol}" ON storage.objects FOR SELECT USING (${selectUsing});`,
  );

  // INSERT/UPDATE/DELETE always require ownership of the path's first folder,
  // even for public buckets — otherwise any authenticated user could overwrite
  // anyone else's objects.
  lines.push(`DROP POLICY IF EXISTS "${insertPol}" ON storage.objects;`);
  lines.push(
    `CREATE POLICY "${insertPol}" ON storage.objects FOR INSERT WITH CHECK (${inBucket} AND ${ownerFolder});`,
  );
  lines.push(`DROP POLICY IF EXISTS "${updatePol}" ON storage.objects;`);
  lines.push(
    `CREATE POLICY "${updatePol}" ON storage.objects FOR UPDATE USING (${inBucket} AND ${ownerFolder});`,
  );
  lines.push(`DROP POLICY IF EXISTS "${deletePol}" ON storage.objects;`);
  lines.push(
    `CREATE POLICY "${deletePol}" ON storage.objects FOR DELETE USING (${inBucket} AND ${ownerFolder});`,
  );

  return lines.join("\n");
}

// ─── Postgres functions / RPCs ──────────────────────────────────────────────

/**
 * Whitelist of return types. Anything outside this list is rejected.
 * `TABLE(col type, ...)` is parsed and each inner type checked recursively.
 */
const RETURN_TYPE_BASE = new Set([
  "void",
  "int",
  "int2",
  "int4",
  "int8",
  "bigint",
  "smallint",
  "integer",
  "text",
  "boolean",
  "bool",
  "uuid",
  "jsonb",
  "json",
  "timestamptz",
  "timestamp",
  "date",
  "numeric",
  "float",
  "real",
  "double precision",
  "double",
]);

function safeReturnType(rt: string): string {
  const trimmed = rt.trim();
  const lower = trimmed.toLowerCase();
  if (RETURN_TYPE_BASE.has(lower)) return lower;
  // TABLE(name1 type1, name2 type2, ...)
  const tableMatch = /^TABLE\s*\(\s*(.+?)\s*\)$/i.exec(trimmed);
  if (tableMatch) {
    const cols = tableMatch[1].split(",").map((c) => c.trim());
    const safe = cols.map((c) => {
      const parts = c.split(/\s+/);
      if (parts.length < 2) throw new Error(`Bad TABLE col: "${c}"`);
      const colName = safeIdent(parts[0]);
      const colType = safeReturnType(parts.slice(1).join(" "));
      return `${colName} ${colType}`;
    });
    return `TABLE(${safe.join(", ")})`;
  }
  // SETOF <type>
  const setofMatch = /^SETOF\s+(.+)$/i.exec(trimmed);
  if (setofMatch) return `SETOF ${safeReturnType(setofMatch[1])}`;
  throw new Error(
    `Unsupported function return type: "${rt}". Allowed: ${Array.from(RETURN_TYPE_BASE).join(", ")}, plus TABLE(...) and SETOF.`,
  );
}

/**
 * Validate args: a comma-separated list of `name type [DEFAULT expr]` clauses.
 * Each name is a snake_case identifier; types are checked via safeReturnType;
 * DEFAULTs are checked via safeDefault. Reject anything outside this grammar.
 */
function safeFunctionArgs(args: string | undefined): string {
  if (!args || !args.trim()) return "";
  const parts = args.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    // Allow IN/OUT/INOUT prefix (rare but valid in Postgres).
    const mode = /^(IN|OUT|INOUT)\b\s+/i.exec(p);
    let rest = mode ? p.slice(mode[0].length) : p;
    const defMatch = /\s+DEFAULT\s+(.+)$/i.exec(rest);
    const def = defMatch ? safeDefault(defMatch[1]) : null;
    if (defMatch) rest = rest.slice(0, defMatch.index);
    const tokens = rest.split(/\s+/);
    if (tokens.length < 2) throw new Error(`Bad function arg: "${p}"`);
    const argName = safeIdent(tokens[0]);
    const argType = safeReturnType(tokens.slice(1).join(" "));
    const modePrefix = mode ? mode[1].toUpperCase() + " " : "";
    out.push(modePrefix + argName + " " + argType + (def ? ` DEFAULT ${def}` : ""));
  }
  return out.join(", ");
}

/**
 * Validate a plpgsql function body. The body is wrapped in a tagged
 * dollar-quote (`$mvbl$ ... $mvbl$`), so the only way to escape is to embed
 * the matching tag inside the body. We forbid that, plus a handful of
 * obviously-destructive top-level statements an honest function shouldn't
 * need (DROP SCHEMA, ALTER ROLE, CREATE ROLE, GRANT ALL, etc).
 *
 * This is a guardrail, not a sandbox — SECURITY DEFINER funcs still need a
 * code review before exposure.
 */
const DOLLAR_TAG = "mvbl";

function safeFunctionBody(body: string): string {
  if (body.includes("$" + DOLLAR_TAG + "$")) {
    throw new Error(
      `Function body may not contain the dollar-quote tag $${DOLLAR_TAG}$ (used to delimit the body).`,
    );
  }
  const upper = body.toUpperCase();
  const forbidden = [
    "DROP SCHEMA",
    "DROP DATABASE",
    "DROP ROLE",
    "DROP USER",
    "CREATE ROLE",
    "CREATE USER",
    "ALTER ROLE",
    "ALTER SYSTEM",
    "GRANT ALL",
    "REVOKE ALL",
    "COPY ",
    "pg_read_file",
    "pg_read_binary_file",
    "lo_import",
    "lo_export",
  ];
  for (const term of forbidden) {
    if (upper.includes(term.toUpperCase())) {
      throw new Error(`Function body contains forbidden statement: "${term}"`);
    }
  }
  return body;
}

export function generatePgFunctionSQL(f: MPgFunction): string {
  const name = safeIdent(f.name);
  const args = safeFunctionArgs(f.args);
  const returns = safeReturnType(f.returns);
  const body = safeFunctionBody(f.body);
  const security = f.securityDefiner ? "SECURITY DEFINER" : "SECURITY INVOKER";
  return [
    `CREATE OR REPLACE FUNCTION public.${name}(${args}) RETURNS ${returns}`,
    `LANGUAGE plpgsql ${security} SET search_path = public AS $${DOLLAR_TAG}$`,
    body,
    `$${DOLLAR_TAG}$;`,
  ].join("\n");
}

/**
 * Best-effort extract a JSON object from an LLM response, then pull out the
 * shape we care about. The agent system has both database_architect and
 * backend_developer emitting JSON (per agents.ts), but historical runs and
 * future LLM drift can both produce noise (code fences, prose). We accept the
 * first balanced JSON object and ignore anything that doesn't shape-match.
 *
 * Returns null when no JSON-looking content is found; otherwise returns the
 * partial MBackend with only the keys the LLM provided. Downstream validation
 * (generateBackendSQL for tables/functions/storage; deployEdgeFunctions for
 * edge_functions) catches malformed values.
 */
export function parseBackendSpecFromText(text: string): Partial<MBackend> | null {
  if (!text) return null;
  // Strip ```json ... ``` fences if present so the JSON regex finds the body.
  const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const out: Partial<MBackend> = {};
  if (Array.isArray(obj.tables)) out.tables = obj.tables as MTable[];
  if (Array.isArray(obj.functions)) out.functions = obj.functions as MPgFunction[];
  if (Array.isArray(obj.storage)) out.storage = obj.storage as MStorageBucket[];
  if (Array.isArray(obj.edge_functions)) {
    out.edge_functions = obj.edge_functions as MEdgeFunction[];
  }
  if (obj.auth && typeof obj.auth === "object") {
    out.auth = obj.auth as MBackend["auth"];
  }
  if (typeof obj.push === "boolean") out.push = obj.push;
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Merge two backend spec partials by domain ownership: the database architect
 * owns tables/functions; the backend developer owns auth/storage/edge_functions/push.
 * On conflict, the owner wins; the other party's values are silently dropped.
 */
export function mergeBackendSpec(
  fromArchitect: Partial<MBackend> | null,
  fromDeveloper: Partial<MBackend> | null,
): MBackend {
  const merged: MBackend = {};
  if (fromArchitect?.tables) merged.tables = fromArchitect.tables;
  if (fromArchitect?.functions) merged.functions = fromArchitect.functions;
  if (fromDeveloper?.auth) merged.auth = fromDeveloper.auth;
  if (fromDeveloper?.storage) merged.storage = fromDeveloper.storage;
  if (fromDeveloper?.edge_functions) merged.edge_functions = fromDeveloper.edge_functions;
  if (typeof fromDeveloper?.push === "boolean") merged.push = fromDeveloper.push;
  return merged;
}

/**
 * Dry-run validation of the SQL-emitting parts of a backend spec. Returns
 * `{ ok: true }` if generateBackendSQL succeeds; `{ ok: false, error }`
 * otherwise. Use this to gate persistence of LLM-emitted specs.
 */
export function validateBackendSpec(
  backend: MBackend,
): { ok: true } | { ok: false; error: string } {
  try {
    generateBackendSQL(backend);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Use AI to infer a backend.tables spec from an existing app schema. */
const INFER_PROMPT = `You are a database architect. Given a mobile app's UI schema (screens with lists, forms, cards), infer the Postgres tables needed to back this app.

Return ONLY valid JSON matching:
{
  "tables": [
    {
      "name": "snake_case_plural",
      "rls": "owner" | "public_read" | "none",
      "columns": [
        {
          "name": "snake_case",
          "type": "text" | "int" | "float" | "bool" | "timestamp" | "jsonb" | "uuid",
          "nullable": true | false,
          "default": "now()" | "gen_random_uuid()" | "auth.uid()" | "true" | "false" | "null" | numeric | "'string'",
          "unique": true,
          "references": { "table": "other_table", "column": "id", "onDelete": "cascade" | "restrict" | "set null" | "no action" }
        }
      ],
      "indexes": [
        { "columns": ["col_a", "col_b"], "unique": true }
      ]
    }
  ]
}

Rules:
- Default rls to "owner" unless the data is clearly public (e.g. a catalog).
- DO NOT include id, user_id, created_at, updated_at — those are added automatically.
- For every FK-style column (e.g. \`<other>_id uuid NOT NULL\`), include a "references" block. FK targets must be another table in this spec.
- Add "indexes" for any column tuple a screen will sort/filter by (e.g. \`logged_date DESC\` queries → index on \`logged_date\`; lookups by status + date → composite index). FK columns and user_id are auto-indexed; don't repeat those.
- Use \`default\` only when meaningful (timestamps default to now(), uuid PKs not needed). Allowed defaults: now(), gen_random_uuid(), auth.uid(), numeric/boolean/null literals, simple quoted strings.
- Use short, sensible column names. Prefer text over enums (Postgres enums are hard to evolve).
- Maximum 8 tables, maximum 12 columns per table.
- Return ONLY JSON, no prose, no markdown, no leading/trailing whitespace.`;

export const inferBackendSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error } = await supabase
      .from("projects")
      .select("result, model")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error || !proj?.result) {
      return { ok: false as const, error: "Project schema not found. Generate the app first." };
    }

    // Parse out the schema JSON from project.result (which often wraps it).
    let schema: MobileAppSchema | null = null;
    try {
      const match = proj.result.match(/\{[\s\S]*\}/);
      if (match) schema = JSON.parse(match[0]);
    } catch {
      // ignore
    }
    const summary = schema
      ? JSON.stringify({
          name: schema.name,
          screens: schema.screens?.map((s) => ({
            id: s.id,
            title: s.title,
            elementTypes: s.elements?.map((e) => e.type),
          })),
        })
      : proj.result.slice(0, 4000);

    try { await consumeOrThrow(userId, CREDIT_COSTS.text, "backend.infer_spec", data.projectId); }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
    const ai = await callAI(INFER_PROMPT, summary, proj.model || "google/gemini-2.5-flash");
    if (!ai.ok) return { ok: false as const, error: ai.error };

    let parsed: { tables?: MTable[] } | null = null;
    try {
      const m = ai.text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      return { ok: false as const, error: "AI returned invalid JSON" };
    }
    if (!parsed?.tables?.length) {
      return { ok: false as const, error: "No tables inferred" };
    }

    // Persist into projects.backend_spec
    await supabase
      .from("projects")
      .update({ backend_spec: { tables: parsed.tables } })
      .eq("id", data.projectId);

    return { ok: true as const, backend: { tables: parsed.tables } };
  });

/** Apply the saved backend spec to the user's own Supabase via Management API. */
export const applyBackendSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        managementToken: z.string().min(20).max(500),
        projectRef: z
          .string()
          .min(15)
          .max(40)
          .regex(/^[a-z0-9]+$/i, "Project ref must be alphanumeric"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error } = await supabase
      .from("projects")
      .select("backend_spec")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const backend = (proj?.backend_spec ?? {}) as MBackend;
    if (!backend.tables?.length) {
      return { ok: false as const, error: "No backend spec. Generate the data model first." };
    }

    let sql: string;
    try {
      sql = generateBackendSQL(backend);
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "SQL generation failed",
      };
    }

    // Run via Supabase Management API
    let res: Response;
    try {
      res = await fetch(
        `https://api.supabase.com/v1/projects/${data.projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.managementToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        },
      );
    } catch (e) {
      return {
        ok: false as const,
        error: `Could not reach the Supabase Management API: ${e instanceof Error ? e.message : "network error"}.`,
      };
    }

    const body = await res.text();

    // `version` is a `bigint` column (see 20260528120000_*.sql); Date.now()
    // (millisecond epoch, ~1.78e12) fits comfortably and gives a monotonically
    // increasing version number for the audit trail. The earlier `integer`
    // column silently rejected every insert with "value out of range".
    const versionStamp = Date.now();

    if (!res.ok) {
      // Persist failure for the user's audit trail. Capture the full upstream
      // body server-side (truncated) but only surface a sanitized message to
      // the client.
      await supabase
        .from("project_migrations")
        .insert({
          project_id: data.projectId,
          user_id: userId,
          version: versionStamp,
          name: "apply_backend_schema",
          sql,
          error_text: `HTTP ${res.status}: ${body.slice(0, 4000)}`,
        })
        .then(({ error: insErr }) => {
          if (insErr) console.error("[applyBackendSchema] migration log failed:", insErr.message);
        });

      return {
        ok: false as const,
        error: friendlyApplyError(res.status, body),
      };
    }

    await supabase
      .from("project_migrations")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        version: versionStamp,
        name: "apply_backend_schema",
        sql,
        applied_at: new Date().toISOString(),
      })
      .then(({ error: insErr }) => {
        if (insErr) console.error("[applyBackendSchema] migration log failed:", insErr.message);
      });

    return { ok: true as const, sql, response: body.slice(0, 2000) };
  });

/**
 * Map an upstream Supabase Management API error into a user-actionable message.
 * Never echoes a raw upstream JWT/error body — that's logged server-side via
 * project_migrations.error_text instead.
 */
function friendlyApplyError(status: number, body: string): string {
  const snippet = body.toLowerCase();
  if (status === 401 || /jwt|unauth/i.test(snippet)) {
    return "Supabase rejected the Management API token. Double-check the PAT is valid, has not expired, and that you copied it without surrounding whitespace.";
  }
  if (status === 403 || /forbid|permission/i.test(snippet)) {
    return "The Management API token doesn't have permission for this project. Make sure the PAT was issued in the same organization as the target project and has the `database` scope.";
  }
  if (status === 404 || /not.found|no project|invalid.project/i.test(snippet)) {
    return "Supabase couldn't find that project ref. Check the project ref (the subdomain of your project URL, e.g. `abcdefghijklmnop`).";
  }
  if (status === 429 || /rate|too many/i.test(snippet)) {
    return "Hit Supabase's rate limit on the Management API. Wait a minute and retry.";
  }
  if (status >= 500) {
    return `Supabase Management API is having trouble (HTTP ${status}). Retry in a moment — your spec has not been changed.`;
  }
  // Last resort: surface SQL-level errors (column/type/syntax issues) without
  // an upstream token leak. Errors at this layer come from the SQL we built,
  // so they're safe to show.
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const msg = parsed.message || parsed.error;
    if (msg) return `Supabase rejected the SQL: ${msg.slice(0, 240)}`;
  } catch {
    // body wasn't JSON
  }
  return `Supabase rejected the request (HTTP ${status}). See the migration log for details.`;
}

/** Read the saved backend spec for a project. */
export const getBackendSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: proj } = await supabase
      .from("projects")
      .select("backend_spec")
      .eq("id", data.projectId)
      .maybeSingle();
    const backend = (proj?.backend_spec ?? {}) as MBackend;
    return { ok: true as const, backend };
  });
