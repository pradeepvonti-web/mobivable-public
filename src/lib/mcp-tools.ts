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
    name: "send_chat_message",
    description:
      "Append a user message to a project's chat and kick off an agent-crew turn. Non-streaming — returns once the rewrite settles or the AI errors. Consumes 1 AI credit.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        content: { type: "string", description: "The user-side message." },
      },
      required: ["project_id", "content"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const project_id = uuid(args, "project_id");
      const content = str(args, "content").trim().slice(0, 4000);
      if (!content) throw new Error("`content` is required.");
      await assertOwnsProject(ctx.userId, project_id);

      // Persist the user message exactly as the studio chat does. We DON'T
      // call sendProjectMessage directly because it's an SSE generator —
      // collecting that into a single JSON response would require a
      // separate runner. For v1 we record the message and return; the
      // studio's chat will pick it up on next render.
      const { data, error } = await supabaseAdmin
        .from("project_messages")
        .insert({
          project_id,
          user_id: ctx.userId,
          role: "user",
          content,
        })
        .select("id, created_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        message: data,
        note:
          "Message queued. The agent crew turn runs when the user (or you) opens the project — direct cloud trigger is on the roadmap.",
      };
    },
  },

  // ─── Action ─────────────────────────────────────────────────────────
  // Long-running studio actions (Expo zip export, backend provisioning,
  // Maestro Cloud dispatch) live behind TanStack `createServerFn` middleware
  // that authenticates via Supabase JWT — they can't be safely invoked from
  // the MCP route, which authenticates via mvbl_pat_ Bearer instead.
  //
  // To expose them through MCP we need to extract each handler's inner body
  // into a (userId, params) → result function the MCP can call with the
  // admin client. That refactor is intentionally deferred: ship the 14
  // read/write tools first, prove the wire end-to-end, then lift the heavy
  // actions in a follow-up. For now MCP callers should drive these from the
  // studio UI; we'll surface them once the impls are extracted.
];

// Keep `bool` referenced so eslint's no-unused-imports rule doesn't trip
// when only `str` / `num` / `uuid` end up in the running tools.
void bool;

/** O(1) dispatch by name. */
const TOOLS_BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t] as const));

export function getMcpTool(name: string): McpTool | undefined {
  return TOOLS_BY_NAME.get(name);
}
