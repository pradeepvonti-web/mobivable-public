import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAI, callAIStreaming, type AIMessage } from "./ai-provider";
import { routeMessageToAgents, advancePhase, initProjectPhases, SDLC_PHASES, type SDLCPhase } from './sdlc.functions';

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
      .select("id, prompt, model, user_id, result, current_phase")
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

    // Auto-initialize SDLC phases if not set
    if (!project.current_phase) {
      try {
        await initProjectPhases({ data: { projectId: project.id } });
      } catch { /* non-fatal */ }
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

    // Route message to relevant agent(s) based on current phase
    const currentPhase = (project.current_phase as SDLCPhase) ?? 'requirements';
    const routing = routeMessageToAgents(data.content, currentPhase);

    // If phase advance requested
    if (routing.shouldAdvance) {
      try {
        const advResult = await advancePhase({ data: { projectId: project.id } });
        if (advResult.ok) {
          yield { type: 'phase_advanced' as const, phase: advResult.phase };
        }
      } catch { /* non-fatal */ }
    }

    // Determine which agent to respond as
    const respondingAgent = routing.agents.length > 0
      ? AGENTS[routing.agents[0]]
      : null;
    const respondingRole = routing.agents[0] ?? null;

    // Use explicitly selected agent, or routed agent, or default
    const agent = data.agentRole ? AGENTS[data.agentRole] : respondingAgent;
    const activeRole = data.agentRole ?? respondingRole;
    const systemPrompt = agent
      ? `${agent.system}\n\nYou are speaking as the "${agent.name}" agent on this project (SDLC Phase: ${SDLC_PHASES[currentPhase]?.label ?? currentPhase}). Stay in role. Be concise (under ~250 words), markdown, bullets, and code only when truly helpful. Reference the current phase context.`
      : DEFAULT_SYSTEM;
    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `App idea: ${project.prompt}${project.result ? `\n\nInitial plan:\n${project.result}` : ""}`,
      },
      ...(history ?? []).map((m) => ({ role: m.role as AIMessage["role"], content: m.content })),
      { role: "user", content: data.content },
    ];

    let buffer = "";
    let upstream: Response | null = null;
    try {
      const streamResult = await callAIStreaming(messages, project.model);
      if (!streamResult.ok) {
        yield { type: "error" as const, error: streamResult.error };
        return;
      }
      upstream = streamResult.response;

      if (!upstream.body) {
        yield { type: "error" as const, error: "No response body from AI provider" };
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
        // Prefix with agent badge if an agent responded
        const agentPrefix = activeRole && agent
          ? `**🤖 ${agent.name}** *(${SDLC_PHASES[currentPhase]?.label ?? currentPhase})*\n\n`
          : '';
        await supabase.from("project_messages").insert({
          project_id: project.id,
          user_id: userId,
          role: "assistant",
          content: agentPrefix + buffer,
        });
      }
    }

    // Second pass: rewrite the project plan/result to reflect the user's request,
    // so the preview actually updates after each chat turn.
    if (buffer.trim().length > 0) {
      try {
        const codeGenPrompt = await import("@/lib/code-gen").then(m => m.CODE_GEN_SYSTEM_PROMPT);
        const rewritePrompt =
          `App idea: ${project.prompt}\n\n` +
          `Current app JSON:\n${project.result ?? "(none yet)"}\n\n` +
          `Conversation so far:\n${(history ?? [])
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n")}\n\n` +
          `Latest user request:\n${data.content}\n\n` +
          `Assistant reply:\n${buffer}\n\n` +
          `Now generate the COMPLETE updated mobile app as a JSON object. Include ALL screens and elements, reflecting the latest changes.`;

        const rewriteResult = await callAI(codeGenPrompt, rewritePrompt, project.model);

        if (!rewriteResult.ok) {
          console.error("[project-chat] plan rewrite failed", {
            projectId: project.id,
            error: rewriteResult.error,
          });
        } else {
          const nextResult = rewriteResult.text.length >= 50 ? rewriteResult.text : buffer.trim();

          const { error: updateErr } = await supabase
            .from("projects")
            .update({ result: nextResult, status: "ready", error_text: null })
            .eq("id", project.id);

          if (updateErr) {
            console.error("[project-chat] failed to persist updated plan", {
              projectId: project.id,
              error: updateErr.message,
            });
          } else {
            yield { type: "project_updated" as const };
          }
        }
      } catch (error) {
        console.error("[project-chat] unexpected rewrite error", {
          projectId: project.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    yield { type: "done" as const, content: buffer };
  });
