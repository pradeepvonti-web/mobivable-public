/**
 * Declarative MCP tool manifest + dispatch table for the Mobivable MCP
 * server. The HTTP route imports `MCP_TOOLS` to answer `tools/list` and
 * routes `tools/call` invocations through `runTool`.
 *
 * Each entry has:
 *   - a name (kebab-style would be more MCP-idiomatic but Mobivable's
 *     server fns are snake_case, so we go with snake_case for consistency
 *     across the project)
 *   - a one-line description shown in the IDE's tool picker
 *   - a JSON-schema inputSchema describing the argument object
 *   - a `run` impl that takes the parsed args + a context object with
 *     `userId` and admin-scoped helpers
 *
 * Adding a new tool: drop a new entry in the array — the route picks it up
 * automatically. No casing-table edits or branching needed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  NATIVE_CAPABILITIES,
  type NativeCapabilityId,
  type NativeCapabilityRow,
} from "./native-capabilities";
import {
  wsWriteFile,
  wsReadFile,
  wsEditFile,
  wsListFiles,
  wsRunCommand,
  wsStartCommand,
  wsCommandStatus,
  ensureExpoWebPreview,
  embedMockupPng,
  probeWorkspaceRuntime,
  type WorkspaceCtx,
} from "./agent-workspace.server";
import { getBuiltinSkill, builtinSkillNames } from "./builtin-skills";

export interface McpToolContext {
  userId: string;
  /** sha256-hex of the bearer used; logged for forensics, never returned. */
  patHash: string;
  /** Optional user-authenticated Supabase client (passed from chat handler).
   *  Falls back to supabaseAdmin for DB operations. When SUPABASE_SERVICE_ROLE_KEY
   *  is missing, this client is the only way to read/write. */
  supabase?: { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema object — keep it small + concrete. */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  run: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;
}

/** Tiny helpers used across tools. Keeps the dispatch table readable. */
function str(args: Record<string, unknown>, key: string, def = ""): string {
  const v = args[key];
  return typeof v === "string" ? v : def;
}
function bool(args: Record<string, unknown>, key: string, def = false): boolean {
  const v = args[key];
  return typeof v === "boolean" ? v : def;
}
function num(args: Record<string, unknown>, key: string, def = 0): number {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}
/** Coerce a tool arg that may arrive as either an object or a JSON string. */
function obj(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : undefined; } catch { return undefined; }
  }
  return undefined;
}
function arr(args: Record<string, unknown>, key: string): unknown[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : undefined; } catch { return undefined; }
  }
  return undefined;
}
function uuid(args: Record<string, unknown>, key: string): string {
  const v = str(args, key);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new Error(`Tool argument \`${key}\` must be a UUID.`);
  }
  return v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Get a working Supabase client — tries supabaseAdmin first (RLS bypass),
 * falls back to the user's authenticated client from context.
 * This ensures tools work even when SUPABASE_SERVICE_ROLE_KEY is missing.
 */
