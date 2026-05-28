/**
 * Per-project Supabase Edge Functions deploy pipeline.
 *
 * Reads MEdgeFunction[] from projects.backend_spec.edge_functions and
 * deploys each one to the user's own Supabase project via the Management
 * API multipart /functions/deploy endpoint.
 *
 * Mirrors applyBackendSchema in:
 *   - per-call PAT (never persisted)
 *   - sanitized friendly errors (no upstream JWT leakage)
 *   - audit log row per deploy in project_migrations
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MBackend, MEdgeFunction } from "./mobile-app-schema";

const SLUG_RE = /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;

/** Hard cap on edge function source size — 256 KiB. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Forbidden import prefixes. Supabase Edge runtime is Deno; node-only modules
 * fail at boot. Block them server-side so we don't ship a broken function and
 * eat a Management API call.
 */
const FORBIDDEN_IMPORT_PREFIXES = [
  "node:", // node-only
  "npm:", // allowed by Deno but typically unbundled in Supabase prod
  "file:", // filesystem escape
];

function validateSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid edge function slug: "${slug}". Must be kebab-case, 3-63 chars, start with a letter, end with a letter or digit.`,
    );
  }
  return slug;
}

function validateCode(slug: string, code: string): void {
  const bytes = new TextEncoder().encode(code).length;
  if (bytes > MAX_BODY_BYTES) {
    throw new Error(
      `Edge function "${slug}" body is too large (${bytes} bytes, max ${MAX_BODY_BYTES}).`,
    );
  }
  // Look at each line; flag imports / dynamic imports / requires referencing
  // forbidden prefixes. Stay permissive on the comments/string content.
  const importRe = /import\s+[^;]*?from\s+['"]([^'"]+)['"]/g;
  const dynImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [importRe, dynImportRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1];
      for (const bad of FORBIDDEN_IMPORT_PREFIXES) {
        if (spec.startsWith(bad)) {
          throw new Error(
            `Edge function "${slug}" imports from "${spec}" — "${bad}" prefix is not supported in the Supabase Edge runtime.`,
          );
        }
      }
    }
  }
  if (code.includes("require(")) {
    throw new Error(
      `Edge function "${slug}" uses CommonJS require() — Edge runtime is ESM-only.`,
    );
  }
}

/** Map Management-API errors into friendly user-facing messages. */
function friendlyDeployError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || /jwt|unauth/.test(lower)) {
    return "Supabase rejected the Management API token. Generate a new PAT and retry.";
  }
  if (status === 403 || /forbid|permission/.test(lower)) {
    return "PAT doesn't have permission to deploy functions to this project.";
  }
  if (status === 404) {
    return "Project ref not found by the Management API.";
  }
  if (status === 413 || /payload too large|request entity/.test(lower)) {
    return "Edge function body exceeds the Supabase upload limit.";
  }
  if (status >= 500) {
    return `Supabase Functions API is having trouble (HTTP ${status}). Retry shortly.`;
  }
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const msg = parsed.message || parsed.error;
    if (msg) return `Supabase rejected the deploy: ${msg.slice(0, 240)}`;
  } catch {
    // not JSON
  }
  return `Supabase rejected the deploy (HTTP ${status}).`;
}

type DeployResult =
  | { slug: string; ok: true; version: number }
  | { slug: string; ok: false; error: string };

/** Deploy a single MEdgeFunction; throws if validation fails. */
async function deployOne(
  fn: MEdgeFunction,
  projectRef: string,
  managementToken: string,
): Promise<DeployResult> {
  const slug = validateSlug(fn.name);
  validateCode(slug, fn.code);

  const metadata = JSON.stringify({
    name: slug,
    entrypoint_path: "index.ts",
    verify_jwt: fn.verifyJwt !== false, // default true
  });

  const fd = new FormData();
  fd.append(
    "metadata",
    new Blob([metadata], { type: "application/json" }),
    "metadata.json",
  );
  fd.append(
    "file",
    new Blob([fn.code], { type: "application/typescript" }),
    "index.ts",
  );

  const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${encodeURIComponent(slug)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${managementToken}` },
      body: fd,
    });
  } catch (e) {
    return {
      slug,
      ok: false,
      error: `Network error reaching Supabase: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const body = await res.text();
  if (!res.ok) {
    return { slug, ok: false, error: friendlyDeployError(res.status, body) };
  }
  try {
    const parsed = JSON.parse(body) as { version?: number };
    return { slug, ok: true, version: parsed.version ?? 0 };
  } catch {
    return { slug, ok: true, version: 0 };
  }
}

export const deployEdgeFunctions = createServerFn({ method: "POST" })
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
    const fns = backend.edge_functions ?? [];
    if (fns.length === 0) {
      return { ok: false as const, error: "No edge functions in this project's spec." };
    }
    if (fns.length > 8) {
      return {
        ok: false as const,
        error: `Refusing to deploy ${fns.length} functions in one call. Max 8.`,
      };
    }

    const results: DeployResult[] = [];
    for (const fn of fns) {
      try {
        results.push(await deployOne(fn, data.projectRef, data.managementToken));
      } catch (e) {
        results.push({
          slug: fn.name,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const versionStamp = Date.now();
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    // Audit row. Mirrors applyBackendSchema's pattern.
    await supabase
      .from("project_migrations")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        version: versionStamp,
        name: "deploy_edge_functions",
        sql: JSON.stringify({ deployed: results }, null, 2),
        applied_at: failCount === 0 ? new Date().toISOString() : null,
        error_text: failCount > 0 ? `${failCount} of ${results.length} failed` : null,
      })
      .then(({ error: insErr }) => {
        if (insErr) {
          console.error("[deployEdgeFunctions] migration log failed:", insErr.message);
        }
      });

    return {
      ok: failCount === 0,
      results,
      summary: `${okCount} deployed, ${failCount} failed.`,
    };
  });

/** List currently deployed edge functions on the user's Supabase project. */
export const listEdgeFunctions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        managementToken: z.string().min(20).max(500),
        projectRef: z.string().min(15).max(40).regex(/^[a-z0-9]+$/i),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    let res: Response;
    try {
      res = await fetch(
        `https://api.supabase.com/v1/projects/${data.projectRef}/functions`,
        { headers: { Authorization: `Bearer ${data.managementToken}` } },
      );
    } catch (e) {
      return {
        ok: false as const,
        error: `Network error: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
    const body = await res.text();
    if (!res.ok) return { ok: false as const, error: friendlyDeployError(res.status, body) };
    try {
      const parsed = JSON.parse(body) as Array<{
        slug: string;
        name: string;
        verify_jwt: boolean;
        status: string;
        version: number;
        updated_at: number;
      }>;
      return {
        ok: true as const,
        functions: parsed.map((f) => ({
          slug: f.slug,
          name: f.name,
          verifyJwt: f.verify_jwt,
          status: f.status,
          version: f.version,
          updatedAt: f.updated_at,
        })),
      };
    } catch {
      return { ok: false as const, error: "Failed to parse Supabase response." };
    }
  });
