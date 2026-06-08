import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI, callAIStrong } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";
import { CODE_GEN_SYSTEM_PROMPT, DESIGN_BRIEF_SYSTEM_PROMPT, parseAppSchema } from "@/lib/code-gen";
import { validateAndFixSchema } from "./schema-validator";

const SYSTEM_PROMPT = CODE_GEN_SYSTEM_PROMPT;

export const generateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        designBrief: z.string().max(40_000).optional(),
      })
      .parse(input),
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
      try { await consumeOrThrow(userId, CREDIT_COSTS.generate_project, "generate_project", project.id); }
      catch (e) { return { ok: false as const, error: (e as Error).message }; }

      // ── PASS 1: design brief (palette, typography, mood, references, layouts) ──
      let brief: string;
      if (data.designBrief?.trim()) {
        brief = data.designBrief.trim();
      } else {
        const briefRes = await callAI(DESIGN_BRIEF_SYSTEM_PROMPT, project.prompt, project.model);
        brief = briefRes.ok ? briefRes.text.trim() : "";
      }

      // ── PASS 2: compose full schema with STRONG model for max quality ──
      // Always use the strongest available model (Pro/Sonnet/GPT-4o) for
      // schema generation, regardless of the user's selected model.
      // This ensures every app looks professional.
      const userPrompt = brief
        ? `USER REQUEST:\n${project.prompt}\n\nDESIGN BRIEF (follow strictly — derive theme.palette/typography/radius/spacing/motion from it; use each screen's "layout" and include its "keyPrimitives"; carry the mood into entrance + gesture choices):\n${brief}`
        : `${project.prompt}\n\nMake it PREMIUM quality — use glass-cards, parallax-heroes, gradient-mesh backgrounds, stat-card-xl with sparklines, and domain-appropriate typography. At least 4-5 screens with varied layouts (bento-grid, magazine, split-hero). Real data, not placeholders.`;

      const r = await callAIStrong(SYSTEM_PROMPT, userPrompt);

      if (!r.ok) {
        await supabase
          .from("projects")
          .update({ status: "failed", error_text: r.error })
          .eq("id", project.id);
        return { ok: false as const, error: r.error };
      }

      // Parse and validate the schema to auto-fix common issues
      const parsed = parseAppSchema(r.text);
      const finalResult = parsed ? JSON.stringify(parsed) : r.text;

      await supabase
        .from("projects")
        .update({ status: "ready", result: finalResult, error_text: null })
        .eq("id", project.id);

      return { ok: true as const, result: finalResult, cached: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown generation error";
      await supabase
        .from("projects")
        .update({ status: "failed", error_text: msg })
        .eq("id", project.id);
      return { ok: false as const, error: msg };
    }
  });
