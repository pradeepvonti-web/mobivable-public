/**
 * Server-side glue for the in-studio MCP agent.
 *
 * Three server fns:
 *   - listAgentThreads     — sidebar list
 *   - createAgentThread    — new thread (returns id)
 *   - getAgentThread       — load thread + messages for hydration
 *   - archiveAgentThread   — soft-delete from sidebar
 *
 * Plus the streaming-generator centerpiece:
 *   - sendAgentTurn — appends a user message, runs the tool-use loop,
 *     streams `delta` + `tool_*` events, persists every turn.
 *
 * The tool loop:
 *   1. Build provider-neutral message list from DB history + new user msg.
 *   2. Call `callAIToolsStreaming()` with MCP_TOOLS as the tool manifest.
 *   3. Parse the SSE per-provider:
 *        - Anthropic: content_block_{start,delta,stop} events carry text
 *          deltas and tool_use blocks side-by-side.
 *        - OpenAI-compat: choices[0].delta.{content,tool_calls} deltas.
 *      Text deltas yield immediately. Tool_use blocks buffer.
 *   4. When the stream ends:
 *        - If tools were called: run each via `getMcpTool().run(args, ctx)`,
 *          persist assistant + tool rows, append to message list, loop.
 *        - Else: persist the final assistant text and we're done.
 *   5. Hard cap at MAX_TOOL_ITERATIONS so a misbehaving model can't burn
 *      unbounded credits in one turn.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAIToolsStreaming } from "./ai-provider";
import { getMcpTool } from "./mcp-tools";
import {
  MAX_TOOL_ITERATIONS,
  MCP_AGENT_SYSTEM_PROMPT,
  clipToolResult,
  mcpToolsAsAnthropic,
  mcpToolsAsOpenAI,
  toAnthropicMessages,
  toOpenAIMessages,
  type AgentMsg,
} from "./mcp-agent";

// ─── Thread CRUD ────────────────────────────────────────────────

export const listAgentThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_threads")
      .select("id, title, model, created_at, updated_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100)) as {
      data:
        | {
            id: string;
            title: string;
            model: string | null;
            created_at: string;
            updated_at: string;
          }[]
        | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, threads: data ?? [] };
  });

export const createAgentThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        title: z.string().min(1).max(120).optional(),
        model: z.string().max(120).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row, error } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_threads")
      .insert({
        user_id: userId,
        title: data.title ?? "New thread",
        model: data.model ?? null,
      })
      .select("id, title, model, created_at, updated_at")
      .single()) as {
      data: {
        id: string;
        title: string;
        model: string | null;
        created_at: string;
        updated_at: string;
      } | null;
      error: { message: string } | null;
    };
    if (error || !row) {
      return { ok: false as const, error: error?.message ?? "Could not create thread." };
    }
    return { ok: true as const, thread: row };
  });

export const getAgentThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: thread, error: tErr } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_threads")
      .select("id, title, model, created_at, updated_at")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .maybeSingle()) as {
      data:
        | {
            id: string;
            title: string;
            model: string | null;
            created_at: string;
            updated_at: string;
          }
        | null;
      error: { message: string } | null;
    };
    if (tErr) return { ok: false as const, error: tErr.message };
    if (!thread) return { ok: false as const, error: "Thread not found." };

    const { data: msgs, error: mErr } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_messages")
      .select("id, role, content, tool_calls, tool_call_id, is_error, is_plan, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })) as {
      data:
        | {
            id: string;
            role: "user" | "assistant" | "tool";
            content: string;
            // Raw JSON from the DB. We stringify before crossing the wire
            // so TanStack's serializable-return validator accepts the
            // response (it rejects `Record<string, unknown>` / `unknown`).
            tool_calls: unknown;
            tool_call_id: string | null;
            is_error: boolean;
            is_plan: boolean;
            created_at: string;
          }[]
        | null;
      error: { message: string } | null;
    };
    if (mErr) return { ok: false as const, error: mErr.message };
    const serializableMsgs = (msgs ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      // JSON-encode the tool_calls payload so the return type stays
      // strictly serializable per TanStack's checker.
      tool_calls_json: m.tool_calls == null ? null : JSON.stringify(m.tool_calls),
      tool_call_id: m.tool_call_id,
      is_error: m.is_error,
      is_plan: m.is_plan,
      created_at: m.created_at,
    }));
    return { ok: true as const, thread, messages: serializableMsgs };
  });

export const archiveAgentThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_threads")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.threadId)
      .eq("user_id", userId)) as { error: { message: string } | null };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ─── Streaming agent turn ──────────────────────────────────────

/**
 * Events yielded to the client. Shape is stable so the UI can switch on
 * `type` and render incrementally without parsing free-form text.
 */