function getDb(ctx?: McpToolContext): { from: (table: string) => any } {
  try {
    // Test if supabaseAdmin works by triggering the lazy proxy
    const test = supabaseAdmin;
    if (test && typeof test.from === "function") return test;
  } catch {
    // supabaseAdmin threw (SUPABASE_SERVICE_ROLE_KEY missing)
  }
  if (ctx?.supabase) return ctx.supabase;
  throw new Error("No database client available. Set SUPABASE_SERVICE_ROLE_KEY or pass a user session.");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Confirm the project belongs to the caller. Throws on mismatch. */
async function assertOwnsProject(userId: string, projectId: string): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Project ${projectId} not found.`);
    if (data.user_id !== userId) {
      throw new Error("That project doesn't belong to you.");
    }
  } catch (e) {
    // If supabaseAdmin isn't available (missing SUPABASE_SERVICE_ROLE_KEY),
    // skip the ownership check — the chat context already verified ownership.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY") || msg.includes("Missing Supabase")) {
      return; // Silently pass — ownership was verified upstream
    }
    throw e; // Re-throw real errors
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Load and parse the project's MobileAppSchema JSON from the DB. */
async function loadSchema(projectId: string, ctx?: McpToolContext): Promise<any> {
  const db = getDb(ctx);
  const { data, error } = await db
    .from("projects")
    .select("result")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  const raw = data?.result;
  if (!raw) throw new Error("Project has no schema yet. Generate the app first.");
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Project schema is invalid JSON.");
  }
}

/** Save a modified schema back to the project's result column. */
async function saveSchema(projectId: string, userId: string, schema: any, ctx?: McpToolContext): Promise<void> {
  const db = getDb(ctx);
  const { error } = await db
    .from("projects")
    .update({ result: JSON.stringify(schema), updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MCP_TOOLS: McpTool[] = [
  // ─── Read ───────────────────────────────────────────────────────────
  {
    name: "list_projects",
    description:
      "List the caller's Mobivable projects, newest first. Returns id, name, prompt, status, model, updated_at.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id, name, prompt, status, model, updated_at")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { projects: data ?? [] };
    },
  },
  {
    name: "get_project",
    description:
      "Get one project with its full MobileAppSchema, model, theme, and current status. Use list_screens for a lighter summary.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "UUID" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id, name, prompt, status, model, result, backend_spec, updated_at")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      return { project: data };
    },
  },
  {
    name: "list_screens",
    description:
      "List screens (id, title, layout, element count) from the project's generated MobileAppSchema.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("result")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      const raw = (data?.result ?? null) as string | object | null;
      let schema: { screens?: Array<{ id?: string; title?: string; layout?: string; elements?: unknown[] }> } | null = null;
      try {
        schema = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof schema);
      } catch {
        // schema may not be parsed-JSON yet
      }
      const screens = (schema?.screens ?? []).map((s) => ({
        id: s.id ?? null,
        title: s.title ?? null,
        layout: s.layout ?? null,
        elementCount: Array.isArray(s.elements) ? s.elements.length : 0,
      }));
      return { screens };
    },
  },
  {
    name: "get_screen",
    description:
      "Get one screen's full element list. Use this when you want to read or reason about a specific screen's components.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        screen_id: { type: "string" },
      },
      required: ["project_id", "screen_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      const screenId = str(args, "screen_id");
      if (!screenId) throw new Error("`screen_id` is required.");
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("result")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      let schema: { screens?: Array<{ id?: string }> } | null = null;
      try {
        schema = typeof data?.result === "string" ? JSON.parse(data.result) : (data?.result as typeof schema);
      } catch {
        // ignore
      }
      const screen = (schema?.screens ?? []).find((s) => s.id === screenId) ?? null;
      if (!screen) throw new Error(`Screen ${screenId} not found in project ${id}.`);
      return { screen };
    },
  },
  {
    name: "get_chat_history",
    description:
      "Recent project_messages (chat turns) for a project, ordered oldest → newest. Limit max 200.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      const limit = Math.min(Math.max(num(args, "limit", 50), 1), 200);
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("project_messages")
        .select("id, role, content, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { messages: (data ?? []).reverse() };
    },
  },
  {
    name: "list_test_runs",
    description: "Recent Maestro Cloud test runs for a project.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" }, limit: { type: "integer", default: 20 } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("eas_test_runs")
        .select("id, status, build_id, github_workflow_run_id, maestro_upload_id, created_at, finished_at, error_text")
        .eq("project_id", id)
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { runs: data ?? [] };
    },
  },
  {
    name: "list_builds",
    description: "Recent EAS builds the caller has triggered for a project.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" }, limit: { type: "integer", default: 20 } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
      await assertOwnsProject(ctx.userId, id);
      const { data, error } = await supabaseAdmin
        .from("eas_builds")
        .select("id, platform, status, artifact_url, eas_build_id, git_ref, created_at")
        .eq("project_id", id)
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { builds: data ?? [] };
    },
  },
  {
    name: "list_knowledge_items",
    description:
      "List the caller's saved knowledge items (PRDs, design notes, ingested URLs). Use add_knowledge_item / ingest_url to extend.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", default: 20 } },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
      const { data, error } = await supabaseAdmin
        .from("knowledge_items")
        .select("id, title, content, file_url, file_name, updated_at")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { items: data ?? [] };
    },
  },

  // ─── Write ──────────────────────────────────────────────────────────
  {
    name: "create_project",
    description:
      "Create a new Mobivable project from a one-paragraph app idea. Returns the new project_id (kick off agent generation by following up with send_chat_message).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project label shown in the dashboard." },
        prompt: { type: "string", description: "The seed app idea, like the studio's prompt composer takes." },
        model: { type: "string", description: "Optional model id, defaults to project model selection." },
      },
      required: ["name", "prompt"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const name = str(args, "name").trim().slice(0, 80);
      const prompt = str(args, "prompt").trim();
      const model = str(args, "model") || "google/gemini-2.5-flash";
      if (!name || !prompt) throw new Error("`name` and `prompt` are both required.");
      const { data, error } = await supabaseAdmin
        .from("projects")
        .insert({
          user_id: ctx.userId,
          name,
          prompt,
          model,
          status: "building",
        })
        .select("id, name, prompt, status, model, created_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        project: data,
        // Hint for the calling LLM about what to do next.
        next_step:
          "Call send_chat_message({ project_id, content: '<the same prompt or a refinement>' }) to kick off the agent crew.",
      };
    },
  },
  {
    name: "add_knowledge_item",
    description:
      "Save a text snippet (PRD section, brand notes, etc.) to the user's knowledge base so the agent crew reads it on next generation.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        content: { type: "string", description: "Text body (max ~50 KB)." },
      },
      required: ["title", "content"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const title = str(args, "title").trim().slice(0, 200);
      const content = str(args, "content").slice(0, 50_000);
      if (!title || !content) throw new Error("`title` and `content` are both required.");
      const { data, error } = await supabaseAdmin
        .from("knowledge_items")
        .insert({
          user_id: ctx.userId,
          title,
          content,
        })
        .select("id, title, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return { item: data };
    },
  },
  {
    name: "ingest_url",
    description:
      "Fetch a public URL and save its visible text as a knowledge item. Same SSRF defenses as the studio's URL ingestion (HTTPS only, no private IPs).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTPS URL." },
        title: { type: "string", description: "Optional title override." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { ingestUrl } = await import("./ingest-url.functions");
      // The createServerFn machinery expects a TanStack context object;
      // we synthesize the minimum it needs (the inner .handler reads
      // context.supabase + context.userId).
      const res = await ingestUrl({ data: { url: str(args, "url"), title: str(args, "title") || undefined } });
      void ctx; // userId already covered by the same-server auth path
      return res;
    },
  },
  {
    name: "delete_project",
    description:
      "Hard-delete one of the caller's projects (and all chat / agent_runs / eas_test_runs via CASCADE). Irreversible.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, id);
      const { error } = await supabaseAdmin
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true, deleted_project_id: id };
    },
  },
  {
    name: "update_project_prompt",
    description:
      "Replace a project's seed prompt. Doesn't re-run generation — follow up with send_chat_message for that.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" }, prompt: { type: "string" } },
      required: ["project_id", "prompt"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = uuid(args, "project_id");
      const prompt = str(args, "prompt").trim();
      if (!prompt) throw new Error("`prompt` is required.");
      await assertOwnsProject(ctx.userId, id);
      const { error } = await supabaseAdmin
        .from("projects")
        .update({ prompt })
        .eq("id", id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  },

  // ─── Research & Plan (Plan-First Workflow) ──────────────────────────
  // ALWAYS called before generate_app for new apps. Generates a structured
  // design brief + AI mockup image → shown in chat for user approval.
  {
    name: "research_and_plan",
    description:
      "Research the domain and create a design plan with AI mockup for user approval. ALWAYS call this BEFORE generate_app for new apps. Returns a structured plan with color palette, typography, screens, and a visual mockup image.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        prompt: {
          type: "string",
          description: "Detailed app concept — include target audience, features, screens, and design preferences.",
        },
      },
      required: ["project_id", "prompt"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      const prompt = str(args, "prompt").trim().slice(0, 4000);
      if (!prompt) throw new Error("`prompt` is required.");
      await assertOwnsProject(ctx.userId, projectId);

      const { callAIFast, callAIImage } = await import("./ai-provider");
      const { DESIGN_BRIEF_SYSTEM_PROMPT } = await import("./code-gen");

      // ── Step 1: Generate structured design brief ──
      const briefResult = await callAIFast(DESIGN_BRIEF_SYSTEM_PROMPT, prompt);
      if (!briefResult.ok) throw new Error(`Failed to generate design brief: ${briefResult.error}`);

      let brief: Record<string, unknown> = {};
      try {
        const text = briefResult.text;
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start) {
          brief = JSON.parse(text.slice(start, end + 1));
        }
      } catch {
        // If parsing fails, use the raw text
        brief = { raw: briefResult.text };
      }

      // ── Step 2: Generate comprehensive plan steps from the brief ──
      const screens = (brief.screens ?? []) as { id: string; title: string; layout?: string; purpose?: string; keyPrimitives?: string[] }[];
      const appName = (brief.appName as string) ?? "App";
      const audience = (brief.audience as string) ?? "general users";
      const domain = (brief.domain as string) ?? "general";
      const mood = (brief.mood as string) ?? "modern, clean";
      const paletteObj = (brief.palette ?? {}) as Record<string, unknown>;
      const typoObj = (brief.typography ?? {}) as Record<string, unknown>;
      const navItems = (brief.navigation as string[]) ?? [];

      const planSteps = [
        // 1. App Vision
        `📱 APP VISION: ${appName} — ${mood} ${domain} app for ${audience}`,
        // 2. Core Features
        `⚙️ CORE FEATURES: Auth, Profile, Dashboard, ${screens.map(s => s.title ?? s.id).join(", ")}, Search, Notifications, Settings`,
        // 3. User Journey
        `🗺️ USER JOURNEY: Open → Sign Up → Onboarding → Dashboard → ${screens.length > 2 ? (screens[1]?.title ?? "Main Action") : "Main Action"} → Review → Submit → Notifications`,
        // 4. Screen List
        ...screens.map((s, i) => `📋 Screen ${i + 1}: ${s.title ?? s.id} — ${s.layout ?? "stack"} layout — ${s.purpose ?? ""}`),
        // 5. UI/UX Design
        `🎨 DESIGN: ${paletteObj.mode ?? "dark"} mode — Primary ${paletteObj.primary ?? "#6366F1"}, Accent ${paletteObj.accent ?? "#F59E0B"}`,
        `✍️ TYPOGRAPHY: ${typoObj.headingFont ?? "Inter"} + ${typoObj.bodyFont ?? "DM Sans"}, ${typoObj.scale ?? "comfortable"} scale`,
        `✨ VISUAL STYLE: ${(brief.radius as string) ?? "rounded"} corners, ${(brief.spacing as string) ?? "comfortable"} spacing, ${(brief.motion as string) ?? "medium"} animations`,
        // 6. Architecture
        `🏗️ ARCHITECTURE: React Native/Expo + Supabase (PostgreSQL, Auth, RLS, Storage)`,
        // 7. Data Model
        `🗄️ DATA MODEL: User, Profile, ${domain === "fintech" ? "Account, Transaction, Card" : domain === "fitness" ? "Workout, Exercise, Progress" : domain === "ecommerce" ? "Product, Order, Cart, Review" : "MainEntity, SubEntity"}, Notification`,
        // 8. API Plan
        `🔌 API: Auth (signup/login/reset), CRUD for main entities, Notifications, Profile management`,
        // 9. Development Phases
        `📅 PHASES: Discovery (1w) → UI/UX Design (1-2w) → Backend (1-2w) → Mobile Dev (3-6w) → Testing (1-2w) → App Store (1w)`,
        // 10. MVP Scope
        `🎯 MVP: Login, Dashboard, Core workflow, Basic profile — defer advanced features, animations, admin panel`,
        // 11. Navigation
        `🧭 NAVIGATION: ${navItems.length > 0 ? navItems.join(", ") : "bottom-tabs"}`,
        // 12. Inspirations
        `💡 INSPIRATIONS: ${((brief.references as string[]) ?? []).join(", ") || "Premium app designs"}`,
        // 13. Testing
        `✅ TESTING: Install, auth flows, navigation, form validation, API error handling, multi-device`,
        // 14. Security
        `🔒 SECURITY: Secure auth, API protection, input validation, HTTPS, RLS policies, encrypted secrets`,
        // 15. App Store
        `📦 APP STORE: Logo, icon, splash screen, screenshots, descriptions, privacy policy, terms`,
        // 16. Success Metrics
        `📊 SUCCESS: Track downloads, active users, retention, crash-free rate, app store rating, conversion`,
      ];


      // ── Step 3: Generate design mockup image ──
      const palette = brief.palette as Record<string, string> | undefined;
      const screenDescs = screens.slice(0, 4).map((s, i) =>
        `Screen ${i + 1} "${s.title ?? s.id}": ${s.layout ?? "stack"} layout with ${(s.keyPrimitives ?? []).slice(0, 3).join(", ") || "cards and lists"}`
      ).join(". ");

      const mockupPrompt = `Professional mobile app UI mockup design. A 2x2 grid of 4 iPhone 15 Pro smartphones on a dark charcoal background (#1a1a2e). App name: "${appName}". Color scheme: primary ${palette?.primary ?? "#6366F1"}, accent ${palette?.accent ?? "#F59E0B"}, background ${palette?.background ?? "#0A0A1A"}. ${screenDescs}. Each phone shows a different fully-designed screen with realistic data, charts, and UI elements. Screen labels in white text below each phone. Ultra clean, Dribbble/Behance quality, modern flat UI design, high resolution. The screens should feel premium with proper spacing, typography, and visual hierarchy.`;

      let mockupUrl: string | null = null;
      try {
        const imgResult = await callAIImage(mockupPrompt);
        if (imgResult.ok) {
          mockupUrl = imgResult.dataUrl;
        }
      } catch {
        // Non-fatal — plan works without mockup
      }

      // ── Step 4: Save brief + mockup to project attachments ──
      // Loaded by generate_app (brief) and read_mockup / the build pipeline
      // (mockup). MUST use the `design_mockup_url` key every reader expects,
      // and MERGE so we don't clobber other attachment keys (target_stack,
      // agent_workspace, …) on a re-plan.
      try {
        const db = getDb(ctx);
        const { data: existing } = await db
          .from("projects")
          .select("attachments")
          .eq("id", projectId)
          .maybeSingle();
        const prev =
          existing?.attachments && typeof existing.attachments === "object" && !Array.isArray(existing.attachments)
            ? (existing.attachments as Record<string, unknown>)
            : {};
        await db
          .from("projects")
          .update({
            attachments: { ...prev, design_brief: brief, design_mockup_url: mockupUrl },
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .eq("user_id", ctx.userId);
      } catch {
        // Non-fatal — brief save skipped, generate_app will create one
      }

      return {
        ok: true,
        awaiting_approval: true,
        plan_steps: planSteps,
        brief,
        mockup_url: mockupUrl,
        message: `I've created a design plan for "${appName}" with ${screens.length} screens. Review the plan and mockup, then approve to start building.`,
      };
    },
  },
  {
    name: "generate_app",
    description:
      "Generate a complete mobile app schema from a prompt. ⚠️ REQUIRES research_and_plan to be called first and user approval — this tool is LOCKED until then. Creates screens, navigation, theme — saves directly to the project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        prompt: { type: "string", description: "Detailed description of the app to build. Include features, target audience, style preferences." },
      },
      required: ["project_id", "prompt"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const project_id = uuid(args, "project_id");
      const prompt = str(args, "prompt").trim().slice(0, 4000);
      if (!prompt) throw new Error("`prompt` is required.");
      await assertOwnsProject(ctx.userId, project_id);

      const { callAIFast, callAIStrong } = await import("./ai-provider");
      const { CODE_GEN_SYSTEM_PROMPT, DESIGN_BRIEF_SYSTEM_PROMPT, parseAppSchema } = await import("./code-gen");

      // ── PASS 1: Prefer saved design brief from research_and_plan ──
      // When the plan-first workflow ran, the brief is already saved in
      // project.attachments.design_brief. Re-using it ensures the generated
      // app matches the mockup the user approved.
      let designBrief = "";
      try {
        const db = getDb(ctx);
        const { data: proj } = await db
          .from("projects")
          .select("attachments")
          .eq("id", project_id)
          .single();
        const att = proj?.attachments as Record<string, unknown> | null;
        if (att?.design_brief && typeof att.design_brief === "object") {
          designBrief = JSON.stringify(att.design_brief);
          console.log("[generate_app] Using saved design brief from research_and_plan");
        }
      } catch {
        // Fall through to generate a new one
      }

      // Only generate a fresh brief if none was saved (e.g., direct call without plan)
      if (!designBrief) {
        const briefResult = await callAIFast(DESIGN_BRIEF_SYSTEM_PROMPT, prompt);
        if (briefResult.ok && briefResult.text.includes("{")) {
          designBrief = briefResult.text;
        }
      }

      // ── PASS 2: Generate the full schema (strong model) ──
      // Feed the design brief as context so the AI follows specific
      // design direction instead of guessing from a vague prompt.
      const enrichedPrompt = designBrief
        ? `DESIGN BRIEF (follow this strictly):\n${designBrief}\n\nUSER REQUEST:\n${prompt}\n\nGenerate a PREMIUM, visually stunning mobile app following the design brief above. Use the specified palette, typography, layout per screen, and key primitives. Make it look like it belongs on Dribbble.`
        : `${prompt}\n\nMake it PREMIUM quality — use glass-cards, parallax-heroes, gradient-mesh backgrounds, stat-card-xl with sparklines, and domain-appropriate typography. At least 4-5 screens with varied layouts (bento-grid, magazine, split-hero). Real data, not placeholders.`;

      const result = await callAIStrong(CODE_GEN_SYSTEM_PROMPT, enrichedPrompt);
      if (!result.ok) throw new Error(`AI generation failed: ${result.error}`);

      const schema = parseAppSchema(result.text);
      if (!schema) throw new Error("Failed to parse generated schema. The AI output was not valid JSON.");

      // Save to project and mark as ready
      const db = getDb(ctx);
      const { error: saveErr } = await db
        .from("projects")
        .update({
          result: JSON.stringify(schema),
          status: "ready",
          error_text: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project_id)
        .eq("user_id", ctx.userId);
      if (saveErr) throw new Error(saveErr.message);

      // Regenerate the React/Sandpack source (project_file_overrides) from the
      // freshly saved schema so the preview reflects THIS plan instead of the
      // last "Regenerate" click. Without this, the React preview drifts from
      // the schema (and the Flutter preview), which reads it live. Best-effort:
      // the schema is already saved, so a failure here just means the user
      // needs to click Regenerate.
      let code_files: number | undefined;
      try {
        const { buildCodeForProjectInternal } = await import("./code-gen-build.functions");
        const cg = await buildCodeForProjectInternal(project_id, ctx.userId, ctx.supabase);
        if (cg.ok) code_files = cg.fileCount;
        else console.error("[generate_app] auto code-gen failed:", cg.error);
      } catch (e) {
        console.error("[generate_app] auto code-gen threw:", e instanceof Error ? e.message : e);
      }

      return {
        ok: true,
        screen_count: schema.screens?.length ?? 0,
        nav_type: schema.navigation?.type ?? "none",
        theme_mode: (typeof schema.theme === "object" && schema.theme !== null ? (schema.theme as Record<string, unknown>).mode : undefined) ?? "dark",
        model: result.model,
        used_design_brief: !!designBrief,
        code_files,
      };
    },
  },

  // ─── Native capabilities ───────────────────────────────────────────
  // Per-capability tools wire the right deps + Expo config plugins +
  // iOS Info.plist strings + Android permissions onto the project. The
  // Expo exporter reads `projects.native_capabilities` at zip time and
  // emits everything declared in `native-capabilities.ts` for each row.
  //
  // Lovable can't do this — they output web. This is the moat.
  ...buildNativeCapabilityTools(),

  // ─── Action ─────────────────────────────────────────────────────────
  // Long-running studio actions (Expo zip export, backend provisioning,
  // Maestro Cloud dispatch) live behind TanStack `createServerFn` middleware
  // that authenticates via Supabase JWT — they can't be safely invoked from
  // the MCP route, which authenticates via mvbl_pat_ Bearer instead.
  //
  // To expose them through MCP we need to extract each handler's inner body
  // into a (userId, params) → result function the MCP can call with the
  // admin client. That refactor is intentionally deferred: ship the read/
  // write tools first, prove the wire end-to-end, then lift the heavy
  // actions in a follow-up. For now MCP callers should drive these from the
  // studio UI; we'll surface them once the impls are extracted.

  // ─── Surgical Schema Edit Tools ─────────────────────────────────────
  // Phase 1: Cursor/Antigravity-style precise edits. Each tool does a
  // read-modify-write on projects.result JSON — no full regeneration.
  {
    name: "update_screen",
    description:
      "Update a specific screen's properties (title, layout, background, transition, icon) without regenerating the entire schema. Surgical edit.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "UUID" },
        screen_id: { type: "string", description: "Screen id to update" },
        title: { type: "string", description: "New screen title" },
        layout: { type: "string", description: "stack|bento-grid|magazine|split-hero|full-bleed" },
        icon: { type: "string", description: "New icon name" },
        transition: { type: "string", description: "slide|fade|zoom|none" },
        background: { type: "string", description: "JSON-encoded background object: { type, color?, colors?, direction?, image?, prompt?, opacity? }" },
      },
      required: ["project_id", "screen_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      if (args.title !== undefined) screen.title = str(args, "title");
      if (args.layout !== undefined) screen.layout = str(args, "layout");
      if (args.icon !== undefined) screen.icon = str(args, "icon");
      if (args.transition !== undefined) screen.transition = str(args, "transition");
      const bg = obj(args, "background");
      if (bg !== undefined) screen.background = bg;
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, screen_id: screen.id, updated: Object.keys(args).filter(k => k !== "project_id" && k !== "screen_id") };
    },
  },
  {
    name: "add_element",
    description:
      "Add a single UI element to a screen at a specific position. Use this instead of regenerating the entire schema. Supports all element types: glass-card, parallax-hero, stat-card-xl, button, list, etc.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        screen_id: { type: "string" },
        element: { type: "string", description: "JSON-encoded element object: { type, props, style?, action?, entrance?, gesture?, span?, margin? }" },
        position: { type: "integer", description: "Insert index (0-based). Omit or -1 to append at end." },
      },
      required: ["project_id", "screen_id", "element"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      if (!Array.isArray(screen.elements)) screen.elements = [];
      const el = obj(args, "element");
      if (!el?.type) throw new Error("`element.type` is required.");
      const pos = num(args, "position", -1);
      if (pos >= 0 && pos < screen.elements.length) {
        screen.elements.splice(pos, 0, el);
      } else {
        screen.elements.push(el);
      }
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, screen_id: screen.id, element_type: el.type, position: pos >= 0 ? pos : screen.elements.length - 1, total_elements: screen.elements.length };
    },
  },
  {
    name: "update_element",
    description:
      "Update a specific element's properties on a screen. Identify the element by index or by type+match. Only the provided props are merged — other props are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        screen_id: { type: "string" },
        element_index: { type: "integer", description: "0-based index of the element on the screen." },
        props: { type: "string", description: "JSON-encoded props object to merge." },
        style: { type: "string", description: "JSON-encoded style overrides to merge." },
        action: { type: "string", description: "JSON-encoded action object (navigate, sheet, dialog, url, dismiss)." },
        entrance: { type: "string", description: "Entrance animation: fade-up|fade-in|scale-in|slide-left|pop|blur-in|none" },
        gesture: { type: "string", description: "Gesture: tap-scale|press-glow|swipe-hint" },
      },
      required: ["project_id", "screen_id", "element_index"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      const idx = num(args, "element_index", -1);
      if (idx < 0 || idx >= (screen.elements?.length ?? 0)) {
        throw new Error(`Element index ${idx} out of range (screen has ${screen.elements?.length ?? 0} elements).`);
      }
      const el = screen.elements[idx];
      const p = obj(args, "props");
      const s = obj(args, "style");
      const a = obj(args, "action");
      if (p) el.props = { ...(el.props ?? {}), ...p };
      if (s) el.style = { ...(el.style ?? {}), ...s };
      if (a !== undefined) el.action = a;
      if (args.entrance !== undefined) el.entrance = str(args, "entrance");
      if (args.gesture !== undefined) el.gesture = str(args, "gesture");
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, screen_id: screen.id, element_index: idx, element_type: el.type };
    },
  },
  {
    name: "remove_element",
    description:
      "Remove an element from a screen by index.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        screen_id: { type: "string" },
        element_index: { type: "integer", description: "0-based index of the element to remove." },
      },
      required: ["project_id", "screen_id", "element_index"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      const idx = num(args, "element_index", -1);
      if (idx < 0 || idx >= (screen.elements?.length ?? 0)) {
        throw new Error(`Element index ${idx} out of range.`);
      }
      const removed = screen.elements.splice(idx, 1)[0];
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, removed_type: removed?.type, remaining_elements: screen.elements.length };
    },
  },
  {
    name: "update_theme",
    description:
      "Update specific theme properties without regenerating the entire schema. Merge-style: only provided fields are changed.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        primary: { type: "string", description: "#hex color" },
        accent: { type: "string", description: "#hex color" },
        background: { type: "string", description: "#hex color" },
        card: { type: "string", description: "#hex color" },
        text: { type: "string", description: "#hex color" },
        muted: { type: "string", description: "#hex color" },
        border: { type: "string", description: "#hex color" },
        mode: { type: "string", description: "dark|light" },
        gradient: { type: "string", description: "JSON-encoded array like [\"#hex\", \"#hex\"]" },
        typography: { type: "string", description: "JSON-encoded { headingFont?, bodyFont?, displayFont?, scale? }" },
        motion: { type: "string", description: "JSON-encoded { duration?, easing?, intensity? }" },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      if (!schema.theme) schema.theme = {};
      const scalarFields = ["primary", "accent", "background", "card", "text", "muted", "border", "mode"];
      const updated: string[] = [];
      for (const f of scalarFields) {
        if (args[f] !== undefined) {
          schema.theme[f] = args[f];
          updated.push(f);
        }
      }
      const g = arr(args, "gradient");
      if (g) { schema.theme.gradient = g; updated.push("gradient"); }
      const typo = obj(args, "typography");
      if (typo) {
        schema.theme.typography = { ...(schema.theme.typography ?? {}), ...typo };
        updated.push("typography");
      }
      const mo = obj(args, "motion");
      if (mo) {
        schema.theme.motion = { ...(schema.theme.motion ?? {}), ...mo };
        updated.push("motion");
      }
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, updated_fields: updated };
    },
  },
  {
    name: "update_navigation",
    description:
      "Change navigation type, add/remove/reorder tabs, update nav styling.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        type: { type: "string", description: "bottom-tabs|drawer|floating-bottom|top-tabs|none" },
        items: { type: "string", description: "JSON-encoded array of { screen, label, icon }" },
        navStyle: { type: "string", description: "JSON-encoded { background?, activeColor?, inactiveColor?, blur? }" },
        showLabels: { type: "boolean" },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      if (!schema.navigation) schema.navigation = { type: "bottom-tabs", items: [] };
      const updated: string[] = [];
      if (args.type !== undefined) { schema.navigation.type = str(args, "type"); updated.push("type"); }
      const items = arr(args, "items");
      if (items) { schema.navigation.items = items; updated.push("items"); }
      const ns = obj(args, "navStyle");
      if (ns) { schema.navigation.navStyle = ns; updated.push("navStyle"); }
      if (args.showLabels !== undefined) { schema.navigation.showLabels = bool(args, "showLabels"); updated.push("showLabels"); }
      await saveSchema(projectId, ctx.userId, schema, ctx);
      return { ok: true, updated_fields: updated, nav_type: schema.navigation.type, tab_count: schema.navigation.items?.length ?? 0 };
    },
  },
  {
    name: "verify_schema",
    description:
      "Validate a project's schema for issues: missing screens, broken nav links, empty elements, incomplete theme. Call this after any write operation to ensure the schema is valid.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const schema = await loadSchema(projectId, ctx);
      const issues: string[] = [];
      // Check screens
      if (!schema.screens || schema.screens.length === 0) issues.push("No screens defined.");
      for (const s of schema.screens ?? []) {
        if (!s.id) issues.push(`Screen missing id.`);
        if (!s.elements || s.elements.length === 0) issues.push(`Screen "${s.id}" has no elements.`);
        if (s.elements && s.elements.length < 3) issues.push(`Screen "${s.id}" has only ${s.elements.length} elements — consider adding more for a premium feel.`);
      }
      // Check navigation
      const screenIds = new Set((schema.screens ?? []).map((s: { id?: string }) => s.id));
      for (const nav of schema.navigation?.items ?? []) {
        if (nav.screen && !screenIds.has(nav.screen)) {
          issues.push(`Nav tab "${nav.label}" points to missing screen "${nav.screen}".`);
        }
      }
      // Check theme
      if (!schema.theme) issues.push("No theme defined.");
      else {
        if (!schema.theme.primary) issues.push("Theme missing primary color.");
        if (!schema.theme.background) issues.push("Theme missing background color.");
        if (!schema.theme.typography) issues.push("Theme missing typography.");
      }
      // Check actions
      let hasNavigateAction = false;
      for (const s of schema.screens ?? []) {
        for (const el of s.elements ?? []) {
          if (el.action?.type === "navigate") {
            hasNavigateAction = true;
            if (el.action.screen && !screenIds.has(el.action.screen)) {
              issues.push(`Element "${el.type}" on screen "${s.id}" navigates to missing screen "${el.action.screen}".`);
            }
          }
        }
      }
      if (!hasNavigateAction) issues.push("No navigate actions found — screens are disconnected. Add navigate actions to buttons.");
      return {
        ok: issues.length === 0,
        screen_count: schema.screens?.length ?? 0,
        total_elements: (schema.screens ?? []).reduce((sum: number, s: { elements?: unknown[] }) => sum + (s.elements?.length ?? 0), 0),
        nav_tabs: schema.navigation?.items?.length ?? 0,
        issues,
      };
    },
  },

  // ─── Phase 5: Code generation tools ─────────────────────────────────

  {
    name: "generate_code",
    description: "Generate production-ready React Native/Expo code for a single screen from the project schema. Uses AI to produce real, runnable code (not template rendering). Returns the TypeScript source.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
        screen_id: { type: "string", description: "The screen ID to generate code for" },
        style: { type: "string", description: "Code style: 'expo-router' (default) | 'plain-rn'" },
      },
      required: ["project_id", "screen_id"],
    },
    run: async (args: Record<string, unknown>, ctx: McpToolContext) => {
      const projectId = args.project_id as string;
      const screenId = args.screen_id as string;
      const style = (args.style as string) ?? "expo-router";
      const schema = await loadSchema(projectId, ctx);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === screenId);
      if (!screen) throw new Error(`Screen '${screenId}' not found`);

      const { callAIStrong } = await import("./ai-provider");
      const codeGenPrompt =
        `Generate a production-ready React Native (Expo) screen component.\n\n` +
        `SCREEN DATA:\n${JSON.stringify(screen, null, 2)}\n\n` +
        `THEME:\n${JSON.stringify(schema.theme ?? {}, null, 2)}\n\n` +
        `NAVIGATION: ${JSON.stringify(schema.navigation ?? {}, null, 2)}\n\n` +
        `REQUIREMENTS:\n` +
        `- ${style === "expo-router" ? "Use expo-router for navigation (import { useRouter } from 'expo-router')" : "Use plain React Navigation props"}\n` +
        `- TypeScript (.tsx file)\n` +
        `- Use StyleSheet.create for styles\n` +
        `- Export default the screen component\n` +
        `- Use theme colors from a '../theme' import\n` +
        `- Implement ALL elements from the screen data\n` +
        `- Use real RN primitives: View, Text, Pressable, ScrollView, Image, FlatList\n` +
        `- Add proper TypeScript types\n` +
        `- Include proper imports\n` +
        `- Make it production-ready with proper spacing, padding, and layout\n\n` +
        `Output ONLY the TypeScript source code. No markdown, no explanation.`;

      const result = await callAIStrong(
        "You are a React Native code generator. Output ONLY valid TypeScript/TSX code. No markdown fences, no explanations.",
        codeGenPrompt,
      );
      if (!result.ok) throw new Error(result.error);

      // Strip markdown fences if AI accidentally added them
      let code = result.text.trim();
      if (code.startsWith("```")) {
        code = code.replace(/^```(?:tsx?|typescript|javascript)?\n?/, "").replace(/\n?```$/, "");
      }

      return {
        screen_id: screenId,
        screen_title: screen.title ?? screenId,
        code,
        bytes: code.length,
        model: result.model,
      };
    },
  },

  {
    name: "export_project_code",
    description: "Generate a full multi-screen Expo project from the schema. Returns file manifest with paths + source code for every file. Includes: theme.ts, navigation, per-screen components, App.tsx, package.json.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
      },
      required: ["project_id"],
    },
    run: async (args: Record<string, unknown>, ctx: McpToolContext) => {
      const projectId = args.project_id as string;
      const schema = await loadSchema(projectId, ctx);

      // Read project name
      const adm = supabaseAdmin;
      const { data: proj } = await adm
        .from("projects")
        .select("name, prompt")
        .eq("id", projectId)
        .single();
      const appName = proj?.name ?? "My App";

      const screens = schema.screens ?? [];
      const theme = schema.theme ?? {};
      const nav = schema.navigation ?? {};
      const navItems = nav.items ?? [];

      // ── Generate theme.ts ──
      const colors = theme.colors ?? {};
      const themeTs = `export const theme = {
  colors: {
    primary: ${JSON.stringify(colors.primary ?? "#6366f1")},
    secondary: ${JSON.stringify(colors.secondary ?? "#8b5cf6")},
    accent: ${JSON.stringify(colors.accent ?? "#06b6d4")},
    background: ${JSON.stringify(colors.background ?? "#0a0a0f")},
    card: ${JSON.stringify(colors.card ?? "#161623")},
    text: ${JSON.stringify(colors.text ?? "#ffffff")},
    muted: ${JSON.stringify(colors.muted ?? "#9ca3af")},
    border: ${JSON.stringify(colors.border ?? "rgba(255,255,255,0.08)")},
  },
  fonts: {
    heading: ${JSON.stringify(theme.fonts?.heading ?? "System")},
    body: ${JSON.stringify(theme.fonts?.body ?? "System")},
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
  spacing: (n: number) => n * 4,
} as const;
`;

      // ── Generate per-screen files using template renderer ──
      const { renderSchemaToRn } = await import("./rn-renderer");
      const screenFiles: { path: string; code: string }[] = [];
      const screenIds: string[] = [];

      for (const screen of screens) {
        const id = screen.id ?? `screen-${screenIds.length}`;
        screenIds.push(id);
        const fileName = id.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

        const rendered = renderSchemaToRn({
          appName,
          theme: {
            primary: colors.primary ?? "#6366f1",
            background: colors.background ?? "#0a0a0f",
            card: colors.card ?? "#161623",
            text: colors.text ?? "#ffffff",
            muted: colors.muted ?? "#9ca3af",
          },
          screen: screen as { id?: string; title?: string; elements?: unknown[] },
        });

        screenFiles.push({
          path: `app/${fileName}.tsx`,
          code: rendered.appTsx,
        });
      }

      // ── Generate _layout.tsx with tab navigation ──
      const tabImports = screenFiles.map((f, i) => {
        const name = f.path.replace("app/", "").replace(".tsx", "");
        const title = screens[i]?.title ?? name;
        return { name, title, icon: navItems[i]?.icon ?? "📱" };
      });

      const hasBottomNav = nav.type === "bottom-tabs" || nav.type === "floating-bottom" || navItems.length > 0;

      let layoutCode: string;
      if (hasBottomNav && tabImports.length > 1) {
        layoutCode = `import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.muted,
        }}
      >
${tabImports.map(t => `        <Tabs.Screen
          name="${t.name}"
          options={{
            title: ${JSON.stringify(t.title)},
            tabBarLabel: ${JSON.stringify(t.title)},
          }}
        />`).join("\n")}
      </Tabs>
    </>
  );
}
`;
      } else {
        layoutCode = `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </>
  );
}
`;
      }

      // ── Build file manifest ──
      const files = [
        { path: "theme.ts", code: themeTs },
        { path: "app/_layout.tsx", code: layoutCode },
        ...screenFiles,
        {
          path: "package.json",
          code: JSON.stringify({
            name: appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "my-app",
            version: "1.0.0",
            main: "expo-router/entry",
            scripts: {
              start: "expo start",
              android: "expo start --android",
              ios: "expo start --ios",
              web: "expo start --web",
            },
            dependencies: {
              expo: "~51.0.0",
              "expo-router": "~3.5.0",
              "expo-status-bar": "~1.12.0",
              react: "18.2.0",
              "react-native": "0.74.5",
              "react-native-safe-area-context": "4.10.5",
              "react-native-screens": "3.31.1",
              "react-native-gesture-handler": "~2.16.1",
              "@react-navigation/native": "^6.0.2",
            },
          }, null, 2),
        },
        {
          path: "app.json",
          code: JSON.stringify({
            expo: {
              name: appName,
              slug: appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "my-app",
              version: "1.0.0",
              orientation: "portrait",
              userInterfaceStyle: "automatic",
              plugins: ["expo-router"],
            },
          }, null, 2),
        },
        {
          path: "tsconfig.json",
          code: JSON.stringify({ extends: "expo/tsconfig.base", compilerOptions: { strict: true } }, null, 2),
        },
      ];

      // ── Store generated code as project metadata ──
      const codeManifest = { generated_at: new Date().toISOString(), files: files.map(f => ({ path: f.path, bytes: f.code.length })) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adm as any).from("projects").update({
        generated_code: JSON.stringify({ manifest: codeManifest, files }),
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);

      return {
        ok: true,
        file_count: files.length,
        screen_count: screens.length,
        total_bytes: files.reduce((sum, f) => sum + f.code.length, 0),
        files: files.map(f => ({ path: f.path, bytes: f.code.length })),
      };
    },
  },

  // ─── Agent workspace (real files + shell in a persistent E2B sandbox) ──
  // These power the autonomous build flow: the agent writes real Expo source
  // and runs bun/tsc/eslint against a live sandbox, then self-corrects. Every
  // write is mirrored to project_file_overrides so output is durable + viewable.
  {
    name: "ws_write_file",
    description:
      "Write (create or overwrite) a file in the project's live build workspace (an Expo app sandbox). Use forward-slash paths relative to the workspace root, e.g. 'app/(tabs)/index.tsx'. Mirrors to the project so it persists.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Target project id (the workspace owner)." },
        path: { type: "string", description: "Workspace-relative path, e.g. 'store/useAppStore.ts'." },
        content: { type: "string", description: "Full file contents to write." },
      },
      required: ["project_id", "path", "content"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsWriteFile(str(args, "project_id"), wctx, str(args, "path"), str(args, "content"));
    },
  },
  {
    name: "ws_read_file",
    description: "Read a file from the project's live build workspace. Returns its full text content.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string", description: "Workspace-relative path to read." },
      },
      required: ["project_id", "path"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsReadFile(str(args, "project_id"), wctx, str(args, "path"));
    },
  },
  {
    name: "ws_edit_file",
    description:
      "Make a surgical edit to a workspace file by replacing an exact, unique substring. old_string must appear exactly once. Prefer this over ws_write_file for small changes.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string" },
        old_string: { type: "string", description: "Exact text to replace (must be unique in the file)." },
        new_string: { type: "string", description: "Replacement text." },
      },
      required: ["project_id", "path", "old_string", "new_string"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsEditFile(str(args, "project_id"), wctx, str(args, "path"), str(args, "old_string"), str(args, "new_string"));
    },
  },
  {
    name: "ws_list_files",
    description: "List files/directories at a path in the project's build workspace (default: workspace root).",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        path: { type: "string", description: "Workspace-relative directory (default '.')." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsListFiles(str(args, "project_id"), wctx, str(args, "path", "."));
    },
  },
  {
    name: "ws_run_command",
    description:
      "Run a shell command in the project's build workspace (cwd = workspace root). Allowlisted to dev tools: bun, bunx, npm, npx, node, tsc, eslint, expo, ls, cat, find, grep, head, tail, mkdir, rm, mv, cp. Use for `bunx tsc --noEmit`, `bun run lint`, `bun install`, etc. Returns exitCode, stdout, stderr.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        command: { type: "string", description: "The command line to run, e.g. 'bunx tsc --noEmit'." },
        timeout_ms: { type: "integer", description: "Optional wall-clock cap (1000–300000)." },
      },
      required: ["project_id", "command"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      const timeoutMs = num(args, "timeout_ms", 0);
      return wsRunCommand(str(args, "project_id"), wctx, str(args, "command"), timeoutMs ? { timeoutMs } : {});
    },
  },
  {
    name: "ws_run_command_async",
    description:
      "Start a LONG shell command (e.g. `bun install`, `bunx expo export -p web`) in the background and return a job id immediately. Use this for anything that may take more than ~60s so the request doesn't time out, then poll ws_command_status. Use the synchronous ws_run_command for quick checks (tsc, lint, ls).",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        command: { type: "string", description: "The command to run in the background." },
      },
      required: ["project_id", "command"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsStartCommand(str(args, "project_id"), wctx, str(args, "command"));
    },
  },
  {
    name: "ws_command_status",
    description:
      "Check a background job started by ws_run_command_async or ws_start_preview. Returns status ('running' or 'done'), exitCode when done, and the captured output so far. Poll this until status='done'.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        job_id: { type: "string", description: "The jobId returned by the async tool." },
      },
      required: ["project_id", "job_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return wsCommandStatus(str(args, "project_id"), wctx, str(args, "job_id"));
    },
  },
  {
    name: "ws_start_preview",
    description:
      "Build the project's Expo app for web and start a live preview, returning a public URL the studio renders in the device frame. Call this as the FINAL step of a build (after tsc/lint pass). Pass rebuild=true to re-export after later edits.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        rebuild: { type: "boolean", description: "Re-export the web bundle to pick up new edits (default false)." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      return ensureExpoWebPreview(str(args, "project_id"), wctx, { rebuild: bool(args, "rebuild", false) });
    },
  },
  {
    name: "invoke_skill",
    description:
      "Load a reusable instruction skill by name and return its body to follow. Use 'frontend-design' during an Expo build (after reading the mockup, before writing screens) to anchor the UI on a premium design system. Resolves the caller's own saved skills first, then built-in skills.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name, e.g. 'frontend-design'." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const name = str(args, "name").trim().toLowerCase();
      if (!name) throw new Error("`name` is required.");
      // 1. The caller's own saved skill wins (lets users override built-ins).
      // mcp_agent_skills isn't in the generated types — use the loose-cast
      // client pattern (same as skills.functions.ts).
      const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data } = (await adm
        .from("mcp_agent_skills")
        .select("name, body")
        .eq("user_id", ctx.userId)
        .eq("name", name)
        .maybeSingle()) as { data: { name: string; body: string } | null };
      if (data?.body) {
        return { name: data.name, source: "user", body: data.body };
      }
      // 2. Fall back to a built-in skill.
      const builtin = getBuiltinSkill(name);
      if (builtin) {
        return { name, source: "builtin", body: builtin };
      }
      throw new Error(
        `Unknown skill "${name}". Available built-in skills: ${builtinSkillNames().join(", ")}. Create your own in Settings.`,
      );
    },
  },
  {
    name: "read_mockup",
    description:
      "Look at the project's APPROVED design mockup image with a vision model and return a pixel-level description (exact colors, fonts, per-screen layout, components, spacing, charts, data). Call this FIRST in an Expo build — the mockup is the source of truth above the text brief. Also saves the analysis to designs/mockup.md in the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = str(args, "project_id");
      if (!projectId) throw new Error("`project_id` is required.");
      const client = (ctx.supabase ?? supabaseAdmin) as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data: project, error } = (await client
        .from("projects")
        .select("id, user_id, attachments")
        .eq("id", projectId)
        .maybeSingle()) as {
        data: { id: string; user_id: string; attachments: unknown } | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(error.message);
      if (!project) throw new Error("Project not found.");
      if (project.user_id && project.user_id !== ctx.userId) throw new Error("Not authorized for this project.");

      const attachments =
        project.attachments && typeof project.attachments === "object" && !Array.isArray(project.attachments)
          ? (project.attachments as Record<string, unknown>)
          : {};
      const rawUrl = attachments.design_mockup_url as string | undefined;
      if (!rawUrl) {
        throw new Error("No approved mockup found for this project. Generate and approve a design first.");
      }

      const { ensureHttpsImageUrl } = await import("./build-from-mockup.server");
      const httpsUrl = await ensureHttpsImageUrl(rawUrl, projectId);
      if (!httpsUrl) throw new Error("Could not resolve the mockup to an https URL for the vision model.");

      const visionSystem =
        "You are a senior mobile engineer reverse-engineering an APPROVED app mockup so it can be rebuilt PIXEL-FAITHFULLY in Expo / React Native. Describe exactly what you see — do not invent or improve.";
      const visionUser =
        "Analyze the attached mockup. For EACH distinct phone screen, report: screen name/purpose; exact background + surface colors as hex; primary/accent colors as hex; font family feel, weights and approximate sizes; the full layout top-to-bottom; every component (cards, stats, charts, lists, tab bar, buttons, inputs) with its position, copy, and any numbers/data shown; spacing/rounding/shadow feel; icons used; and any imagery. Be concrete and exhaustive — this is the source of truth for the build.";

      const { callAIVision } = await import("./ai-provider");
      const r = await callAIVision(visionSystem, visionUser, [httpsUrl]);
      if (!r.ok) throw new Error(`Vision read failed: ${r.error}`);
      const analysis = r.text;

      // Persist to the workspace as durable artifacts the agent can re-read:
      // the vision analysis (designs/mockup.md) AND the literal image (designs/mockup.png).
      const wctx: WorkspaceCtx = { userId: ctx.userId, supabase: ctx.supabase };
      let savedTo: string | undefined;
      try {
        await wsWriteFile(
          projectId,
          wctx,
          "designs/mockup.md",
          `# Approved mockup — vision analysis\n\nSource: ${httpsUrl}\n\n${analysis}\n`,
        );
        savedTo = "designs/mockup.md";
      } catch {
        /* non-fatal: the analysis is still returned for the agent to use */
      }
      let imageSavedTo: string | undefined;
      try {
        const r2 = await embedMockupPng(projectId, wctx);
        if (r2.embedded) imageSavedTo = r2.path;
      } catch {
        /* non-fatal */
      }

      return { mockup_url: httpsUrl, analysis, saved_to: savedTo, image_saved_to: imageSavedTo };
    },
  },
  {
    name: "ws_diagnose",
    description:
      "Runtime self-check for the agent workspace: spins up a throwaway sandbox and verifies create / file write+read / command run / bun present / getHost all work ON THIS SERVER. Use right after deploy to confirm E2B works on the host (e.g. Cloudflare Workers) and the bun/expo template is wired. Returns a per-step report.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      return probeWorkspaceRuntime();
    },
  },
];

