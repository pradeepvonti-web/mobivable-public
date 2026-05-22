import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";
import { CODE_GEN_SYSTEM_PROMPT, DESIGN_BRIEF_SYSTEM_PROMPT } from "@/lib/code-gen";

const SYSTEM_PROMPT = CODE_GEN_SYSTEM_PROMPT;

export const generateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: fetchErr } = await supabase
      .from("projects")
      .select("id, prompt, model, status, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (fetchErr) return { ok: false as const, error: fetchErr.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };

    // Idempotent: already generated.
    if (project.status === "ready" && project.result) {
      return { ok: true as const, result: project.result, cached: true };
    }

    try {
      const r = await callAI(SYSTEM_PROMPT, project.prompt, project.model);

      if (!r.ok) {
        await supabase
          .from("projects")
          .update({ status: "failed", error_text: r.error })
          .eq("id", project.id);
        return { ok: false as const, error: r.error };
      }

      await supabase
        .from("projects")
        .update({ status: "ready", result: r.text, error_text: null })
        .eq("id", project.id);

      return { ok: true as const, result: r.text, cached: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown generation error";
      await supabase
        .from("projects")
        .update({ status: "failed", error_text: msg })
        .eq("id", project.id);
      return { ok: false as const, error: msg };
    }
  });
