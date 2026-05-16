import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";

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

const DEFAULT_SYSTEM =
  "You are a senior mobile product designer + engineer collaborating with the user " +
  "to iteratively design and build a mobile application. Respond in concise, " +
  "actionable markdown. When the user asks for changes, describe the next screens, " +
  "components, data, and UI tweaks you would make. Keep replies tight (under ~250 words) " +
  "and use bullet lists, short headers, and code only when truly helpful.";

function parseSSE(chunk: string, leftover: { buf: string }): string[] {
  const deltas: string[] = [];
  leftover.buf += chunk;
  const lines = leftover.buf.split("\n");
  leftover.buf = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
      };
      const piece = json.choices?.[0]?.delta?.content;
      if (piece) deltas.push(piece);
    } catch {
      /* ignore malformed line */
    }
  }
  return deltas;
}

export const sendProjectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        content: z.string().min(1).max(4000),
        agentRole: z.enum(ALL_ROLES as [AgentRole, ...AgentRole[]]).optional(),
      })
      .parse(input),
  )
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, prompt, model, user_id, result")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) {
      yield { type: "error" as const, error: pErr.message };
      return;
    }
    if (!project) {
      yield { type: "error" as const, error: "Project not found" };
      return;
    }
    if (project.user_id !== userId) {
      yield { type: "error" as const, error: "Forbidden" };
      return;
    }

    const { data: history } = await supabase
      .from("project_messages")
      .select("role, content")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });

    const { error: insErr } = await supabase.from("project_messages").insert({
      project_id: project.id,
      user_id: userId,
      role: "user",
      content: data.content,
    });
    if (insErr) {
      yield { type: "error" as const, error: insErr.message };
      return;
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      yield { type: "error" as const, error: "AI gateway not configured" };
      return;
    }

    const modelId = MODEL_MAP[project.model] ?? "google/gemini-3-flash-preview";
    const agent = data.agentRole ? AGENTS[data.agentRole] : null;
    const systemPrompt = agent
      ? `${agent.system}\n\nYou are speaking as the "${agent.name}" agent on this project. Stay in role. Be concise (under ~250 words), markdown, bullets, and code only when truly helpful.`
      : DEFAULT_SYSTEM;
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `App idea: ${project.prompt}${project.result ? `\n\nInitial plan:\n${project.result}` : ""}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.content },
    ];

    let buffer = "";
    let upstream: Response | null = null;
    try {
      upstream = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: modelId, messages, stream: true }),
        },
      );

      if (!upstream.ok || !upstream.body) {
        const body = await upstream.text();
        const msg =
          upstream.status === 429
            ? "AI rate limit reached. Try again in a moment."
            : upstream.status === 402
              ? "AI credits exhausted."
              : `AI error (${upstream.status}): ${body.slice(0, 200)}`;
        yield { type: "error" as const, error: msg };
        return;
      }

      const leftover = { buf: "" };
      for await (const chunk of upstream.body.pipeThrough(
        new TextDecoderStream(),
      )) {
        for (const delta of parseSSE(chunk, leftover)) {
          buffer += delta;
          yield { type: "delta" as const, delta };
        }
      }
    } catch (e) {
      yield {
        type: "error" as const,
        error: e instanceof Error ? e.message : "Stream failed",
      };
      return;
    } finally {
      if (buffer.trim().length > 0) {
        await supabase.from("project_messages").insert({
          project_id: project.id,
          user_id: userId,
          role: "assistant",
          content: buffer,
        });
      }
    }

    // Second pass: rewrite the project plan/result to reflect the user's request,
    // so the preview actually updates after each chat turn.
    if (buffer.trim().length > 0) {
      try {
        const rewriteMessages = [
          {
            role: "system",
            content:
              "You are updating a mobile app's full design/plan document in markdown. " +
              "Given the current plan and the latest conversation (including the user's newest request and the assistant's reply), " +
              "output the COMPLETE updated plan in markdown — not a diff, not commentary. " +
              "Preserve existing structure and sections (e.g. Overview, Screens, Components, Data, Flows). " +
              "Apply the user's requested UI/feature changes concretely (new screens, components, copy, states). " +
              "Respond with ONLY the markdown document, no preamble.",
          },
          {
            role: "user",
            content:
              `App idea: ${project.prompt}\n\n` +
              `Current plan:\n${project.result ?? "(none yet)"}\n\n` +
              `Latest user request:\n${data.content}\n\n` +
              `Assistant reply:\n${buffer}\n\n` +
              `Now output the full updated plan in markdown.`,
          },
        ];
        const rewriteRes = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelId,
              messages: rewriteMessages,
              stream: false,
            }),
          },
        );
        if (rewriteRes.ok) {
          const json = (await rewriteRes.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const newResult = json.choices?.[0]?.message?.content?.trim();
          if (newResult && newResult.length > 50) {
            await supabase
              .from("projects")
              .update({ result: newResult, status: "ready" })
              .eq("id", project.id);
            yield { type: "project_updated" as const };
          }
        }
      } catch {
        /* non-fatal — chat reply already saved */
      }
    }

    yield { type: "done" as const, content: buffer };
  });