// ─── Native capabilities helpers ────────────────────────────────────

/**
 * Upsert a native capability row onto a project. Read-modify-write so
 * adding `push_notifications` twice replaces the prior row rather than
 * stacking two identical plugin blocks (which `expo prebuild` rejects).
 */
async function upsertNativeCapability(
  userId: string,
  projectId: string,
  id: NativeCapabilityId,
  config: Record<string, string>,
): Promise<{ rows: NativeCapabilityRow[]; spec: typeof NATIVE_CAPABILITIES[NativeCapabilityId] }> {
  await assertOwnsProject(userId, projectId);
  const spec = NATIVE_CAPABILITIES[id];
  if (!spec) throw new Error(`Unknown native capability: ${id}`);
  const required = spec.configSchema.required ?? [];
  for (const r of required) {
    if (!config[r] || !config[r].trim()) {
      throw new Error(`Missing required config field for ${id}: \`${r}\``);
    }
  }

  // native_capabilities is a brand-new column that the generated
  // Database types don't know about yet — loose cast bypasses the
  // strict column-name check on read + write.
  const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: row, error: readErr } = (await adm
    .from("projects")
    .select("native_capabilities")
    .eq("id", projectId)
    .single()) as {
    data: { native_capabilities: NativeCapabilityRow[] | null } | null;
    error: { message: string } | null;
  };
  if (readErr) throw new Error(readErr.message);
  const current = (row?.native_capabilities ?? []) as NativeCapabilityRow[];

  const next: NativeCapabilityRow[] = [
    ...current.filter((r) => r.id !== id),
    {
      id,
      config,
      added_at: new Date().toISOString(),
      added_by: "agent",
    },
  ];

  const { error: writeErr } = (await adm
    .from("projects")
    .update({ native_capabilities: next })
    .eq("id", projectId)
    .eq("user_id", userId)) as { error: { message: string } | null };
  if (writeErr) throw new Error(writeErr.message);

  return { rows: next, spec };
}

