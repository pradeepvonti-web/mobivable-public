import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAI, callAIStreaming, type AIMessage } from "./ai-provider";
import { routeMessageToAgents, advancePhase, initProjectPhases, SDLC_PHASES, type SDLCPhase } from './sdlc.functions';

const DEFAULT_SYSTEM =
  "You are a senior mobile product designer + engineer collaborating with the user " +
  "to iteratively design and build a mobile application. Respond in concise, " +
  "actionable markdown.";

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
      /* ignore */
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
    if (pErr) { yield { type: "error" as const, error: pErr.message }; return; }
    if (!project) { yield { type: "error" as const, error: "Project not found" }; return; }
    if (project.user_id !== userId) { yield { type: "error" as const, error: "Forbidden" }; return; }

    if (!project.current_phase) {
      try { await initProjectPhases({ data: { projectId: project.id } }); } catch { /* */ }
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
    if (insErr) { yield { type: "error" as const, error: insErr.message }; return; }

    const currentPhase = (project.current_phase as SDLCPhase) ?? 'requirements';
    const routing = routeMessageToAgents(data.content, currentPhase);

    if (routing.shouldAdvance) {
      try {
        const advResult = await advancePhase({ data: { projectId: project.id } });
        if (advResult.ok) yield { type: 'phase_advanced' as const, phase: advResult.phase };
      } catch { /* */ }
    }

    // Decide the team: explicit pick → routed → phase lead(s)
    let team: AgentRole[];
    if (data.agentRole) {
      team = [data.agentRole];
    } else if (routing.agents.length > 0) {
      team = routing.agents.slice(0, 3);
    } else if (currentPhase in SDLC_PHASES) {
      team = SDLC_PHASES[currentPhase].agents.slice(0, 2);
    } else {
      team = [];
    }

    yield {
      type: 'team_assembled' as const,
      phase: currentPhase,
      phaseLabel: SDLC_PHASES[currentPhase]?.label ?? String(currentPhase),
      agents: team.map((r) => ({ role: r, name: AGENTS[r].name })),
    };

    const baseHistory: AIMessage[] = (history ?? []).map((m) => ({
      role: m.role as AIMessage["role"],
      content: m.content,
    }));

    // Collect each agent's reply so the next agent sees teammates' thoughts.
    const teamReplies: { role: AgentRole; name: string; content: string }[] = [];

    const runAgent = async function* (role: AgentRole | null) {
      const agent = role ? AGENTS[role] : null;
      const phaseLabel = SDLC_PHASES[currentPhase]?.label ?? currentPhase;

      const teamContext = teamReplies.length
        ? `\n\nYour teammates already responded in this turn:\n${teamReplies
            .map((t) => `### ${t.name}\n${t.content}`)
            .join("\n\n")}\n\nBuild on their points without repeating them. Stay strictly in your own role.`
        : "";

      const systemPrompt = agent
        ? `${agent.system}\n\nYou are the "${agent.name}" agent collaborating with the rest of the team on this mobile project (current SDLC phase: ${phaseLabel}). Speak in first person. Be concise (under ~180 words), use markdown bullets, and end with a one-line handoff if another teammate should act next.${teamContext}`
        : DEFAULT_SYSTEM;

      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: `App idea: ${project.prompt}${project.result ? `\n\nCurrent plan:\n${project.result}` : ""}`,
        },
        ...baseHistory,
        { role: "user", content: data.content },
      ];

      yield {
        type: 'agent_start' as const,
        role: role ?? 'summary_agent',
        name: agent?.name ?? 'Assistant',
        phase: currentPhase,
      };

      let buffer = "";
      try {
        const streamResult = await callAIStreaming(messages, project.model);
        if (!streamResult.ok) {
          yield { type: 'agent_error' as const, role: role ?? 'summary_agent', error: streamResult.error };
          return;
        }
        const upstream = streamResult.response;
        if (!upstream.body) {
          yield { type: 'agent_error' as const, role: role ?? 'summary_agent', error: 'No response body' };
          return;
        }
        const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
        const leftover = { buf: "" };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const delta of parseSSE(value, leftover)) {
            buffer += delta;
            yield { type: 'delta' as const, role: role ?? 'summary_agent', delta };
          }
        }
      } catch (e) {
        yield {
          type: 'agent_error' as const,
          role: role ?? 'summary_agent',
          error: e instanceof Error ? e.message : 'Stream failed',
        };
      } finally {
        const trimmed = buffer.trim();
        if (trimmed.length > 0) {
          if (role) teamReplies.push({ role, name: agent?.name ?? role, content: trimmed });
          const marker = role ? `<!--agent:${role}-->\n` : "";
          await supabase.from("project_messages").insert({
            project_id: project.id,
            user_id: userId,
            role: "assistant",
            content: marker + trimmed,
          });
        }
        yield { type: 'agent_done' as const, role: role ?? 'summary_agent' };
      }
    };

    // Fan out: each agent responds in sequence, seeing prior teammates.
    if (team.length === 0) {
      yield* runAgent(null);
    } else {
      for (const role of team) {
        yield* runAgent(role);
      }
    }

    // Plan rewrite uses combined team output so the preview reflects everyone.
    const combined = teamReplies.map((t) => `### ${t.name}\n${t.content}`).join("\n\n");
    if (combined.length > 0) {
      try {
        const codeGenPrompt = await import("@/lib/code-gen").then((m) => m.CODE_GEN_SYSTEM_PROMPT);
        const rewritePrompt =
          `App idea: ${project.prompt}\n\n` +
          `Current app JSON:\n${project.result ?? "(none yet)"}\n\n` +
          `Latest user request:\n${data.content}\n\n` +
          `Team responses:\n${combined}\n\n` +
          `Now generate the COMPLETE updated mobile app as a JSON object reflecting the team's decisions.`;
        const rewriteResult = await callAI(codeGenPrompt, rewritePrompt, project.model);
        if (rewriteResult.ok) {
          const nextResult = rewriteResult.text.length >= 50 ? rewriteResult.text : project.result;
          if (nextResult && nextResult !== project.result) {
            const { error: updateErr } = await supabase
              .from("projects")
              .update({ result: nextResult, status: "ready", error_text: null })
              .eq("id", project.id);
            if (!updateErr) yield { type: "project_updated" as const };
          }
        }
      } catch (error) {
        console.error("[project-chat] rewrite error", error);
      }
    }

    yield { type: "done" as const };
  });
