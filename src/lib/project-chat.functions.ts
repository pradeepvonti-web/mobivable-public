import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAI, callAIToolsStreaming, type AIMessage } from "./ai-provider";
import { loadKnowledgeForUser } from "./knowledge-context";
import { routeMessageToAgents, advancePhase, initProjectPhases, SDLC_PHASES, type SDLCPhase } from './sdlc.functions';
import { getMcpTool } from "./mcp-tools";
import {
  clipToolResult,
  mcpToolsAsAnthropic,
  mcpToolsAsOpenAI,
  toAnthropicMessages,
  toOpenAIMessages,
  type AgentMsg,
} from "./mcp-agent";

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
// Keep parseSSE referenced
void parseSSE;

// ── Smart routing: detect if user wants surgical edits or full generation ──
const EDIT_SIGNALS = /\b(change|update|edit|modify|rename|replace|remove|delete|add|insert|swap|move|switch|toggle|make the|set the|fix|adjust)\b/i;
const FULL_REBUILD = /\b(from scratch|rebuild|start over|redesign completely|whole app|entire app)\b/i;

function shouldUseSurgicalMode(content: string, hasSchema: boolean): boolean {
  if (!hasSchema) return false;
  if (FULL_REBUILD.test(content)) return false;
  if (EDIT_SIGNALS.test(content)) return true;
  return content.length < 200;
}

// ── Surgical tool system prompt for project context ──
const SURGICAL_PROJECT_PROMPT =
  `You are the Mobivable app editor. The user is editing their app via chat. ` +
  `You have surgical tools to make precise changes.\n\n` +
  `WORKFLOW:\n` +
  `1. Call list_screens or get_screen to understand current state\n` +
  `2. Use surgical tools: update_screen, add_element, update_element, remove_element, update_theme, update_navigation\n` +
  `3. verify_schema runs automatically after writes\n` +
  `4. If verify finds issues, fix them immediately\n` +
  `5. Respond with a SHORT summary of what changed (under 40 words)\n\n` +
  `RULES:\n` +
  `- Make changes directly — don't describe what you would do\n` +
  `- Fix any verify_schema issues before responding\n` +
  `- Use the project_id provided in your system context`;

