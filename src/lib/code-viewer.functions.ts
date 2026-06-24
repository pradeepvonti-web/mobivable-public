import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAppSchema } from "@/lib/code-gen";
import { MONETIZATION_ENV_KEYS, exportToExpo } from "@/lib/export-project";
import type { ExportOptions } from "@/lib/export-project";
import type { MobileAppSchema } from "@/lib/mobile-app-schema";

// ─── Helpers ────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".tsx": "tsx",
  ".ts": "typescript",
  ".js": "javascript",
  ".jsx": "jsx",
  ".json": "json",
  ".md": "markdown",
  ".env": "env",
};

function languageFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return "text";
  const ext = filePath.slice(dot).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

// ─── getProjectFiles ────────────────────────────────────────────

export const getProjectFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load the project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, name, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projErr || !project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found" };
    }

    // ── Load any user overrides (ws_write_file mirrored files) ──
    const { data: overrides } = await supabase
      .from("project_file_overrides")
      .select("file_path, content")
      .eq("project_id", data.projectId)
      .eq("user_id", userId);

    const overrideMap = new Map<string, string>(
      ((overrides ?? []) as { file_path: string; content: string }[]).map((o) => [o.file_path, o.content]),
    );

    // If no schema result but we have overrides from ws_write_file, show those directly
    if (!project.result) {
      if (overrideMap.size === 0) {
        return { ok: false as const, error: "No generated result found for this project" };
      }
      // Return override files directly (from Expo build)
      const files = Array.from(overrideMap.entries()).map(([path, content]) => ({
        path,
        content,
        language: languageFromPath(path),
        isOverridden: true,
      }));
      return { ok: true as const, files };
    }

    // Parse schema from the stored result JSON
    const schema = parseAppSchema(
      typeof project.result === "string"
        ? project.result
        : JSON.stringify(project.result),
    );

    if (!schema) {
      // Even if schema parse fails, show overrides if available
      if (overrideMap.size > 0) {
        const files = Array.from(overrideMap.entries()).map(([path, content]) => ({
          path,
          content,
          language: languageFromPath(path),
          isOverridden: true,
        }));
        return { ok: true as const, files };
      }
      return { ok: false as const, error: "Failed to parse project schema" };
    }

    // Load integrations for Supabase options
    const { data: integ } = await supabase
      .from("project_integrations")
      .select("supabase_url, supabase_anon_key")
      .eq("project_id", data.projectId)
      .maybeSingle();

    // Load monetization config from project_env_vars (export-safe allow-list).
    const { data: monRows } = await supabase
      .from("project_env_vars")
      .select("name, value")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .in("name", MONETIZATION_ENV_KEYS as readonly string[] as string[]);
    let monetizationProvider: string | undefined;
    const monetizationKeys: Record<string, string> = {};
    for (const r of (monRows ?? []) as Array<{ name: string; value: string }>) {
      if (typeof r.value !== "string") continue;
      if (r.name === "monetization_provider") {
        monetizationProvider = r.value || undefined;
      } else {
        monetizationKeys[r.name] = r.value;
      }
    }

    const options: ExportOptions | undefined =
      integ?.supabase_url || monetizationProvider
        ? {
            ...(integ?.supabase_url
              ? {
                  supabaseUrl: integ.supabase_url,
                  supabaseAnonKey: integ.supabase_anon_key ?? undefined,
                }
              : {}),
            ...(monetizationProvider
              ? {
                  monetizationProvider,
                  monetizationKeys,
                }
              : {}),
          }
        : undefined;

    // Generate the Expo project files
    const exportedFiles = exportToExpo(schema as MobileAppSchema, options);

    // Build the final file list, merging overrides
    const files = exportedFiles.map((f) => ({
      path: f.path,
      content: overrideMap.get(f.path) ?? f.content,
      language: languageFromPath(f.path),
      isOverridden: overrideMap.has(f.path),
    }));

    // Also add any override files that aren't in the schema export
    for (const [path, content] of overrideMap) {
      if (!exportedFiles.some((f) => f.path === path)) {
        files.push({ path, content, language: languageFromPath(path), isOverridden: true });
      }
    }

    return { ok: true as const, files };
  });

// ─── saveFileOverride ───────────────────────────────────────────

export const saveFileOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        filePath: z.string().min(1),
        content: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found" };
    }

    const { error } = await supabase
      .from("project_file_overrides")
      .upsert(
        {
          project_id: data.projectId,
          user_id: userId,
          file_path: data.filePath,
          content: data.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,file_path" },
      );

    if (error) {
      return { ok: false as const, error: error.message };
    }

    return { ok: true as const };
  });

// ─── deleteFileOverride ─────────────────────────────────────────

export const deleteFileOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        filePath: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found" };
    }

    const { error } = await supabase
      .from("project_file_overrides")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .eq("file_path", data.filePath);

    if (error) {
      return { ok: false as const, error: error.message };
    }

    return { ok: true as const };
  });