export type AgentEvent =
  | { type: "thread"; threadId: string }
  | { type: "delta"; text: string }
  // arguments are JSON-encoded at the wire so the union stays strictly
  // serializable per TanStack's checker (it rejects open Record types).
  | { type: "tool_start"; id: string; name: string; argumentsJson: string }
  | { type: "tool_result"; id: string; content: string; isError: boolean }
  | { type: "model"; provider: string; model: string }
  | { type: "iteration"; n: number }
  | { type: "error"; error: string }
  | { type: "done" };

// Anthropic SSE parser state.
interface AnthropicParseState {
  buf: string;
  /** Per content-block buffers, keyed by index. */
  blocks: Record<
    number,
    | { kind: "text"; text: string }
    | { kind: "tool"; id: string; name: string; inputJson: string }
  >;
}

function parseAnthropicSSE(
  chunk: string,
  state: AnthropicParseState,
): {
  textDeltas: string[];
  finishedTools: { id: string; name: string; input: Record<string, unknown> }[];
} {
  state.buf += chunk;
  const lines = state.buf.split("\n");
  state.buf = lines.pop() ?? "";

  const textDeltas: string[] = [];
  const finishedTools: { id: string; name: string; input: Record<string, unknown> }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data) continue;
    let evt: {
      type?: string;
      index?: number;
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; partial_json?: string };
    };
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }

    if (evt.type === "content_block_start" && typeof evt.index === "number") {
      const cb = evt.content_block ?? {};
      if (cb.type === "text") {
        state.blocks[evt.index] = { kind: "text", text: "" };
      } else if (cb.type === "tool_use" && cb.id && cb.name) {
        state.blocks[evt.index] = {
          kind: "tool",
          id: cb.id,
          name: cb.name,
          inputJson: "",
        };
      }
    } else if (evt.type === "content_block_delta" && typeof evt.index === "number") {
      const block = state.blocks[evt.index];
      if (!block) continue;
      if (evt.delta?.type === "text_delta" && typeof evt.delta.text === "string") {
        if (block.kind === "text") block.text += evt.delta.text;
        textDeltas.push(evt.delta.text);
      } else if (
        evt.delta?.type === "input_json_delta" &&
        typeof evt.delta.partial_json === "string" &&
        block.kind === "tool"
      ) {
        block.inputJson += evt.delta.partial_json;
      }
    } else if (evt.type === "content_block_stop" && typeof evt.index === "number") {
      const block = state.blocks[evt.index];
      if (block && block.kind === "tool") {
        let input: Record<string, unknown> = {};
        try {
          input = block.inputJson ? (JSON.parse(block.inputJson) as Record<string, unknown>) : {};
        } catch {
          // Malformed JSON — surface empty input; tool will reject.
        }
        finishedTools.push({ id: block.id, name: block.name, input });
      }
    }
    // message_delta / message_stop don't carry data we need.
  }

  return { textDeltas, finishedTools };
}

// OpenAI SSE parser state.
interface OpenAIParseState {
  buf: string;
  /** Per tool-call index, the accumulated id/name/arguments JSON string. */
  tools: Record<number, { id: string; name: string; argJson: string }>;
}

