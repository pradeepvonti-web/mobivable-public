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

export interface McpToolContext {
  userId: string;
  /** sha256-hex of the bearer used; logged for forensics, never returned. */
  patHash: string;
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

/** Confirm the project belongs to the caller. Throws on mismatch. */
async function assertOwnsProject(userId: string, projectId: string): Promise<void> {
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
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Load and parse the project's MobileAppSchema JSON from the DB. */
async function loadSchema(projectId: string): Promise<any> {
  const { data, error } = await supabaseAdmin
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
async function saveSchema(projectId: string, userId: string, schema: any): Promise<void> {
  const { error } = await supabaseAdmin
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
  {
    name: "generate_app",
    description:
      "Generate a complete mobile app schema from a prompt. Creates screens, navigation, theme — saves directly to the project. Use this when the project has no schema or the user wants to regenerate from scratch.",
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

      // ── PASS 1: Generate a design brief (fast model) ──
      // This ensures every app gets a domain-specific palette, typography,
      // layout plan, and screen structure — not just "blue + Inter + rounded".
      const briefResult = await callAIFast(DESIGN_BRIEF_SYSTEM_PROMPT, prompt);
      let designBrief = "";
      if (briefResult.ok && briefResult.text.includes("{")) {
        designBrief = briefResult.text;
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

      // Save to project
      const { error: saveErr } = await supabaseAdmin
        .from("projects")
        .update({
          result: JSON.stringify(schema),
          updated_at: new Date().toISOString(),
        })
        .eq("id", project_id)
        .eq("user_id", ctx.userId);
      if (saveErr) throw new Error(saveErr.message);

      return {
        ok: true,
        screen_count: schema.screens?.length ?? 0,
        nav_type: schema.navigation?.type ?? "none",
        theme_mode: (typeof schema.theme === "object" && schema.theme !== null ? (schema.theme as Record<string, unknown>).mode : undefined) ?? "dark",
        model: result.model,
        used_design_brief: !!designBrief,
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
      const schema = await loadSchema(projectId);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      if (args.title !== undefined) screen.title = str(args, "title");
      if (args.layout !== undefined) screen.layout = str(args, "layout");
      if (args.icon !== undefined) screen.icon = str(args, "icon");
      if (args.transition !== undefined) screen.transition = str(args, "transition");
      const bg = obj(args, "background");
      if (bg !== undefined) screen.background = bg;
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
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
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
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
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
      const screen = schema.screens?.find((s: { id?: string }) => s.id === str(args, "screen_id"));
      if (!screen) throw new Error(`Screen "${str(args, "screen_id")}" not found.`);
      const idx = num(args, "element_index", -1);
      if (idx < 0 || idx >= (screen.elements?.length ?? 0)) {
        throw new Error(`Element index ${idx} out of range.`);
      }
      const removed = screen.elements.splice(idx, 1)[0];
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
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
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
      if (!schema.navigation) schema.navigation = { type: "bottom-tabs", items: [] };
      const updated: string[] = [];
      if (args.type !== undefined) { schema.navigation.type = str(args, "type"); updated.push("type"); }
      const items = arr(args, "items");
      if (items) { schema.navigation.items = items; updated.push("items"); }
      const ns = obj(args, "navStyle");
      if (ns) { schema.navigation.navStyle = ns; updated.push("navStyle"); }
      if (args.showLabels !== undefined) { schema.navigation.showLabels = bool(args, "showLabels"); updated.push("showLabels"); }
      await saveSchema(projectId, ctx.userId, schema);
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
      const schema = await loadSchema(projectId);
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
      const schema = await loadSchema(projectId);
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
      const schema = await loadSchema(projectId);

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
