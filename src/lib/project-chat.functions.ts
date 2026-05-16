import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  "You are a senior mobile product designer + engineer collaborating with the user " +
  "to iteratively design and build a mobile application. Respond in concise, " +
  "actionable markdown. When the user asks for changes, describe the next screens, " +
  "components, data, and UI tweaks you would make. Keep replies tight (under ~250 words) " +
  "and use bullet lists, short headers, and code only when truly helpful.";

export const sendProjectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        content: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, prompt, model, user_id, result")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) return { ok: false as const, error: pErr.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };

    const { data: history } = await supabase
      .from("project_messages")
      .select("role, content")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });

    // Save user message
    const { error: insErr } = await supabase.from("project_messages").insert({
      project_id: project.id,
      user_id: userId,
      role: "user",
      content: data.content,
    });
    if (insErr) return { ok: false as const, error: insErr.message };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "AI gateway not configured" };

    const modelId = MODEL_MAP[project.model] ?? "google/gemini-3-flash-preview";

    const messages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `App idea: ${project.prompt}${project.result ? `\n\nInitial plan:\n${project.result}` : ""}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.content },
    ];

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: modelId, messages }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        const msg =
          res.status === 429
            ? "AI rate limit reached. Try again in a moment."
            : res.status === 402
              ? "AI credits exhausted."
              : `AI error (${res.status}): ${body.slice(0, 200)}`;
        return { ok: false as const, error: msg };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = json.choices?.[0]?.message?.content?.trim() ?? "(no reply)";

      await supabase.from("project_messages").insert({
        project_id: project.id,
        user_id: userId,
        role: "assistant",
        content: reply,
      });

      return { ok: true as const, reply };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });
