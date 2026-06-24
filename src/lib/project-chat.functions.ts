import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_ROLES, type AgentRole } from "@/lib/agents";
import { callAIToolsStreamingTiered } from "./ai-provider";
import { loadKnowledgeForUser } from "./knowledge-context";
import { initProjectPhases } from './sdlc.functions';
import { getMcpTool } from "./mcp-tools";
import { resolveBuildStack } from "./agent-workspace.server";
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
  `You are the Mobivable studio agent — a vibe coding tool for mobile app development. ` +
  `Users describe what they want, you build it. You think like a PM (what to build), ` +
  `design like a UI expert (how it looks), and execute like a developer (making it happen).\n\n` +

  `## PLAN-FIRST WORKFLOW (MANDATORY FOR NEW APPS)\n` +
  `When a user describes a new app idea, call research_and_plan with a COMPREHENSIVE prompt covering:\n` +
  `1. App Vision: name, purpose, target users, main problem, expected outcome\n` +
  `2. Core Features: must-have (auth, profile, dashboard, workflow, search, notifications, settings) + nice-to-have (AI, chat, payments, analytics, offline)\n` +
  `3. User Journey: open → signup → onboarding → dashboard → main action → review → submit → notifications\n` +
  `4. Screen List: 8-12 screens (splash, login, signup, onboarding, dashboard, list/search, detail, create/edit, notifications, profile, settings, help)\n` +
  `5. UI/UX Design: color palette, typography, buttons, cards, forms, icons, nav bar, empty states, error messages, loading states\n` +
  `6. Technical Architecture: React Native/Expo, Supabase backend, PostgreSQL, auth strategy\n` +
  `7. Data Model: all entities (User, Profile, business objects, Orders, Payments, Notifications)\n` +
  `8. API Plan: all required endpoints\n` +
  `9. Development Phases: Discovery → Design → Backend → Mobile Dev → Testing → Deployment → Post-Launch\n` +
  `10. MVP Scope: what to include first vs defer\n` +
  `11. Testing Checklist: install, auth, navigation, forms, API errors, screen sizes\n` +
  `12. Security Checklist: auth, API protection, input validation, HTTPS, RLS\n` +
  `13. App Store Readiness: assets needed (logo, icon, splash, screenshots, descriptions)\n` +
  `14. Success Metrics: downloads, active users, conversion, retention, crash-free rate\n\n` +

  `### WORKFLOW STEPS:\n` +
  `1. Call research_and_plan with a COMPREHENSIVE prompt covering all sections above\n` +
  `2. STOP IMMEDIATELY after research_and_plan completes. Do NOT call any more tools.\n` +
  `3. Do NOT call generate_app in the same turn as research_and_plan.\n` +
  `4. The design brief card will be shown to the user automatically.\n` +
  `5. WAIT for the user's next message — they will say "approve" or give feedback.\n` +
  `6. When user approves → THEN call generate_app with a detailed prompt.\n` +
  `7. If user wants changes → call research_and_plan again with their feedback.\n\n` +

  `## TOOLS\n` +
  `### For editing existing apps (PREFER THESE):\n` +
  `- list_screens / get_screen: understand current state\n` +
  `- update_screen: change title, layout, background, transition\n` +
  `- add_element: add element at specific position\n` +
  `- update_element: change one element's props\n` +
  `- remove_element: remove by index\n` +
  `- update_theme: change colors, fonts, spacing\n` +
  `- update_navigation: change nav type, add/remove tabs\n\n` +
  `### For creating new apps (PLAN-FIRST — MANDATORY):\n` +
  `- research_and_plan: ALWAYS call FIRST. Generates comprehensive development plan + mockup\n` +
  `- generate_app: generate full app schema (ONLY after user approves the plan)\n` +
  `- create_project: create a new project\n\n` +
  `### For code generation:\n` +
  `- generate_code: AI-powered code for a single screen\n` +
  `- export_project_code: full multi-screen Expo project\n\n` +

  `## GENERATE_APP PROMPT RULES (CRITICAL)\n` +
  `When calling generate_app, NEVER pass the user's message verbatim.\n` +
  `Always EXPAND it into a detailed prompt with:\n` +
  `- App name and concept\n` +
  `- Target audience\n` +
  `- 8-12 specific screens with features and layouts\n` +
  `- Design style (dark/light, color palette, mood)\n` +
  `- Key data to display (use realistic data, not "Item 1")\n` +
  `- Domain-specific primitives (bank-card for fintech, swipe-card for dating, etc.)\n\n` +

  `### For EXISTING apps (has schema):\n` +
  `1. Use SURGICAL tools (fast, precise)\n` +
  `2. verify_schema runs AUTOMATICALLY\n` +
  `3. Respond with SHORT summary (under 40 words)\n\n` +

  `## REAL EXPO BUILD MODE (when system context says target_stack: expo)\n` +
  `After the user approves the plan, BUILD A REAL EXPO APP by writing source files and verifying them — do NOT call generate_app. Use the workspace tools:\n` +
  `- ws_list_files / ws_read_file: inspect the pre-seeded Expo scaffold.\n` +
  `- ws_write_file: create each screen (files under app/), store, component, and util.\n` +
  `- ws_edit_file: surgical fixes (exact unique substring).\n` +
  `- ws_run_command: synchronous — for QUICK commands only (\`bunx tsc --noEmit\`, \`bun run lint\`, ls, cat).\n` +
  `- ws_start_preview: handles EVERYTHING (bun install + expo export + serve). Call this ONCE after writing all files. Returns a jobId — call ws_command_status ONCE to check if done (it waits up to 60s internally).\n` +
  `- read_mockup: vision-read the APPROVED mockup image. The mockup is the source of truth.\n` +
  `- invoke_skill: load reusable guidance.\n\n` +

  `### OPTIMIZED WORKFLOW (follow this EXACT order to minimize iterations):\n` +
  `1. Call read_mockup to SEE the approved design\n` +
  `2. Write constants/theme.ts with REAL hex colors/fonts from mockup\n` +
  `3. Write ALL screen files in RAPID SUCCESSION — one ws_write_file per screen, no pauses between them. Write types.ts, hooks, utils as needed.\n` +
  `4. Call ws_start_preview — this handles bun install + expo export + static server automatically. DO NOT manually run bun install or expo export.\n` +
  `5. Call ws_command_status with the returned jobId — it waits internally up to 60s. If still running, call it ONE more time.\n` +
  `6. Once done, verify with \`bunx tsc --noEmit\` (sync). Fix any errors with ws_edit_file.\n` +
  `7. Declare the build complete.\n\n` +

  `### ⚠️ CODE QUALITY — ZERO TOLERANCE FOR SYNTAX ERRORS:\n` +
  `- NEVER declare a variable/function/type/const with the same name twice in one file. Before writing, mentally check for duplicates.\n` +
  `- EVERY import must resolve. Only import modules that exist in node_modules or that you have ALREADY written. Common Expo packages: expo-splash-screen, expo-status-bar, @expo/vector-icons, expo-font, expo-constants, expo-linking.\n` +
  `- EVERY exported name must match its import. If _layout.tsx imports { COLORS } from '../constants/theme', then theme.ts MUST export COLORS.\n` +
  `- Use \`export const\` not \`export default\` for named exports. Be consistent: if one file imports { X }, the source must export { X }.\n` +
  `- NO placeholder comments like "// TODO" or "// add later". Write complete, working code.\n` +
  `- SELF-CHECK every file before writing: Does it compile? Are all imports valid? Are all variables defined exactly once?\n` +
  `- If you create a types file, make sure ALL screens import from the SAME path. Don't scatter type definitions across files.\n\n` +

  `### CRITICAL RULES FOR EFFICIENCY:\n` +
  `- NEVER call ws_run_command_async for bun install — ws_start_preview does this for you.\n` +
  `- NEVER poll ws_command_status more than 2 times per job. It waits 60s internally.\n` +
  `- Write ALL files BEFORE calling ws_start_preview. Don't interleave writes and installs.\n` +
  `- Each tool call costs one LLM iteration. Batch your work: write multiple files per turn.\n` +
  `- AFTER calling ws_start_preview and checking status, DO NOT keep writing more files or re-running installs. The build is DONE. Declare completion.\n` +
  `- Maximum allowed fix cycles after ws_start_preview: 5. After 5 fix attempts, declare done with any remaining issues noted.\n\n` +

  `## DESIGN FIDELITY (the headline feature — treat divergence from the mockup as a bug)\n` +
  `- The scaffold pre-installs visual primitives — USE them: \`react-native-svg\` for charts, \`expo-linear-gradient\` for gradients, \`react-native-qrcode-svg\` for QR codes.\n` +
  `- Build ALL screens in the mockup. Keep the mockup's exact app name, palette, typography, and bottom tab bar.\n` +
  `- A clean-but-plain interpretation is a FAILURE. Reproduce the mockup's actual visual identity.\n` +
  `## BACKEND (Supabase — already wired)\n` +
  `- The scaffold ships a ready Supabase client at \`lib/supabase.ts\`. Import it: \`import { supabase, isSupabaseConfigured } from "@/lib/supabase"\`.\n` +
  `- Guard data fetches with \`isSupabaseConfigured\` and keep seed/sample data as fallback so the preview always renders.\n` +
  `- If the app persists data, call \`declare_backend\` with the tables/columns/RLS.\n` +
  `## PROJECT STRUCTURE\n` +
  `- \`app/\` file-based routes, \`constants/theme.ts\` (design tokens), \`types.ts\` (shared types), \`hooks/\` (custom hooks; \`useAuth\` is pre-built), \`lib/\` (clients/utils).\n` +
  `- \`eas.json\` and \`app.json\` are pre-set — do NOT remove them.\n` +
  `## NATIVE MODULES\n` +
  `- Pre-installed: \`expo-camera\`, \`expo-location\`, \`expo-notifications\`, \`expo-image-picker\`, \`expo-secure-store\`. Use them when needed.\n` +
  `- Always render a graceful web fallback so \`expo export -p web\` never crashes.\n` +
  `Narrate each step briefly ("Now let's build the Dashboard screen:") before its tool calls.\n\n` +

  `## PREVIEW LIMITATIONS (IMPORTANT)\n` +
  `The preview is a web renderer. These actions WORK:\n` +
  `- navigate: switches to another screen (MUST match a screen id)\n` +
  `- url: opens a URL in browser\n` +
  `- dialog: shows an alert\n` +
  `These DO NOT work in preview (require native build):\n` +
  `- camera, native, sheet actions\n` +
  `If the user reports a button "not working", check if it uses a native action.\n` +
  `Tell them: "This requires exporting your app. In preview, navigation between screens works."\n` +
  `NEVER set action type to "camera" or "native" — use "navigate" to a dedicated screen instead.\n\n` +
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
  "research_and_plan", "generate_app", "create_project",
  "generate_code", "export_project_code",
  "list_projects",
  // Real Expo build: write/read/edit files + run bun/tsc/eslint, then preview.
  "ws_list_files", "ws_read_file", "ws_write_file", "ws_edit_file",
  "ws_run_command", "ws_run_command_async", "ws_command_status", "ws_start_preview",
  // Load reusable design/build guidance on demand.
  "invoke_skill",
  // Vision-read the approved mockup so the build matches it pixel-wise.
  "read_mockup",
  // Declare the app's Supabase data model (tables/RLS) so the DB matches the code.
  "declare_backend",
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
      .select("id, prompt, model, user_id, result, current_phase, attachments")
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
    // BRAIN SELECTION: the local TypeScript tool-use loop runs on Claude
    // (Opus plan / Sonnet execute via the Anthropic provider) and is the
    // DEFAULT. The Google ADK service runs on Gemini; it only takes over
    // when explicitly opted in with AGENT_BRAIN=adk (and ADK_AGENT_URL set).
    // This ensures real builds run on Opus/Sonnet, not Gemini, even when an
    // ADK URL is configured.
    // ─────────────────────────────────────────────────────────────────
    const useAdk = process.env.AGENT_BRAIN === "adk";
    const adkUrl = process.env.ADK_AGENT_URL;
    if (adkUrl && useAdk) {
      yield { type: 'agent_start' as const, role: 'developer' as AgentRole, name: 'Studio Agent', phase: 'working' };

      // Build a context-rich prompt for ADK with plan approval detection
      const hasSchema = !!(project.result && project.result.length > 50);
      const recentHistory = (history ?? []).slice(-10);

      // ── PLAN APPROVAL DETECTION (mirrors TypeScript fallback logic) ──
      const historyTexts = (history ?? []).map(h => (h.content ?? ""));
      const historyLower = historyTexts.map(t => t.toLowerCase());
      const hadPlanInHistory = historyLower.some(t =>
        t.includes("[design_plan_generated]") ||
        t.includes("design plan") ||
        t.includes("awaiting_approval") ||
        t.includes("plan_steps")
      );
      const APPROVAL_REGEX = /\b(approv|looks good|go ahead|build it|let'?s go|proceed|start building|lgtm|build the app|exactly as planned)\b/i;
      const userMsgsApproved = historyTexts
        .filter((_, i) => (history ?? [])[i]?.role === "user")
        .some(t => APPROVAL_REGEX.test(t));
      const currentMsgApproves = APPROVAL_REGEX.test(data.content);
      const planApprovedInSession = hadPlanInHistory && (userMsgsApproved || currentMsgApproves);

      // ── LOAD SAVED DESIGN BRIEF for approved plans ──
      let designBriefContext = "";
      if (planApprovedInSession && !hasSchema) {
        try {
          const { data: projData } = await supabase
            .from("projects")
            .select("attachments")
            .eq("id", project.id)
            .single();
          const att = projData?.attachments as Record<string, unknown> | null;
          if (att?.design_brief && typeof att.design_brief === "object") {
            const brief = att.design_brief as Record<string, unknown>;
            const screens = (brief.screens ?? []) as { id: string; title: string; layout?: string; purpose?: string; keyPrimitives?: string[] }[];
            const palette = (brief.palette ?? {}) as Record<string, string>;
            const typo = (brief.typography ?? {}) as Record<string, string>;
            designBriefContext = [
              `\n[APPROVED DESIGN BRIEF — USE THIS FOR generate_app]`,
              `App Name: ${brief.appName ?? "App"}`,
              `Domain: ${brief.domain ?? "general"}`,
              `Mood: ${brief.mood ?? "modern"}`,
              `Audience: ${brief.audience ?? "general users"}`,
              `Palette: ${palette.mode ?? "dark"} mode, primary ${palette.primary ?? "#6366F1"}, accent ${palette.accent ?? "#F59E0B"}, bg ${palette.background ?? "#0A0A1A"}`,
              `Typography: ${typo.headingFont ?? "Inter"} + ${typo.bodyFont ?? "DM Sans"}, ${typo.scale ?? "comfortable"} scale`,
              `Radius: ${brief.radius ?? "rounded"}, Spacing: ${brief.spacing ?? "comfortable"}, Motion: ${brief.motion ?? "medium"}`,
              `Screens:`,
              ...screens.map((s, i) =>
                `  ${i + 1}. ${s.title ?? s.id} (${s.layout ?? "stack"}) — ${s.purpose ?? ""} [${(s.keyPrimitives ?? []).join(", ")}]`
              ),
              `Navigation: ${(brief.navigation as string[])?.join(", ") ?? "bottom-tabs"}`,
              `References: ${((brief.references as string[]) ?? []).join(", ") || "Premium app designs"}`,
            ].join("\n");
          }
        } catch {
          // Non-fatal
        }
      }

      // Target stack drives which build mode the agent uses. Defaults to a real
      // Expo build (ws_* workspace tools), but falls back to the schema path
      // ("web") when the workspace runtime is unavailable (no E2B / kill-switch).
      const targetStack = resolveBuildStack(project.attachments as Record<string, unknown> | null);

      const contextLines = [
        `[PROJECT CONTEXT]`,
        `project_id: ${project.id}`,
        `target_stack: ${targetStack}`,
        targetStack === "expo"
          ? `Build mode: REAL EXPO BUILD — after approval, build a real Expo app with the ws_* workspace tools (ws_write_file/ws_read_file/ws_edit_file/ws_list_files/ws_run_command). Verify with \`bunx tsc --noEmit\` and \`bun run lint\`. Do NOT call generate_app.`
          : `Build mode: SCHEMA — use generate_app / surgical schema tools.`,
        `App name/idea: ${project.prompt}`,
        hasSchema
          ? `The app HAS a schema with screens. Prefer surgical tools for edits.`
          : planApprovedInSession
            ? `⚠️ The user has APPROVED the design plan. Call generate_app NOW with a DETAILED prompt based on the approved design brief below. Do NOT call research_and_plan again.`
            : `The app has NO schema yet. Call research_and_plan FIRST.`,
        designBriefContext,
        ``,
        `[RECENT CONVERSATION]`,
        ...recentHistory.map(h => `${h.role}: ${h.content?.slice(0, 500)}`),
        ``,
        `[USER MESSAGE]`,
        data.content,
      ];
      const fullPrompt = contextLines.join("\n");


      // Fetch Cloud Run identity token for service-to-service auth
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const metadataUrl =
          `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${adkUrl}`;
        const tokenRes = await fetch(metadataUrl, { headers: { "Metadata-Flavor": "Google" } });
        if (tokenRes.ok) {
          headers["Authorization"] = `Bearer ${await tokenRes.text()}`;
        }
      } catch {
        // Not on Cloud Run (local dev) — skip auth
      }

      try {
        const adkRes = await fetch(`${adkUrl}/run/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: fullPrompt,
            session_id: `studio-${project.id}`,
            user_id: userId,
          }),
        });

        if (!adkRes.ok) {
          const errText = await adkRes.text().catch(() => "ADK service error");
          yield { type: 'agent_error' as const, role: 'developer' as AgentRole, error: `ADK error (${adkRes.status}): ${errText}` };
          yield { type: "done" as const };
          return;
        }

        const body = adkRes.body;
        if (!body) {
          yield { type: 'agent_error' as const, role: 'developer' as AgentRole, error: "ADK returned empty body" };
          yield { type: "done" as const };
          return;
        }

        // Parse SSE stream from ADK and translate to Studio events
        const reader = body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        let fullResponse = "";

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            let evt: { type?: string; text?: string; name?: string; args?: Record<string, unknown>; result?: string; error?: string; session_id?: string };
            try { evt = JSON.parse(jsonStr); } catch { continue; }

            if (evt.type === "delta" && evt.text) {
              fullResponse += evt.text;
            } else if (evt.type === "tool_start" && evt.name) {
              yield { type: 'tool_call' as const, name: evt.name, argsJson: JSON.stringify(evt.args ?? {}) };
            } else if (evt.type === "tool_result" && evt.name) {
              // Check if this tool modifies the project
              const WRITE_TOOLS_ADK = new Set([
                "update_screen", "add_element", "update_element", "remove_element",
                "update_theme", "update_navigation", "generate_app", "create_project",
                "ws_write_file", "ws_edit_file",
              ]);
              yield { type: 'tool_done' as const, toolName: evt.name, success: true };
              if (WRITE_TOOLS_ADK.has(evt.name)) {
                yield { type: "project_updated" as const };
              }
              // Detect research_and_plan completion → emit design_brief
              if (evt.name === "research_and_plan" && evt.result) {
                try {
                  const parsed = JSON.parse(evt.result);
                  if (parsed.ok && parsed.awaiting_approval) {
                    yield {
                      type: 'design_brief' as const,
                      planSteps: (parsed.plan_steps as string[]) ?? [],
                      briefJson: JSON.stringify(parsed.brief ?? {}),
                      mockupUrl: (parsed.mockup_url as string) ?? "",
                      appName: (parsed.brief as Record<string, string>)?.appName ?? "App",
                    };
                  }
                } catch { /* result wasn't JSON — skip */ }
              }
            } else if (evt.type === "error") {
              yield { type: 'agent_error' as const, role: 'developer' as AgentRole, error: evt.error ?? "Unknown ADK error" };
            } else if (evt.type === "done") {
              // Stream complete
            }
          }
        }

        // Save assistant response to project_messages
        if (fullResponse.trim()) {
          await supabase.from("project_messages").insert({
            project_id: project.id, user_id: userId, role: "assistant",
            content: fullResponse.trim(),
          });
        }

        yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Studio Agent', content: fullResponse.trim() || "Done." };
        yield { type: "done" as const };
        return;

      } catch (adkErr) {
        // ADK call failed — fall through to TypeScript fallback
        console.error("[ADK] Studio routing failed, falling back to TypeScript loop:", adkErr);
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // FALLBACK: TypeScript tool-use loop (used when ADK is unavailable)
    // ─────────────────────────────────────────────────────────────────
    yield { type: 'agent_start' as const, role: 'developer' as AgentRole, name: 'Studio Agent', phase: 'working' };


    // Load knowledge for richer context
    const knowledgeBlock = await loadKnowledgeForUser(supabase, userId);

    // Build conversation
    const hasSchema = !!(project.result && project.result.length > 50);

    // ── PLAN-FIRST ENFORCEMENT ──────────────────────────────────────
    // Check if user has an approved plan in recent history.
    // A plan is "approved" if:
    //   1. A research_and_plan tool was called in prior messages (saved as
    //      a breadcrumb message containing "[DESIGN_PLAN_GENERATED]"), AND
    //   2. User responded with approval ("approve", "yes", "go", "build", etc.)
    const historyTexts = (history ?? []).map(h => (h.content ?? ""));
    const historyLower = historyTexts.map(t => t.toLowerCase());

    // Look for our saved breadcrumb from research_and_plan
    const hadPlanInHistory = historyLower.some(t =>
      t.includes("[design_plan_generated]") ||
      t.includes("design plan") ||
      t.includes("awaiting_approval") ||
      t.includes("plan_steps")
    );

    // Check if any user message contains approval keywords
    const APPROVAL_REGEX = /\b(approv|looks good|go ahead|build it|let'?s go|proceed|start building|lgtm|build the app|exactly as planned)\b/i;
    const userMsgsApproved = historyTexts
      .filter((_, i) => (history ?? [])[i]?.role === "user")
      .some(t => APPROVAL_REGEX.test(t));
    const currentMsgApproves = APPROVAL_REGEX.test(data.content);

    let planApprovedInSession = hadPlanInHistory && (userMsgsApproved || currentMsgApproves);
    let planGeneratedThisTurn = false; // Track if we generated a plan THIS turn

    // Real Expo build vs legacy schema path.
    // Falls back to "web" (schema path) when the workspace runtime is
    // unavailable (no E2B key / kill-switch) so builds never flail on dead ws_* tools.
    const targetStackFallback = resolveBuildStack(project.attachments as Record<string, unknown> | null);
    const isExpoBuild = targetStackFallback === "expo" && planApprovedInSession && !hasSchema;

    // ── Check if app was already built (has files in project_file_overrides) ──
    const { count: existingFileCount } = await supabase
      .from("project_file_overrides")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    const alreadyBuilt = (existingFileCount ?? 0) > 0;

    console.log(
      `[chat] stack=${targetStackFallback} planApproved=${planApprovedInSession} hasSchema=${hasSchema} alreadyBuilt=${alreadyBuilt} -> isExpoBuild=${isExpoBuild}`,
    );

    const msgs: AgentMsg[] = [
      { role: "system", content: UNIFIED_AGENT_PROMPT },
      {
        role: "system",
        content: [
          `PROJECT CONTEXT:`,
          `- project_id: ${project.id}`,
          `- App name/idea: ${project.prompt}`,
          `- target_stack: ${targetStackFallback}`,
          // If already built, tell AI not to rebuild
          alreadyBuilt && isExpoBuild
            ? `- BUILD STATUS: APP ALREADY BUILT (${existingFileCount} files exist). Do NOT rebuild from scratch. The user is returning to an existing project. Only make targeted edits if the user requests specific changes. Use ws_edit_file for small changes, ws_write_file only for new files. If user asks a question, just answer it. If user wants a fresh rebuild, they will explicitly say "rebuild".`
            : isExpoBuild
              ? `- BUILD MODE: APPROVED → build REAL Expo app with ws_* tools. Follow the OPTIMIZED WORKFLOW: (1) read_mockup, (2) write theme.ts, (3) write ALL screens rapidly, (4) ws_start_preview (handles install+export+serve), (5) ONE ws_command_status check, (6) tsc verify. NEVER manually run bun install. NEVER poll ws_command_status more than 2 times. Do NOT call generate_app.`
              : hasSchema
                ? `- The app HAS a schema with screens. Prefer surgical tools for edits.`
                : planApprovedInSession
                  ? `- The app has NO schema yet BUT the user has APPROVED the design plan. Call generate_app NOW with a detailed prompt based on the approved plan. Do NOT call research_and_plan again.`
                  : `- The app has NO schema yet. You MUST call research_and_plan FIRST before generate_app.`,
          !hasSchema && !planApprovedInSession
            ? `\n⚠️ IMPORTANT: generate_app is LOCKED until you call research_and_plan and the user approves the plan. Do NOT try to call generate_app directly.`
            : "",
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

    // Filter tools to agent-relevant ones.
    // - EXPO BUILD: remove every schema-path tool so the model can't take the
    //   generate_app shortcut and MUST build a real app with the ws_* tools.
    //   (It was getting "do a real Expo build, do NOT call generate_app" while
    //   generate_app was still callable, and the model called it anyway.)
    // - PLAN-FIRST GATE: when no schema and no approved plan, remove generate_app
    //   so the model is forced to call research_and_plan first.
    const SCHEMA_PATH_TOOLS = new Set([
      "generate_app", "generate_code", "export_project_code", "verify_schema",
      "update_screen", "add_element", "update_element", "remove_element",
      "update_theme", "update_navigation",
    ]);
    const allowedTools = isExpoBuild
      ? AGENT_TOOLS.filter(t => !SCHEMA_PATH_TOOLS.has(t))
      : !hasSchema && !planApprovedInSession
        ? AGENT_TOOLS.filter(t => t !== "generate_app")
        : AGENT_TOOLS;

    const agentTools = {
      anthropic: mcpToolsAsAnthropic().filter(t => allowedTools.includes(t.name)),
      openai: mcpToolsAsOpenAI().filter(t => allowedTools.includes(t.function.name)),
    };

    // Real Expo builds need a large step budget (write many files, run tsc/lint,
    // fix, re-verify). Schema edits stay cheap.
    const MAX_ITERS = isExpoBuild ? 30 : 8;
    const WRITE_TOOLS = new Set([
      "update_screen", "add_element", "update_element", "remove_element",
      "update_theme", "update_navigation", "generate_app", "create_project",
      "ws_write_file", "ws_edit_file", "ws_start_preview", "declare_backend",
    ]);

    // ── Token-budget guard ──────────────────────────────────────────
    // The Expo build loop can run dozens of iterations; cap total spend so a
    // confused agent can't burn unbounded tokens. Approximate (chars/4),
    // summed across iterations. Configurable via AGENT_BUILD_TOKEN_BUDGET.
    const TOKEN_BUDGET = Math.max(50_000, Number(process.env.AGENT_BUILD_TOKEN_BUDGET) || 2_000_000);
    let approxTokens = 0;

    for (let iter = 0; iter < MAX_ITERS; iter++) {
      // Expo builds: use strong (Pro) for ALL iterations — better code = fewer
      // fix loops = faster total wall-time despite slower per-call latency.
      // Schema edits use fast after iter 0 since they're simpler.
      const tier = isExpoBuild ? "strong" as const
        : iter === 0 ? "strong" as const : "fast" as const;

      const anth = toAnthropicMessages(msgs);
      const oai = toOpenAIMessages(msgs);

      // Stop BEFORE spending if this turn would exceed the token budget.
      const inputEst = Math.ceil((anth.system.length + JSON.stringify(anth.messages).length) / 4);
      if (approxTokens + inputEst > TOKEN_BUDGET) {
        const note = `⚠️ Reached the build token budget (~${Math.round(TOKEN_BUDGET / 1000)}k tokens) after ${iter} step(s). Pausing to avoid runaway cost — reply "continue" to keep building.`;
        await supabase.from("project_messages").insert({
          project_id: project.id, user_id: userId, role: "assistant", content: note,
        });
        yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Studio Agent', content: note };
        break;
      }
      approxTokens += inputEst;

      const streamRes = await callAIToolsStreamingTiered({
        system: anth.system,
        messages: { anthropic: anth.messages, openai: oai },
        tools: agentTools,
        tier,
      });

      console.log(`[chat] iter=${iter} tier=${tier} streamRes.ok=${streamRes.ok} provider=${(streamRes as any).provider ?? 'N/A'} model=${(streamRes as any).model ?? 'N/A'}`);
      if (!streamRes.ok) {
        console.error(`[chat] LLM call FAILED: ${streamRes.error}`);
        yield { type: 'agent_error' as const, role: 'developer' as AgentRole, error: streamRes.error };
        break;
      }

      const body = streamRes.response.body;
      if (!body) break;
      const reader = body.pipeThrough(new TextDecoderStream()).getReader();

      let assistantText = "";
      const completedTools: { id: string; name: string; input: Record<string, unknown>; thoughtSignature?: string }[] = [];

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
        const oaiTools: Record<number, { id: string; name: string; argJson: string; thoughtSignature?: string }> = {};
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
            let evt: { choices?: { delta?: { content?: string; extra_content?: { google?: { thought_signature?: string } }; tool_calls?: { index?: number; id?: string; extra_content?: { google?: { thought_signature?: string } }; function?: { name?: string; arguments?: string } }[] } }[] };
            try { evt = JSON.parse(d); } catch { continue; }
            const delta = evt.choices?.[0]?.delta;
            if (delta?.content) assistantText += delta.content;
            for (const tc of delta?.tool_calls ?? []) {
              const idx = tc.index ?? 0;
              const existing = oaiTools[idx] ?? { id: "", name: "", argJson: "" };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.argJson += tc.function.arguments;
              // Capture thought_signature for Gemini 3.x models
              const sig = tc.extra_content?.google?.thought_signature ?? (delta as Record<string, unknown>)?.extra_content?.google?.thought_signature;
              if (sig) existing.thoughtSignature = sig as string;
              oaiTools[idx] = existing;
            }
          }
        }
        for (const idx of Object.keys(oaiTools)) {
          const tc = oaiTools[Number(idx)];
          if (!tc.id || !tc.name) continue;
          let input: Record<string, unknown> = {};
          try { input = tc.argJson ? JSON.parse(tc.argJson) : {}; } catch { /* */ }
          completedTools.push({ id: tc.id, name: tc.name, input, thoughtSignature: tc.thoughtSignature });
        }
      }

      approxTokens += Math.ceil(assistantText.length / 4);
      console.log(`[chat] iter=${iter} parsed: assistantText=${assistantText.length} chars, tools=${completedTools.length} [${completedTools.map(t => t.name).join(', ')}]`);

      msgs.push({
        role: "assistant", content: assistantText,
        tool_calls: completedTools.length > 0 ? completedTools.map(t => ({ id: t.id, name: t.name, arguments: t.input })) : undefined,
      });

      // No tools → done
      if (completedTools.length === 0) {
        console.log(`[chat] iter=${iter} NO TOOLS returned. assistantText length=${assistantText.length} text='${assistantText.slice(0, 200)}'`);
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
        // ── HARD GATE: Block generate_app if plan wasn't approved ──
        if (tc.name === "generate_app" && !hasSchema && !planApprovedInSession) {
          const blockMsg = "BLOCKED: You must call research_and_plan first and wait for user approval before calling generate_app. Call research_and_plan now with a detailed prompt.";
          msgs.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: blockMsg, is_error: true });
          yield { type: 'tool_call' as const, name: tc.name, argsJson: JSON.stringify(tc.input) };
          yield { type: 'tool_done' as const, toolName: tc.name, success: false };
          continue;
        }

        yield { type: 'tool_call' as const, name: tc.name, argsJson: JSON.stringify(tc.input) };
        const tool = getMcpTool(tc.name);
        let resultContent: string;
        let isError = false;
        if (!tool) { resultContent = `Unknown tool: ${tc.name}`; isError = true; }
        else {
          try {
            const result = await tool.run(tc.input, { userId, patHash: "project-chat", supabase });
            resultContent = clipToolResult(JSON.stringify(result, null, 2)).text;

            // ── Emit design_brief event for plan-first workflow ──
            if (tc.name === "research_and_plan" && !isError) {
              const r = result as Record<string, unknown>;
              if (r.ok && r.awaiting_approval) {
                yield {
                  type: 'design_brief' as const,
                  planSteps: (r.plan_steps as string[]) ?? [],
                  briefJson: JSON.stringify(r.brief ?? {}),
                  mockupUrl: ((r.mockup_url as string) ?? ""),
                  appName: ((r.brief as Record<string, string>)?.appName ?? "App"),
                };

                // ── CRITICAL: Save a breadcrumb so next turn's history check works ──
                await supabase.from("project_messages").insert({
                  project_id: project.id, user_id: userId, role: "assistant",
                  content: `[DESIGN_PLAN_GENERATED] Here's your design plan for review. Click "Approve & Build" when you're ready, or tell me what to change.`,
                });

                planGeneratedThisTurn = true;
              }
            }

            // If user approved and generate_app just ran, mark plan as used
            if (tc.name === "generate_app" && !isError) {
              planApprovedInSession = true;
            }
          } catch (e) { resultContent = e instanceof Error ? e.message : String(e); isError = true; }
        }
        if (WRITE_TOOLS.has(tc.name) && !isError) modifiedProject = true;
        const toolMsg: Record<string, unknown> = { role: "tool", tool_call_id: tc.id, name: tc.name, content: resultContent, is_error: isError };
        // Pass thought_signature back for Gemini 3.x models
        if (tc.thoughtSignature) {
          toolMsg.extra_content = { google: { thought_signature: tc.thoughtSignature } };
        }
        msgs.push(toolMsg as typeof msgs[number]);
        yield { type: 'tool_done' as const, toolName: tc.name, success: !isError };

        // ── FORCE STOP after ws_start_preview succeeds ──
        // Once preview is started, wait for the build to actually complete.
        if (tc.name === "ws_start_preview" && !isError) {
          // Extract jobId from result to poll status
          let jobId: string | null = null;
          try {
            const parsed = JSON.parse(resultContent);
            jobId = parsed.jobId ?? null;
          } catch { /* */ }

          if (jobId) {
            console.log(`[chat] iter=${iter} ws_start_preview started jobId=${jobId} — waiting for build...`);
            const statusTool = getMcpTool("ws_command_status");
            if (statusTool) {
              // Poll for up to 90 seconds (18 checks × 5s)
              for (let poll = 0; poll < 18; poll++) {
                await new Promise(r => setTimeout(r, 5000));
                try {
                  const statusResult = await statusTool.run(
                    { project_id: project.id, job_id: jobId },
                    { userId, patHash: "project-chat", supabase },
                  );
                  const sr = statusResult as Record<string, unknown>;
                  console.log(`[chat] poll=${poll} status=${sr.status} exit=${sr.exitCode ?? 'n/a'}`);
                  if (sr.status === "done") {
                    if (sr.exitCode === 0) {
                      console.log(`[chat] ✅ Build completed successfully!`);
                    } else {
                      console.log(`[chat] ⚠️ Build exited with code ${sr.exitCode}`);
                    }
                    break;
                  }
                } catch (e) {
                  console.log(`[chat] poll error: ${e}`);
                  break;
                }
              }
            }
          }

          console.log(`[chat] iter=${iter} ✅ ws_start_preview done — STOPPING build loop.`);
          const doneMsg = assistantText.trim() || "✅ Your app is built and the preview is ready! Check the preview panel on the right.";
          await supabase.from("project_messages").insert({
            project_id: project.id, user_id: userId, role: "assistant", content: doneMsg,
          });
          yield { type: 'project_updated' as const };
          yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Studio Agent', content: doneMsg };
          // Jump to end of loop
          iter = MAX_ITERS;
          break;
        }
      }

      // Auto-verify after writes
      if (modifiedProject && !completedTools.some(tc => tc.name === "verify_schema")) {
        const vTool = getMcpTool("verify_schema");
        if (vTool) {
          const vid = `v-${Date.now()}`;
          try {
            const r = await vTool.run({ project_id: project.id }, { userId, patHash: "project-chat", supabase });
            msgs.push({ role: "assistant", content: "", tool_calls: [{ id: vid, name: "verify_schema", arguments: { project_id: project.id } }] });
            msgs.push({ role: "tool", tool_call_id: vid, name: "verify_schema", content: clipToolResult(JSON.stringify(r, null, 2)).text });
          } catch { /* non-fatal */ }
        }
      }

      if (modifiedProject) yield { type: "project_updated" as const };

      // ── FORCE STOP after plan generation ──
      // If research_and_plan ran this turn, STOP the loop immediately.
      // The model must NOT continue to call generate_app in the same turn.
      // User must explicitly approve in a NEW message.
      if (planGeneratedThisTurn) {
        yield { type: 'agent_complete' as const, role: 'developer' as AgentRole, name: 'Studio Agent', content: 'Design plan created. Waiting for your approval.' };
        break;
      }
    }

    yield { type: "done" as const };
  });
