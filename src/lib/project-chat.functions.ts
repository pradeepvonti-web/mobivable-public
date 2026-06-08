import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAIToolsStreamingTiered } from "./ai-provider";
import { loadKnowledgeForUser } from "./knowledge-context";
import { initProjectPhases } from './sdlc.functions';
import { getMcpTool } from "./mcp-tools";
import {
  clipToolResult,
  mcpToolsAsAnthropic,
  mcpToolsAsOpenAI,
  toAnthropicMessages,
  toOpenAIMessages,
  type AgentMsg,
} from "./mcp-agent";

// ─── Single Agent System Prompt ──────────────────────────────────
// One agent that behaves like a full team: PM + Designer + Developer.
// It has all the tools and decides what to do based on context.
const UNIFIED_AGENT_PROMPT =
  `You are the Mobivable studio agent — a senior product designer, engineer, ` +
  `and strategist rolled into one. You build and refine mobile apps via chat.\n\n` +
  `## YOUR CAPABILITIES\n` +
  `You think like a PM (what to build), design like a UI expert (how it looks), ` +
  `and execute like a developer (making it happen). Don't announce which "role" ` +
  `you're in — just act.\n\n` +
  `## TOOLS\n` +
  `### For editing existing apps (PREFER THESE):\n` +
  `- list_screens / get_screen: understand current state\n` +
  `- update_screen: change title, layout, background, transition\n` +
  `- add_element: add element at specific position\n` +
  `- update_element: change one element's props\n` +
  `- remove_element: remove by index\n` +
  `- update_theme: change colors, fonts, spacing\n` +
  `- update_navigation: change nav type, add/remove tabs\n\n` +
  `### For creating new apps:\n` +
  `- generate_app: generate a full app schema from a prompt (for new apps)\n` +
  `- create_project: create a new project\n\n` +
  `### For code generation:\n` +
  `- generate_code: AI-powered code for a single screen\n` +
  `- export_project_code: full multi-screen Expo project\n\n` +
  `## WORKFLOW\n` +
  `1. If the app already has screens → use SURGICAL tools (fast, precise)\n` +
  `2. If creating from scratch → use generate_app with a RICH prompt\n` +
  `3. verify_schema runs AUTOMATICALLY after writes — fix any issues\n` +
  `4. Respond with a SHORT summary (under 40 words)\n\n` +
  `## GENERATE_APP PROMPT RULES (CRITICAL)\n` +
  `When calling generate_app, NEVER pass the user's message verbatim.\n` +
  `Always EXPAND it into a detailed prompt with:\n` +
  `- App name and concept\n` +
  `- Target audience\n` +
  `- 4-5 specific screens with features\n` +
  `- Design style (dark/light, color palette, mood)\n` +
  `- Key data to display (use realistic data, not "Item 1")\n` +
  `Example: User says "build a fitness app" → you call generate_app with:\n` +
  `"FitPulse - A premium fitness tracker for active millennials. Dark mode with neon green accent.\n` +
  `Screen 1: Dashboard with daily steps (8,432), calories (1,847), active minutes (47), weekly sparklines.\n` +
  `Screen 2: Workouts - browse workout plans (HIIT, Yoga, Strength), start timer.\n` +
  `Screen 3: Progress - weight trend chart, body measurements, personal records.\n` +
  `Screen 4: Nutrition - calorie tracker, macro donut chart, meal log.\n` +
  `Screen 5: Profile - avatar, achievements, settings.\n` +
  `Use glass-cards, stat-card-xl with sparklines, progress-rings, parallax-hero."\n\n` +
  `## RULES\n` +
  `- Make changes directly — don't describe what you would do\n` +
  `- Fix any verify_schema issues before responding\n` +
  `- Keep responses concise and action-oriented\n` +
  `- Use the project_id from your system context`;