// Subset of tools relevant for project editing
const PROJECT_EDIT_TOOLS = [
  "list_screens", "get_screen", "get_project",
  "update_screen", "add_element", "update_element", "remove_element",
  "update_theme", "update_navigation", "verify_schema",
];

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

    const { data: credit, error: credErr } = await supabase.rpc("consume_ai_credits", {
      p_user: userId, p_amount: 1, p_reason: "project_chat", p_project: project.id,
    });
    if (credErr) { yield { type: "error" as const, error: credErr.message }; return; }
    const c = credit as { ok: boolean } | null;
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

    await supabase.from("project_messages").insert({
      project_id: project.id, user_id: userId, role: "user", content: data.content,
    });

    const hasSchema = !!(project.result && project.result.length > 50);

    // ─────────────────────────────────────────────────────────────────
    // SURGICAL MODE: Use tool-use loop for editing existing apps
    // ─────────────────────────────────────────────────────────────────
    if (shouldUseSurgicalMode(data.content, hasSchema) && !data.agentRole) {
      yield { type: 'agent_start' as const, role: 'developer' as AgentRole, name: 'Editor', phase: 'editing' };

      const msgs: AgentMsg[] = [
        { role: "system", content: SURGICAL_PROJECT_PROMPT },
        { role: "system", content: `PROJECT CONTEXT:\n- project_id: ${project.id}\n- App idea: ${project.prompt}\n- The app already has a schema. Use surgical tools to edit it.` },
      ];

      const recentHistory = (history ?? []).slice(-10);
      for (const h of recentHistory) {
        msgs.push({ role: h.role as "user" | "assistant", content: h.content });
      }
      msgs.push({ role: "user", content: data.content });

      const projectTools = {
        anthropic: mcpToolsAsAnthropic().filter(t => PROJECT_EDIT_TOOLS.includes(t.name)),
        openai: mcpToolsAsOpenAI().filter(t => PROJECT_EDIT_TOOLS.includes(t.function.name)),
      };

      const MAX_ITERS = 6;
      const WRITE_TOOLS = new Set([
        "update_screen", "add_element", "update_element", "remove_element",
        "update_theme", "update_navigation",
      ]);

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        const anth = toAnthropicMessages(msgs);
        const oai = toOpenAIMessages(msgs);
        const streamRes = await callAIToolsStreaming({
          system: anth.system,
          messages: { anthropic: anth.messages, openai: oai },
          tools: projectTools,
          modelHint: project.model ?? undefined,
        });

        if (!streamRes.ok) {
          yield { type: 'agent_error' as const, role: 'developer' as AgentRole, error: streamRes.error };
          break;
        }

        const body = streamRes.response.body;
        if (!body) break;
        const reader = body.pipeThrough(new TextDecoderStream()).getReader();

        let assistantText = "";
        const completedTools: { id: string; name: string; input: Record<string, unknown> }[] = [];

        // Parse SSE — Anthropic vs OpenAI
        if (streamRes.provider === "anthropic") {
          let buf = "";
          const blocks: Record<number, { kind: "text"; text: string } | { kind: "tool"; id: string; name: string; inputJson: string }> = {};
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const d = trimmed.slice(5).trim();
              if (!d) continue;
              let evt: { type?: string; index?: number; content_block?: { type?: string; id?: string; name?: string }; delta?: { type?: string; text?: string; partial_json?: string } };
              try { evt = JSON.parse(d); } catch { continue; }
              if (evt.type === "content_block_start" && typeof evt.index === "number") {
                const cb = evt.content_block ?? {};
                if (cb.type === "text") blocks[evt.index] = { kind: "text", text: "" };
                else if (cb.type === "tool_use" && cb.id && cb.name) blocks[evt.index] = { kind: "tool", id: cb.id, name: cb.name, inputJson: "" };
              } else if (evt.type === "content_block_delta" && typeof evt.index === "number") {
                const block = blocks[evt.index];
                if (!block) continue;
                if (evt.delta?.type === "text_delta" && block.kind === "text") { block.text += evt.delta.text ?? ""; assistantText += evt.delta.text ?? ""; }
                else if (evt.delta?.type === "input_json_delta" && block.kind === "tool") { block.inputJson += evt.delta.partial_json ?? ""; }
              } else if (evt.type === "content_block_stop" && typeof evt.index === "number") {
                const block = blocks[evt.index];
                if (block?.kind === "tool") {
                  let input: Record<string, unknown> = {};
                  try { input = block.inputJson ? JSON.parse(block.inputJson) : {}; } catch { /* */ }
                  completedTools.push({ id: block.id, name: block.name, input });
                }
              }
            }
          }
        } else {
          let buf = "";
          const oaiTools: Record<number, { id: string; name: string; argJson: string }> = {};
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const d = trimmed.slice(5).trim();
              if (!d || d === "[DONE]") continue;
              let evt: { choices?: { delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
              try { evt = JSON.parse(d); } catch { continue; }
              const delta = evt.choices?.[0]?.delta;
              if (delta?.content) assistantText += delta.content;
              for (const tc of delta?.tool_calls ?? []) {
                const idx = tc.index ?? 0;
                const existing = oaiTools[idx] ?? { id: "", name: "", argJson: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.argJson += tc.function.arguments;
                oaiTools[idx] = existing;
              }
            }
          }
          for (const idx of Object.keys(oaiTools)) {
            const tc = oaiTools[Number(idx)];
            if (!tc.id || !tc.name) continue;
            let input: Record<string, unknown> = {};
            try { input = tc.argJson ? JSON.parse(tc.argJson) : {}; } catch { /* */ }
            completedTools.push({ id: tc.id, name: tc.name, input });
          }
        }

        msgs.push({
          role: "assistant", content: assistantText,
          tool_calls: completedTools.length > 0 ? completedTools.map(t => ({ id: t.id, name: t.name, arguments: t.input })) : undefined,
        });

        if (completedTools.length === 0) {
          if (assistantText.trim()) {
            await supabase.from("project_messages").insert({
              project_id: project.id, user_id: userId, role: "assistant",
              content: `<!--agent:developer-->\n${assistantText.trim()}`,
            });
          }
          yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Editor', content: assistantText.trim() || "Done." };
          break;
        }

        // Run tools
        let modifiedProject = false;
        for (const tc of completedTools) {
          yield { type: 'tool_call' as const, name: tc.name, argsJson: JSON.stringify(tc.input) };
          const tool = getMcpTool(tc.name);
          let resultContent: string;
          let isError = false;
          if (!tool) { resultContent = `Unknown tool: ${tc.name}`; isError = true; }
          else {
            try {
              const result = await tool.run(tc.input, { userId, patHash: "project-chat" });
              resultContent = clipToolResult(JSON.stringify(result, null, 2)).text;
            } catch (e) { resultContent = e instanceof Error ? e.message : String(e); isError = true; }
          }
          if (WRITE_TOOLS.has(tc.name) && !isError) modifiedProject = true;
          msgs.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: resultContent, is_error: isError });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          yield { type: 'tool_done' as const, toolName: tc.name, success: !isError };
        }

        // Auto-verify
        if (modifiedProject && !completedTools.some(tc => tc.name === "verify_schema")) {
          const vTool = getMcpTool("verify_schema");
          if (vTool) {
            const vid = `v-${Date.now()}`;
            try {
              const r = await vTool.run({ project_id: project.id }, { userId, patHash: "project-chat" });
              msgs.push({ role: "assistant", content: "", tool_calls: [{ id: vid, name: "verify_schema", arguments: { project_id: project.id } }] });
              msgs.push({ role: "tool", tool_call_id: vid, name: "verify_schema", content: clipToolResult(JSON.stringify(r, null, 2)).text });
            } catch { /* */ }
          }
        }

        if (modifiedProject) yield { type: "project_updated" as const };
      }

      yield { type: "done" as const };
      return;
    }

    // ─────────────────────────────────────────────────────────────────
    // GENERATION MODE: Original team agents + full schema rewrite
    // ─────────────────────────────────────────────────────────────────
    const currentPhase = (project.current_phase as SDLCPhase) ?? 'requirements';
    const routing = routeMessageToAgents(data.content, currentPhase);

    if (routing.shouldAdvance) {
      try {
        const advResult = await advancePhase({ data: { projectId: project.id } });
        if (advResult.ok) yield { type: 'phase_advanced' as const, phase: advResult.phase };
      } catch { /* */ }
    }

    let team: AgentRole[];
    if (data.agentRole) {
      team = [data.agentRole];
    } else {
      const phaseAgents = currentPhase in SDLC_PHASES ? SDLC_PHASES[currentPhase].agents : [];
      const merged = new Set<AgentRole>([...routing.agents, ...phaseAgents]);
      team = Array.from(merged).slice(0, 3);
    }

    yield {
      type: 'team_assembled' as const, phase: currentPhase,
      phaseLabel: SDLC_PHASES[currentPhase]?.label ?? String(currentPhase),
      agents: team.map((r) => ({ role: r, name: AGENTS[r].name })),
    };

    const baseHistory: AIMessage[] = (history ?? []).map((m) => ({
      role: m.role as AIMessage["role"], content: m.content,
    }));

    const teamReplies: { role: AgentRole; name: string; content: string }[] = [];
    const knowledgeBlock = await loadKnowledgeForUser(supabase, userId);
    const phaseLabel = SDLC_PHASES[currentPhase]?.label ?? currentPhase;

    const callAgent = async (role: AgentRole) => {
      const agent = AGENTS[role];
      const systemPrompt = `You are "${agent.name}" (${agent.short}). Phase: ${phaseLabel}.

RULES — these override everything:
- Reply in 2-3 sentences MAX. Under 60 words total.
- State what you decided or recommend. No analysis, no lists, no headers.
- Sound like a quick Slack message, not a report.
- If another teammate should act, end with one @mention.
- The user can say "expand" or "tell me more" if they want detail.`;

      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "system", content: `App idea: ${project.prompt}${project.result ? `\n\nCurrent plan:\n${project.result}` : ""}` },
        ...(knowledgeBlock ? [{ role: "system" as const, content: knowledgeBlock }] : []),
        ...baseHistory,
        { role: "user", content: data.content },
      ];

      const result = await callAI(messages[0].content, messages.slice(1).map(m => m.content).join("\n\n"), project.model);
      return { role, name: agent.name, result };
    };

    if (team.length === 0) {
      yield { type: 'agent_start' as const, role: 'summary_agent' as AgentRole, name: 'Assistant', phase: currentPhase };
      const r = await callAI(DEFAULT_SYSTEM, `App idea: ${project.prompt}\n\n${data.content}`, project.model);
      const content = r.ok ? r.text.trim() : `⚠️ ${r.error}`;
      if (content) {
        await supabase.from("project_messages").insert({ project_id: project.id, user_id: userId, role: "assistant", content });
      }
      yield { type: 'agent_complete' as const, role: 'summary_agent' as AgentRole, name: 'Assistant', content };
    } else {
      for (const role of team) {
        yield { type: 'agent_start' as const, role, name: AGENTS[role].name, phase: currentPhase };
      }
      const results = await Promise.allSettled(team.map(callAgent));
      for (const result of results) {
        if (result.status === "fulfilled") {
          const { role, name, result: r } = result.value;
          const content = r.ok ? r.text.trim() : `⚠️ ${r.error}`;
          if (content) {
            teamReplies.push({ role, name, content });
            await supabase.from("project_messages").insert({ project_id: project.id, user_id: userId, role: "assistant", content: `<!--agent:${role}-->\n${content}` });
          }
          yield { type: 'agent_complete' as const, role, name, content: content || "Done." };
        } else {
          const role = team[results.indexOf(result)];
          yield { type: 'agent_error' as const, role, error: result.reason?.message ?? "Agent failed" };
        }
      }
    }

    const combined = teamReplies.map((t) => `### ${t.name}\n${t.content}`).join("\n\n");
    if (combined.length > 0) {
      yield { type: "applying_changes" as const };
      try {
        const { CODE_GEN_SYSTEM_PROMPT, parseAppSchema } = await import("@/lib/code-gen");
        const knowledgeForRewrite = await loadKnowledgeForUser(supabase, userId);
        const rewritePrompt =
          `App idea: ${project.prompt}\n\n` +
          `Current app JSON:\n${project.result ?? "(none yet)"}\n\n` +
          (knowledgeForRewrite ? `${knowledgeForRewrite}\n\n` : "") +
          `Latest user request:\n${data.content}\n\n` +
          `Team responses:\n${combined}\n\n` +
          `## CRITICAL: PREMIUM OUTPUT REQUIRED\n` +
          `Apply the team's decisions. The output MUST be professional-grade:\n` +
          `1. Use the DESIGN RECIPES from your system prompt — match the app domain to a recipe\n` +
          `2. MINIMUM: 5 screens, 8+ elements per screen, 5 nav tabs\n` +
          `3. MUST include: ≥1 parallax-hero with image prompt, ≥2 glass-card, ≥1 stat-card-xl with sparkline, ≥1 chart (line-chart/donut/bar), ≥1 bento-grid screen\n` +
          `4. Use DOMAIN-SPECIFIC elements: bank-card for fintech, swipe-card for dating, calendar-strip for scheduling, gauge-chart for dashboards\n` +
          `5. Add entrance animations on EVERY element (pop, fade-up, scale-in, blur-in)\n` +
          `6. Add navigate actions on buttons to connect screens\n` +
          `7. Use gradient-mesh-bg wrapper on at least 1 hero section\n` +
          `8. Include empty-state and skeleton loading elements\n` +
          `9. Custom theme with domain-appropriate fonts, colors, shadows — NOT generic blue/Inter\n` +
          `10. Believable realistic data — real names, real amounts, real dates — NOT "Item 1", "User", "$0.00"\n\n` +
          `If current JSON exists, enhance it with the team's changes. If it's basic, UPGRADE it to premium.\n` +
          `Generate the COMPLETE app JSON now.`;
        const rewriteResult = await callAI(CODE_GEN_SYSTEM_PROMPT, rewritePrompt, project.model);
        if (rewriteResult.ok && rewriteResult.text.length >= 50) {
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
          yield { type: "rewrite_failed" as const, error: !rewriteResult.ok ? rewriteResult.error : "AI returned insufficient output" };
        }
      } catch (error) {
        yield { type: "rewrite_failed" as const, error: error instanceof Error ? error.message : "Schema rewrite failed" };
      }
    }

    yield { type: "done" as const };
  });
