import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAI, callAIStreaming, type AIMessage } from "./ai-provider";
import { loadKnowledgeForUser } from "./knowledge-context";
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

    // Consume 1 AI credit per chat turn
    const { data: credit, error: credErr } = await supabase.rpc("consume_ai_credits", {
      p_user: userId,
      p_amount: 1,
      p_reason: "project_chat",
      p_project: project.id,
    });
    if (credErr) { yield { type: "error" as const, error: credErr.message }; return; }
    const c = credit as { ok: boolean; daily_remaining: number; monthly_remaining: number } | null;
    if (c && !c.ok) {
      yield { type: "error" as const, error: "OUT_OF_CREDITS: You're out of AI credits. Upgrade your plan to keep going." };
      return;
    }

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
        ? `${agent.system}\n\nCRITICAL CHAT RULES — you are "${agent.name}" in a live team chat (phase: ${phaseLabel}):\n- MAX 80 words. Seriously — 80 words or fewer.\n- Talk like a teammate on Slack, not a consultant writing a report.\n- State what you're doing/decided, not a full analysis.\n- No headers (##), no numbered lists, no long bullet lists.\n- 2-3 short sentences max. One key decision + one next step.\n- End with a one-line handoff if needed.\n- The user can ask follow-up questions if they want more detail.${teamContext}`
        : DEFAULT_SYSTEM;

      // Saved knowledge items (PRDs, design notes, ingested URLs from the
      // Knowledge panel) are injected once per turn. Loaded inside the loop
      // so an item added mid-conversation lands on the very next agent reply.
      const knowledgeBlock = await loadKnowledgeForUser(supabase, userId);

      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content: `App idea: ${project.prompt}${project.result ? `\n\nCurrent plan:\n${project.result}` : ""}`,
        },
        ...(knowledgeBlock ? [{ role: "system" as const, content: knowledgeBlock }] : []),
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
        const { CODE_GEN_SYSTEM_PROMPT, parseAppSchema } = await import("@/lib/code-gen");
        // Re-load knowledge so the schema rewrite also sees user-provided
        // PRDs/notes. Same cap as the chat turn — won't blow past budget.
        const knowledgeForRewrite = await loadKnowledgeForUser(supabase, userId);
        const rewritePrompt =
          `App idea: ${project.prompt}\n\n` +
          `Current app JSON:\n${project.result ?? "(none yet)"}\n\n` +
          (knowledgeForRewrite ? `${knowledgeForRewrite}\n\n` : "") +
          `Latest user request:\n${data.content}\n\n` +
          `Team responses:\n${combined}\n\n` +
          `IMPORTANT: Apply the changes the team described. Keep ALL existing screens and elements intact unless the team explicitly said to remove them.\n` +
          `Now generate the COMPLETE updated mobile app as a JSON object reflecting the team's decisions.`;
        const rewriteResult = await callAI(CODE_GEN_SYSTEM_PROMPT, rewritePrompt, project.model);
        if (rewriteResult.ok && rewriteResult.text.length >= 50) {
          // Parse and validate the new schema
          const parsed = parseAppSchema(rewriteResult.text);
          if (parsed) {
            const { validateAndFixSchema } = await import("./schema-validator");
            const { schema: fixed } = validateAndFixSchema(parsed);
            const finalJson = JSON.stringify(fixed ?? parsed);
            const { error: updateErr } = await supabase
              .from("projects")
              .update({ result: finalJson, status: "ready", error_text: null })
              .eq("id", project.id);
            if (!updateErr) yield { type: "project_updated" as const };
          } else {
            // AI returned text but it's not valid JSON schema — try raw save
            const nextResult = rewriteResult.text;
            if (nextResult !== project.result) {
              const { error: updateErr } = await supabase
                .from("projects")
                .update({ result: nextResult, status: "ready", error_text: null })
                .eq("id", project.id);
              if (!updateErr) yield { type: "project_updated" as const };
            }
          }
        } else {
          console.error("[project-chat] rewrite produced insufficient output", {
            ok: rewriteResult.ok,
            textLength: rewriteResult.ok ? rewriteResult.text.length : 0,
            error: !rewriteResult.ok ? rewriteResult.error : undefined,
          });
          yield { type: "rewrite_failed" as const, error: !rewriteResult.ok ? rewriteResult.error : "AI returned insufficient output" };
        }
      } catch (error) {
        console.error("[project-chat] rewrite error", error);
        yield { type: "rewrite_failed" as const, error: error instanceof Error ? error.message : "Schema rewrite failed" };
      }
    }

    yield { type: "done" as const };
  });