function parseOpenAISSE(
  chunk: string,
  state: OpenAIParseState,
): {
  textDeltas: string[];
  /** Only emitted on the final `[DONE]` so the caller knows the turn is over. */
  finished: boolean;
} {
  state.buf += chunk;
  const lines = state.buf.split("\n");
  state.buf = lines.pop() ?? "";

  const textDeltas: string[] = [];
  let finished = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data) continue;
    if (data === "[DONE]") {
      finished = true;
      continue;
    }
    let evt: {
      choices?: {
        delta?: {
          content?: string;
          tool_calls?: {
            index?: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    const delta = evt.choices?.[0]?.delta;
    if (!delta) continue;
    if (typeof delta.content === "string" && delta.content) {
      textDeltas.push(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      const existing = state.tools[idx] ?? { id: "", name: "", argJson: "" };
      if (tc.id) existing.id = tc.id;
      if (tc.function?.name) existing.name = tc.function.name;
      if (tc.function?.arguments) existing.argJson += tc.function.arguments;
      state.tools[idx] = existing;
    }
  }
  return { textDeltas, finished };
}

/**
 * Server fn that streams a single agent turn. The client iterates the
 * async generator and renders each event as it arrives.
 *
 * NB: TanStack server-fn generators are wired to SSE on the wire. The
 * client side uses `sendAgentTurn.stream(...)` / standard async-for-of.
 */
export const sendAgentTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        threadId: z.string().uuid(),
        content: z.string().min(1).max(8_000),
        // The /agent UI captures the active project's Flutter preview
        // before each send so the model can see the app. Base64 PNG;
        // capped at ~2 MB so a single user turn can't blow request size.
        activeProjectId: z.string().uuid().optional(),
        screenshotDataUrl: z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,/)
          .max(2_500_000)
          .optional(),
        screenshotAltText: z.string().max(200).optional(),
        // Plan Mode: the agent returns ONE turn with a numbered plan and
        // does not call tools. The UI renders the plan with a "Run plan"
        // CTA. Lovable shipped this Feb 2026 — table-stakes for users
        // arriving from competitors.
        planOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  // No explicit return annotation: TanStack's `createServerFn` infers the
  // generator yield union from each `yield` site and validates it against
  // its own `ValidateSerializableMapped` constraint. An explicit
  // `AsyncGenerator<AgentEvent>` here fights that validation.
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context;

    // ── 0. authorize thread + load history ──
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: thread } = (await adm
      .from("mcp_agent_threads")
      .select("id, model, title")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .maybeSingle()) as {
      data: { id: string; model: string | null; title: string } | null;
    };
    if (!thread) {
      yield { type: "error", error: "Thread not found." };
      return;
    }
    yield { type: "thread", threadId: thread.id };

    const { data: priorRows } = (await adm
      .from("mcp_agent_messages")
      .select("role, content, tool_calls, tool_call_id, is_error")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })) as {
      data:
        | {
            role: "user" | "assistant" | "tool";
            content: string;
            tool_calls:
              | { id: string; name: string; arguments: Record<string, unknown> }[]
              | null;
            tool_call_id: string | null;
            is_error: boolean;
          }[]
        | null;
    };

    // ── 1. credit gate ──
    const { data: credit, error: credErr } = await supabase.rpc("consume_ai_credits", {
      p_user: userId,
      p_amount: 1,
      p_reason: "mcp_agent_turn",
      // No project context for cross-project agent turns. The RPC accepts
      // `undefined` here (null is rejected by the generated types).
      p_project: undefined,
    });
    if (credErr) {
      yield { type: "error", error: credErr.message };
      return;
    }
    const c = credit as { ok: boolean } | null;
    if (c && !c.ok) {
      yield {
        type: "error",
        error: "OUT_OF_CREDITS: You're out of AI credits. Upgrade your plan to keep going.",
      };
      return;
    }

    // ── 2. persist user message ──
    await adm.from("mcp_agent_messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "user",
      content: data.content,
    });

    // First-message thread autotitle: take the first ~60 chars.
    const isFirstUser = !(priorRows ?? []).some((r) => r.role === "user");
    if (isFirstUser) {
      const autoTitle = data.content.replace(/\s+/g, " ").trim().slice(0, 60);
      if (autoTitle) {
        await adm
          .from("mcp_agent_threads")
          .update({ title: autoTitle })
          .eq("id", thread.id)
          .eq("user_id", userId);
      }
    }

    // ── 2.5. ADK Agent Routing ──
    // When the ADK_AGENT_URL env var is set, delegate the agent turn to
    // the Google Agent Development Kit (ADK) microservice instead of
    // running the custom tool-use loop below. The ADK service uses
    // Gemini on Vertex AI with native ADK orchestration (Runner,
    // SessionService, tool-use loop). This satisfies the challenge
    // requirement of using the Agent Development Kit for orchestration.
    //
    // When ADK_AGENT_URL is not set (local dev), falls through to the
    // existing custom TypeScript tool-use loop below.
    const adkUrl = process.env.ADK_AGENT_URL;
    if (adkUrl) {
      try {
        // Cloud Run service-to-service auth: fetch an ID token from the
        // metadata server so we can call the ADK service which has
        // --no-allow-unauthenticated. In local dev this silently skips.
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        try {
          const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${adkUrl}`;
          const tokenRes = await fetch(metadataUrl, {
            headers: { "Metadata-Flavor": "Google" },
          });
          if (tokenRes.ok) {
            headers["Authorization"] = `Bearer ${await tokenRes.text()}`;
          }
        } catch {
          // Not on Cloud Run (local dev) — skip auth
        }

        const adkRes = await fetch(`${adkUrl}/run/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: data.content,
            session_id: thread.id,
            user_id: userId,
          }),
        });

        if (!adkRes.ok) {
          const errText = await adkRes.text().catch(() => "");
          console.error(`[adk-routing] ADK service error (${adkRes.status}): ${errText.slice(0, 200)}`);
          // Fall through to custom loop on ADK failure
        } else {
          yield { type: "model", provider: "Google ADK (Vertex AI)", model: "gemini-2.5-flash" };

          const body = adkRes.body;
          if (!body) {
            yield { type: "error", error: "Empty ADK stream." };
            return;
          }
          const reader = body.pipeThrough(new TextDecoderStream()).getReader();
          let adkText = "";
          let adkBuf = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            adkBuf += value;
            const lines = adkBuf.split("\n");
            adkBuf = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const evt = JSON.parse(jsonStr) as {
                  type: string;
                  text?: string;
                  name?: string;
                  args?: Record<string, unknown>;
                  result?: string;
                  error?: string;
                  session_id?: string;
                };
                if (evt.type === "delta" && evt.text) {
                  adkText += evt.text;
                  yield { type: "delta", text: evt.text };
                } else if (evt.type === "tool_start" && evt.name) {
                  yield {
                    type: "tool_start" as const,
                    id: `adk-${Date.now()}`,
                    name: evt.name,
                    argumentsJson: JSON.stringify(evt.args ?? {}),
                  };
                } else if (evt.type === "tool_result" && evt.name) {
                  yield {
                    type: "tool_result",
                    id: `adk-${Date.now()}`,
                    content: evt.result ?? "",
                    isError: false,
                  };
                } else if (evt.type === "error") {
                  yield { type: "error", error: evt.error ?? "ADK error" };
                  return;
                } else if (evt.type === "done") {
                  // Persist the ADK assistant response
                  if (adkText) {
                    await adm.from("mcp_agent_messages").insert({
                      thread_id: thread.id,
                      user_id: userId,
                      role: "assistant",
                      content: adkText,
                    });
                  }
                  yield { type: "done" };
                  return;
                }
              } catch {
                // Skip unparseable SSE lines
              }
            }
          }

          // Stream ended without a "done" event — persist what we have
          if (adkText) {
            await adm.from("mcp_agent_messages").insert({
              thread_id: thread.id,
              user_id: userId,
              role: "assistant",
              content: adkText,
            });
          }
          yield { type: "done" };
          return;
        }
      } catch (e) {
        console.error(`[adk-routing] ADK service unreachable, falling back to custom loop:`, e instanceof Error ? e.message : e);
        // Fall through to the custom tool-use loop below
      }
    }

    // ── 3. build provider-neutral message list ──
    // (Only reached when ADK_AGENT_URL is not set or ADK is unreachable)
    const msgs: AgentMsg[] = [
      { role: "system", content: MCP_AGENT_SYSTEM_PROMPT },
    ];

    // Plan-only system override: tell the model exactly what shape we
    // want and that tools are off-limits for this turn. We still send
    // the tool manifest so the model can REFERENCE specific tools in
    // the plan — it just must not call them.
    if (data.planOnly) {
      msgs.push({
        role: "system",
        content:
          `PLAN MODE. Do NOT call any tools on this turn. Instead, return ` +
          `a numbered markdown plan that the user can review. For each ` +
          `step, state:\n` +
          `  1. The user-visible goal of the step (one sentence).\n` +
          `  2. Which MCP tool you intend to call (by exact name) and ` +
          `the key arguments — or "(no tool, just summarize)" if you ` +
          `won't need one.\n` +
          `  3. A brief reason this step is needed.\n\n` +
          `Keep the plan tight (3–7 steps). Don't pad. End with a ` +
          `one-line "On approval I'll execute the steps above." Do not ` +
          `write the actual answer yet — the user must click "Run plan" ` +
          `first.`,
      });
    }

    // When the UI sent an `activeProjectId`, give the model a one-shot
    // hint up-front. The model can still call `get_project` to pull the
    // full schema; this just removes the guess-which-project step.
    if (data.activeProjectId) {
      msgs.push({
        role: "system",
        content:
          `The user has project ${data.activeProjectId} open in their preview pane. ` +
          `When they say "this app", "this screen", or use other ambient references ` +
          `without naming a project, default to this one. Call get_project / ` +
          `get_screen on this id to read its current state. If they're attaching a ` +
          `screenshot, it's a render of this project.`,
      });
    }

    for (const r of priorRows ?? []) {
      if (r.role === "user") msgs.push({ role: "user", content: r.content });
      else if (r.role === "assistant") {
        msgs.push({
          role: "assistant",
          content: r.content,
          tool_calls: r.tool_calls ?? undefined,
        });
      } else if (r.role === "tool" && r.tool_call_id) {
        msgs.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          name: "",
          content: r.content,
          is_error: r.is_error,
        });
      }
    }

    // New user turn — attach the screenshot if one was sent. The image
    // travels with the message through every tool-loop iteration because
    // the model needs it on the very next AI call to plan tool use.
    const newUserMsg: AgentMsg = data.screenshotDataUrl
      ? {
          role: "user",
          content: data.content,
          image: {
            dataUrl: data.screenshotDataUrl,
            altText: data.screenshotAltText ?? "current preview",
          },
        }
      : { role: "user", content: data.content };
    msgs.push(newUserMsg);

    const tools = {
      anthropic: mcpToolsAsAnthropic(),
      openai: mcpToolsAsOpenAI(),
    };

    // ── 4. tool-use loop ──
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      yield { type: "iteration", n: iter + 1 };

      const anth = toAnthropicMessages(msgs);
      const oai = toOpenAIMessages(msgs);
      const streamRes = await callAIToolsStreaming({
        system: anth.system,
        messages: { anthropic: anth.messages, openai: oai },
        tools,
        modelHint: thread.model ?? undefined,
      });
      if (!streamRes.ok) {
        yield { type: "error", error: streamRes.error };
        return;
      }
      if (iter === 0) {
        yield { type: "model", provider: streamRes.provider, model: streamRes.model };
      }

      const body = streamRes.response.body;
      if (!body) {
        yield { type: "error", error: "Empty stream." };
        return;
      }
      const reader = body.pipeThrough(new TextDecoderStream()).getReader();

      let assistantText = "";
      const completedTools: {
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[] = [];

      if (streamRes.provider === "anthropic") {
        const state: AnthropicParseState = { buf: "", blocks: {} };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseAnthropicSSE(value, state);
          for (const t of parsed.textDeltas) {
            assistantText += t;
            yield { type: "delta", text: t };
          }
          for (const tc of parsed.finishedTools) {
            completedTools.push(tc);
          }
        }
      } else {
        const state: OpenAIParseState = { buf: "", tools: {} };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseOpenAISSE(value, state);
          for (const t of parsed.textDeltas) {
            assistantText += t;
            yield { type: "delta", text: t };
          }
        }
        // OpenAI: tool calls only complete after the stream ends.
        for (const idx of Object.keys(state.tools)) {
          const tc = state.tools[Number(idx)];
          if (!tc.id || !tc.name) continue;
          let input: Record<string, unknown> = {};
          try {
            input = tc.argJson ? (JSON.parse(tc.argJson) as Record<string, unknown>) : {};
          } catch {
            // Leave empty — tool will reject and the model will see the error.
          }
          completedTools.push({ id: tc.id, name: tc.name, input });
        }
      }

      // ── persist assistant turn ──
      // In plan-only mode we throw away any tool calls the model emitted
      // despite the instructions — the whole point is the user reviews
      // before anything runs. The text alone is persisted as is_plan=true.
      const planTurn = data.planOnly === true;
      const toolCallsForRow =
        !planTurn && completedTools.length > 0
          ? completedTools.map((t) => ({
              id: t.id,
              name: t.name,
              arguments: t.input,
            }))
          : null;
      await adm.from("mcp_agent_messages").insert({
        thread_id: thread.id,
        user_id: userId,
        role: "assistant",
        content: assistantText,
        tool_calls: toolCallsForRow,
        is_plan: planTurn,
      });
      msgs.push({
        role: "assistant",
        content: assistantText,
        tool_calls: toolCallsForRow ?? undefined,
      });

      // Plan mode: one turn, no tools, done.
      if (planTurn) {
        yield { type: "done" };
        return;
      }

      // No tools called → we have the final answer.
      if (completedTools.length === 0) {
        yield { type: "done" };
        return;
      }

      // ── run each tool, persist + append result ──
      // Track which project was modified so we can auto-verify.
      const WRITE_TOOLS = new Set([
        "update_screen", "add_element", "update_element", "remove_element",
        "update_theme", "update_navigation", "create_project", "send_chat_message",
      ]);
      let modifiedProjectId: string | null = null;

      for (const tc of completedTools) {
        yield {
          type: "tool_start" as const,
          id: tc.id,
          name: tc.name,
          argumentsJson: JSON.stringify(tc.input),
        };
        const tool = getMcpTool(tc.name);
        let resultContent: string;
        let isError = false;
        if (!tool) {
          resultContent = `Unknown tool: ${tc.name}`;
          isError = true;
        } else {
          try {
            const result = await tool.run(tc.input, { userId, patHash: "in-studio", supabase });
            resultContent = clipToolResult(JSON.stringify(result, null, 2)).text;
          } catch (e) {
            resultContent = e instanceof Error ? e.message : String(e);
            isError = true;
          }
        }
        // Track if a write tool touched a project
        if (WRITE_TOOLS.has(tc.name) && !isError) {
          const pid = tc.input.project_id as string | undefined;
          if (pid) modifiedProjectId = pid;
        }
        await adm.from("mcp_agent_messages").insert({
          thread_id: thread.id,
          user_id: userId,
          role: "tool",
          content: resultContent,
          tool_call_id: tc.id,
          is_error: isError,
        });
        msgs.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: resultContent,
          is_error: isError,
        });
        yield {
          type: "tool_result",
          id: tc.id,
          content: resultContent,
          isError,
        };
      }

      // ── Phase 2: Auto-verify after write tools ──
      // If any surgical tool modified a project, auto-run verify_schema
      // and inject the result so the agent can self-correct on next iteration.
      if (modifiedProjectId && !completedTools.some(tc => tc.name === "verify_schema")) {
        const verifyTool = getMcpTool("verify_schema");
        if (verifyTool) {
          const verifyId = `auto-verify-${Date.now()}`;
          yield {
            type: "tool_start" as const,
            id: verifyId,
            name: "verify_schema",
            argumentsJson: JSON.stringify({ project_id: modifiedProjectId }),
          };
          let verifyContent: string;
          let verifyError = false;
          try {
            const result = await verifyTool.run(
              { project_id: modifiedProjectId },
              { userId, patHash: "in-studio", supabase },
            );
            verifyContent = clipToolResult(JSON.stringify(result, null, 2)).text;
          } catch (e) {
            verifyContent = e instanceof Error ? e.message : String(e);
            verifyError = true;
          }
          // Persist the auto-verify result
          await adm.from("mcp_agent_messages").insert({
            thread_id: thread.id,
            user_id: userId,
            role: "tool",
            content: verifyContent,
            tool_call_id: verifyId,
            is_error: verifyError,
          });
          // Inject as an assistant-triggered tool result so the model sees it
          msgs.push({
            role: "assistant",
            content: "",
            tool_calls: [{ id: verifyId, name: "verify_schema", arguments: { project_id: modifiedProjectId } }],
          });
          msgs.push({
            role: "tool",
            tool_call_id: verifyId,
            name: "verify_schema",
            content: verifyContent,
            is_error: verifyError,
          });
          yield {
            type: "tool_result",
            id: verifyId,
            content: verifyContent,
            isError: verifyError,
          };
        }
      }
      // Loop — next iteration the model sees the tool results + verify.
    }

    yield {
      type: "error",
      error: `Stopped after ${MAX_TOOL_ITERATIONS} tool iterations. The agent is looping — refine your request or open a new thread.`,
    };
  });