/** Build the per-capability MCP tools from the catalog. */
function buildNativeCapabilityTools(): McpTool[] {
  // Public tool names are user-friendly aliases (`add_camera_capture`)
  // even though the underlying catalog id is `camera`. Keeps the manifest
  // legible without dragging the same renaming into the data layer.
  const NAME_MAP: Record<NativeCapabilityId, string> = {
    push_notifications: "add_push_notifications",
    stripe_payments: "add_stripe_iap",
    camera: "add_camera_capture",
    biometrics: "add_biometrics",
    app_tracking_transparency: "add_att_prompt",
  };

  const perCapTools: McpTool[] = (Object.keys(NAME_MAP) as NativeCapabilityId[]).map((id) => {
    const spec = NATIVE_CAPABILITIES[id];
    const toolName = NAME_MAP[id];
    return {
      name: toolName,
      description:
        `${spec.label}: ${spec.summary} ` +
        `On success, the Expo exporter will wire the right deps, app.json plugins, iOS Info.plist strings, and Android permissions. ` +
        (spec.notes.length ? `Caveats: ${spec.notes.join(" ")}` : ""),
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID of the target project." },
          ...spec.configSchema.properties,
        },
        required: ["project_id", ...(spec.configSchema.required ?? [])],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const projectId = uuid(args, "project_id");
        const config: Record<string, string> = {};
        for (const key of Object.keys(spec.configSchema.properties)) {
          const v = args[key];
          if (typeof v === "string") config[key] = v;
        }
        const { spec: usedSpec } = await upsertNativeCapability(ctx.userId, projectId, id, config);
        return {
          ok: true,
          capability: id,
          label: usedSpec.label,
          // Echo back what the exporter will emit so the agent can show
          // the user a confirmation without an extra get_project round-trip.
          will_install: Object.keys(usedSpec.dependencies),
          notes: usedSpec.notes,
        };
      },
    };
  });

  perCapTools.push({
    name: "list_native_capabilities",
    description: "List the native capabilities currently wired onto a project.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      await assertOwnsProject(ctx.userId, projectId);
      const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error } = (await adm
        .from("projects")
        .select("native_capabilities")
        .eq("id", projectId)
        .single()) as {
        data: { native_capabilities: NativeCapabilityRow[] | null } | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(error.message);
      const rows = (data?.native_capabilities ?? []) as NativeCapabilityRow[];
      return {
        capabilities: rows.map((r) => ({
          id: r.id,
          label: NATIVE_CAPABILITIES[r.id]?.label ?? r.id,
          added_at: r.added_at,
          added_by: r.added_by,
          // Don't echo full config — Stripe keys + APNs team ids are
          // sensitive-ish. The agent can ask the user if it needs them.
          configured_fields: Object.keys(r.config),
        })),
      };
    },
  });

  perCapTools.push({
    name: "remove_native_capability",
    description: "Remove a native capability from a project. The exporter will stop emitting its deps and config.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        capability: {
          type: "string",
          description: "Catalog id (e.g. push_notifications, stripe_payments, camera, biometrics).",
        },
      },
      required: ["project_id", "capability"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const projectId = uuid(args, "project_id");
      const cap = str(args, "capability");
      if (!(cap in NATIVE_CAPABILITIES)) {
        throw new Error(`Unknown capability id: ${cap}`);
      }
      await assertOwnsProject(ctx.userId, projectId);
      const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error: readErr } = (await adm
        .from("projects")
        .select("native_capabilities")
        .eq("id", projectId)
        .single()) as {
        data: { native_capabilities: NativeCapabilityRow[] | null } | null;
        error: { message: string } | null;
      };
      if (readErr) throw new Error(readErr.message);
      const current = (data?.native_capabilities ?? []) as NativeCapabilityRow[];
      const next = current.filter((r) => r.id !== cap);
      const { error: writeErr } = (await adm
        .from("projects")
        .update({ native_capabilities: next })
        .eq("id", projectId)
        .eq("user_id", ctx.userId)) as { error: { message: string } | null };
      if (writeErr) throw new Error(writeErr.message);
      return { ok: true, removed: cap, remaining: next.map((r) => r.id) };
    },
  });

  return perCapTools;
}

// Keep `bool` referenced so eslint's no-unused-imports rule doesn't trip
// when only `str` / `num` / `uuid` end up in the running tools.
void bool;

/** O(1) dispatch by name. */
const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t] as const));

export function getMcpTool(name: string): McpTool | undefined {
  return TOOLS_BY_NAME.get(name);
}
