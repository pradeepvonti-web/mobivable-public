import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Friendly label -> Lovable AI Gateway model id. */
const MODEL_MAP: Record<string, string> = {
  "Opus 4.7": "google/gemini-2.5-pro",
  "Sonnet 4.7": "google/gemini-2.5-flash",
  "Haiku 4.7": "google/gemini-2.5-flash-lite",
  "Gemini 2.5 Pro": "google/gemini-2.5-pro",
  "Gemini 2.5 Flash": "google/gemini-2.5-flash",
  "Gemini 3 Flash": "google/gemini-3-flash-preview",
  "GPT-5": "openai/gpt-5",
  "GPT-5 Mini": "openai/gpt-5-mini",
  "GPT-5.2": "openai/gpt-5.2",
};

const SYSTEM_PROMPT =
  "You are a senior product designer + engineer. Given a one-line app idea, " +
  "respond with a concise build brief: (1) a 1-sentence pitch, (2) 5 core " +
  "features as bullets, (3) suggested screens, (4) data model sketch, " +
  "(5) recommended color palette. Use clear markdown.";

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

    const modelId = MODEL_MAP[project.model] ?? "google/gemini-3-flash-preview";
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      await supabase
        .from("projects")
        .update({ status: "failed", error_text: "AI gateway not configured" })
        .eq("id", project.id);
      return { ok: false as const, error: "AI gateway not configured" };
    }

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: project.prompt },
            ],
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        const msg =
          res.status === 429
            ? "Rate limit reached. Please try again shortly."
            : res.status === 402
              ? "AI credits exhausted. Add credits in workspace settings."
              : `AI gateway error (${res.status}): ${body.slice(0, 300)}`;
        await supabase
          .from("projects")
          .update({ status: "failed", error_text: msg })
          .eq("id", project.id);
        return { ok: false as const, error: msg };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";

      await supabase
        .from("projects")
        .update({ status: "ready", result: text, error_text: null })
        .eq("id", project.id);

      return { ok: true as const, result: text, cached: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown generation error";
      await supabase
        .from("projects")
        .update({ status: "failed", error_text: msg })
        .eq("id", project.id);
      return { ok: false as const, error: msg };
    }
  });
