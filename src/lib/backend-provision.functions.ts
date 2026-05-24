/**
 * Per-project backend provisioning.
 * Users provide their own Supabase Management API PAT (Personal Access Token).
 * We generate SQL from the app schema and apply it to their Supabase project.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MBackend, MColumn, MTable, MobileAppSchema } from "./mobile-app-schema";
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
  return lower;
}

function colDef(c: MColumn): string {
  const name = safeIdent(c.name);
  const type = PG_TYPE[c.type];
  if (!type) throw new Error(`Unsupported column type: ${c.type}`);
  const nullable = c.nullable === false ? " NOT NULL" : "";
  const def = c.default ? ` DEFAULT ${c.default}` : "";
  return `  ${name} ${type}${nullable}${def}`;
}

/** Turn a parsed backend spec into idempotent SQL. */
export function generateBackendSQL(backend: MBackend): string {
  const tables = backend.tables ?? [];
  const out: string[] = [];

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
    out.push(`ALTER TABLE public.${tname} ENABLE ROW LEVEL SECURITY;`);

    const rls = t.rls ?? "owner";
    if (rls === "owner") {
      out.push(`DROP POLICY IF EXISTS "${tname}_own_select" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_own_select" ON public.${tname} FOR SELECT USING (auth.uid() = user_id);`,
      );
      out.push(`DROP POLICY IF EXISTS "${tname}_own_insert" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_own_insert" ON public.${tname} FOR INSERT WITH CHECK (auth.uid() = user_id);`,
      );
      out.push(`DROP POLICY IF EXISTS "${tname}_own_update" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_own_update" ON public.${tname} FOR UPDATE USING (auth.uid() = user_id);`,
      );
      out.push(`DROP POLICY IF EXISTS "${tname}_own_delete" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_own_delete" ON public.${tname} FOR DELETE USING (auth.uid() = user_id);`,
      );
    } else if (rls === "public_read") {
      out.push(`DROP POLICY IF EXISTS "${tname}_public_read" ON public.${tname};`);
      out.push(
        `CREATE POLICY "${tname}_public_read" ON public.${tname} FOR SELECT USING (true);`,
      );
    }
    out.push(""); // spacer
  }

  // updated_at trigger function (idempotent)
  if (tables.length > 0) {
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

  return out.join("\n");
}

/** Use AI to infer a backend.tables spec from an existing app schema. */
const INFER_PROMPT = `You are a database architect. Given a mobile app's UI schema (screens with lists, forms, cards), infer the Postgres tables needed to back this app.

Rules:
- Return ONLY valid JSON matching: { "tables": [{ "name": "snake_case_plural", "columns": [{ "name": "snake_case", "type": "text|int|float|bool|timestamp|jsonb|uuid", "nullable": true|false }], "rls": "owner"|"public_read"|"none" }] }
- Default rls to "owner" unless the data is clearly public (e.g. a catalog).
- DO NOT include id, user_id, created_at, updated_at — those are added automatically.
- Use short, sensible column names. Prefer text over enums.
- Maximum 8 tables, maximum 12 columns per table.
- Return ONLY JSON, no prose, no markdown.`;

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
    const res = await fetch(
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

    const body = await res.text();
    if (!res.ok) {
      // Persist failure
      await supabase.from("project_migrations").insert({
        project_id: data.projectId,
        user_id: userId,
        version: Date.now(),
        name: "apply_backend_schema",
        sql,
        error_text: `HTTP ${res.status}: ${body.slice(0, 1000)}`,
      });
      return {
        ok: false as const,
        error: `Supabase API ${res.status}: ${body.slice(0, 500)}`,
      };
    }

    await supabase.from("project_migrations").insert({
      project_id: data.projectId,
      user_id: userId,
      version: Date.now(),
      name: "apply_backend_schema",
      sql,
      applied_at: new Date().toISOString(),
    });

    return { ok: true as const, sql, response: body.slice(0, 2000) };
  });

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