// All tools the agent can use
const AGENT_TOOLS = [
  "list_screens", "get_screen", "get_project",
  "update_screen", "add_element", "update_element", "remove_element",
  "update_theme", "update_navigation", "verify_schema",
  "generate_app", "create_project",
  "generate_code", "export_project_code",
  "list_projects",
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

    // Consume 1 AI credit
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

    // Load chat history
    const { data: history } = await supabase
      .from("project_messages")
      .select("role, content")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });

    // Save user message
    await supabase.from("project_messages").insert({
      project_id: project.id, user_id: userId, role: "user", content: data.content,
    });

    // ─────────────────────────────────────────────────────────────────
    // SINGLE AGENT: One agent with all tools, decides what to do
    // ─────────────────────────────────────────────────────────────────
    yield { type: 'agent_start' as const, role: 'developer' as AgentRole, name: 'Studio Agent', phase: 'working' };

    // Load knowledge for richer context
    const knowledgeBlock = await loadKnowledgeForUser(supabase, userId);

    // Build conversation
    const hasSchema = !!(project.result && project.result.length > 50);
    const msgs: AgentMsg[] = [
      { role: "system", content: UNIFIED_AGENT_PROMPT },
      {
        role: "system",
        content: [
          `PROJECT CONTEXT:`,
          `- project_id: ${project.id}`,
          `- App name/idea: ${project.prompt}`,
          hasSchema ? `- The app HAS a schema with screens. Prefer surgical tools for edits.` : `- The app has NO schema yet. Use send_chat_message to generate.`,
          knowledgeBlock ? `\n${knowledgeBlock}` : "",
        ].filter(Boolean).join("\n"),
      },
    ];

    // Add recent history (last 10)
    const recentHistory = (history ?? []).slice(-10);
    for (const h of recentHistory) {
      msgs.push({ role: h.role as "user" | "assistant", content: h.content });
    }
    msgs.push({ role: "user", content: data.content });

    // Filter tools to agent-relevant ones
    const agentTools = {
      anthropic: mcpToolsAsAnthropic().filter(t => AGENT_TOOLS.includes(t.name)),
      openai: mcpToolsAsOpenAI().filter(t => AGENT_TOOLS.includes(t.function.name)),
    };

    const MAX_ITERS = 8;
    const WRITE_TOOLS = new Set([
      "update_screen", "add_element", "update_element", "remove_element",
      "update_theme", "update_navigation", "generate_app", "create_project",
    ]);

    for (let iter = 0; iter < MAX_ITERS; iter++) {
      // Decide tier: first iteration uses "strong" for better reasoning,
      // subsequent iterations (tool follow-ups) use "fast"
      const tier = iter === 0 ? "strong" as const : "fast" as const;

      const anth = toAnthropicMessages(msgs);
      const oai = toOpenAIMessages(msgs);
      const streamRes = await callAIToolsStreamingTiered({
        system: anth.system,
        messages: { anthropic: anth.messages, openai: oai },
        tools: agentTools,
        tier,
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

      // No tools → done
      if (completedTools.length === 0) {
        if (assistantText.trim()) {
          await supabase.from("project_messages").insert({
            project_id: project.id, user_id: userId, role: "assistant",
            content: assistantText.trim(),
          });
        }
        yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Studio Agent', content: assistantText.trim() || "Done." };
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
        yield { type: 'tool_done' as const, toolName: tc.name, success: !isError };
      }

      // Auto-verify after writes
      if (modifiedProject && !completedTools.some(tc => tc.name === "verify_schema")) {
        const vTool = getMcpTool("verify_schema");
        if (vTool) {
          const vid = `v-${Date.now()}`;
          try {
            const r = await vTool.run({ project_id: project.id }, { userId, patHash: "project-chat" });
            msgs.push({ role: "assistant", content: "", tool_calls: [{ id: vid, name: "verify_schema", arguments: { project_id: project.id } }] });
            msgs.push({ role: "tool", tool_call_id: vid, name: "verify_schema", content: clipToolResult(JSON.stringify(r, null, 2)).text });
          } catch { /* non-fatal */ }
        }
      }

      if (modifiedProject) yield { type: "project_updated" as const };
    }

    yield { type: "done" as const };
  });
