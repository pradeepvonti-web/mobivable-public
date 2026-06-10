import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI, callAIStrong } from "./ai-provider";
// Note: callAIStrong forces the highest-tier model (Opus/Pro/GPT-4o) and is
// 3-5x slower than the user's selected model. Only use it when premium=true.
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
        premium: z.boolean().optional().default(false),
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

      // ── PASSES 1 + 2 IN PARALLEL ──
      // Run the design brief and a first-pass schema draft concurrently.
      // The draft uses the raw prompt only; once the brief lands we do a
      // merge pass that aligns the draft to the brief's palette / typography
      // / layouts. This cuts wall-time vs. the old strictly-sequential flow
      // because the slow code-gen call starts before the brief finishes.
      const briefPromise: Promise<string> = data.designBrief?.trim()
        ? Promise.resolve(data.designBrief.trim())
        : callAI(DESIGN_BRIEF_SYSTEM_PROMPT, project.prompt, project.model).then((r) =>
            r.ok ? r.text.trim() : "",
          );

      const draftUserPrompt = `${project.prompt}\n\nMake it PREMIUM quality — use glass-cards, parallax-heroes, gradient-mesh backgrounds, stat-card-xl with sparklines, and domain-appropriate typography. At least 4-5 screens with varied layouts (bento-grid, magazine, split-hero). Real data, not placeholders.`;
      const draftPromise = data.premium
        ? callAIStrong(SYSTEM_PROMPT, draftUserPrompt)
        : callAI(SYSTEM_PROMPT, draftUserPrompt, project.model);

      const [brief, draftRes] = await Promise.all([briefPromise, draftPromise]);

      // ── PASS 3: merge ──
      // If we have a brief, run one more pass to refine the draft against it.
      // Otherwise the draft IS the final result.
      let r = draftRes;
      if (brief && draftRes.ok) {
        const mergeUserPrompt = `USER REQUEST:\n${project.prompt}\n\nDESIGN BRIEF (follow strictly — derive theme.palette/typography/radius/spacing/motion from it; use each screen's "layout" and include its "keyPrimitives"; carry the mood into entrance + gesture choices):\n${brief}\n\nFIRST-PASS DRAFT SCHEMA (refine and align to the brief; keep the structure, screens and elements; upgrade palette/typography/layouts to match):\n${draftRes.text}`;
        const merged = data.premium
          ? await callAIStrong(SYSTEM_PROMPT, mergeUserPrompt)
          : await callAI(SYSTEM_PROMPT, mergeUserPrompt, project.model);
        if (merged.ok) r = merged;
      }

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
