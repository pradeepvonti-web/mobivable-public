/**
 * Pure helpers for the in-studio MCP agent.
 *
 * The agent is a thin wrapper around `MCP_TOOLS` (the same dispatch table
 * the external /api/public/mcp route uses). It runs a tool-use loop:
 * the model emits text + tool calls, we run the tools via `getMcpTool()`,
 * feed results back, repeat until the model emits text-only.
 *
 * This file is split out from `mcp-agent.functions.ts` so the format
 * converters can be unit-tested without spinning up TanStack.
 */
import { MCP_TOOLS } from "./mcp-tools";

/** Anthropic tool-definition shape (Messages API, `tools` array). */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/** OpenAI / OpenAI-compat tool-definition shape (`tools` array). */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export function mcpToolsAsAnthropic(): AnthropicTool[] {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export function mcpToolsAsOpenAI(): OpenAITool[] {
  return MCP_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * System prompt the agent sees on every turn. Kept short — the model
 * already has the tool manifest, and verbose system prompts crowd out
 * actual user context on cheaper models.
 */
export const MCP_AGENT_SYSTEM_PROMPT =
  `You are the Mobivable studio assistant. The user is signed in to ` +
  `their own account; you can read and act across all of their ` +
  `projects through the supplied tools.\n\n` +
  `## SURGICAL EDIT TOOLS — USE THESE FIRST\n` +
  `For modifying existing apps, ALWAYS prefer surgical tools over send_chat_message:\n` +
  `- update_screen: change a screen's title, layout, background, transition\n` +
  `- add_element: add a single element to a screen at a specific position\n` +
  `- update_element: change one element's props (e.g., button label, card title)\n` +
  `- remove_element: remove an element by index\n` +
  `- update_theme: change colors, fonts, spacing — merge-style, only provided fields change\n` +
  `- update_navigation: change nav type, add/remove tabs\n` +
  `- verify_schema: validate the schema for issues — ALWAYS call this after writes\n\n` +
  `Workflow for editing:\n` +
  `1. Call list_screens to see the current state\n` +
  `2. Call get_screen to read elements on the target screen\n` +
  `3. Use surgical tools (update_element, add_element, etc.) to make precise changes\n` +
  `4. Call verify_schema to confirm the result is valid\n` +
  `5. Summarize what changed\n\n` +
  `Only use send_chat_message for FULL app generation from scratch.\n\n` +
  `## General Guidelines\n` +
  `- Call tools when you need real data. Do not guess project ids, ` +
  `screen ids, or knowledge contents.\n` +
  `- For destructive actions (delete_project), confirm in plain ` +
  `language with the user before calling the tool.\n` +
  `- Keep responses tight, markdown, action-oriented. After running ` +
  `tools, summarize what changed and what the user should do next.\n` +
  `- If a tool returns an error, explain it and suggest a fix instead ` +
  `of silently retrying.`;

/** Soft cap on tool-use iterations within a single turn. The model
 *  almost never needs more than 3–4; this just stops a runaway loop
 *  from melting credits. */
export const MAX_TOOL_ITERATIONS = 8;

/** Cap on per-tool-result payload sent back to the model. Large
 *  list_projects / get_screen results can balloon the context;
 *  truncation forces the model to refine its query. */
export const TOOL_RESULT_CHAR_CAP = 16_000;

export function clipToolResult(s: string): { text: string; truncated: boolean } {
  if (s.length <= TOOL_RESULT_CHAR_CAP) return { text: s, truncated: false };
  return {
    text:
      s.slice(0, TOOL_RESULT_CHAR_CAP) +
      `\n\n…(${(s.length - TOOL_RESULT_CHAR_CAP).toLocaleString()} more chars truncated — refine your query if you need them).`,
    truncated: true,
  };
}

/**
 * The agent loop assembles messages in a provider-neutral shape and the
 * SSE route formats them per-provider. Tool results carry a `tool_call_id`
 * so we can reconcile them with the assistant's prior tool_use blocks.
 *
 * User messages may carry an optional `imageDataUrl` (a `data:image/png;…`
 * URL) — the /agent UI captures the active Flutter preview before each
 * send so the model can see the app the user is asking about. The image
 * is attached as a multimodal block when converting per-provider.
 */
export interface UserImageAttachment {
  /** `data:image/png;base64,…` or `data:image/jpeg;base64,…`. */
  dataUrl: string;
  /** Short alt-text the model also sees (e.g. project name + screen title). */
  altText?: string;
}

export type AgentMsg =
  | { role: "system"; content: string }
  | { role: "user"; content: string; image?: UserImageAttachment }
  | {
      role: "assistant";
      content: string;
      tool_calls?: { id: string; name: string; arguments: Record<string, unknown> }[];
    }
  | { role: "tool"; tool_call_id: string; name: string; content: string; is_error?: boolean };

/** Anthropic's `messages` array entry. We only need user + assistant. */
export interface AnthropicMsg {
  role: "user" | "assistant";
  content:
    | string
    | (
        | { type: "text"; text: string }
        | {
            type: "image";
            source: { type: "base64"; media_type: string; data: string };
          }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
      )[];
}

/** Split a data URL into media type + base64 payload for Anthropic. */
function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  // data:image/png;base64,XXXX
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

/**
 * Convert our provider-neutral messages into Anthropic's mixed content
 * blocks. The trick: tool results are USER-role messages in Anthropic's
 * model (the model "asked" via tool_use, the user/system "answers" with
 * tool_result blocks). We coalesce consecutive tool results into one
 * user message so the API doesn't see role:user → role:user → role:user.
 */
export function toAnthropicMessages(msgs: AgentMsg[]): {
  system: string;
  messages: AnthropicMsg[];
} {
  const systems: string[] = [];
  const out: AnthropicMsg[] = [];

  for (const m of msgs) {
    if (m.role === "system") {
      systems.push(m.content);
      continue;
    }
    if (m.role === "user") {
      // Plain-text user messages can stay as a string. When an image is
      // attached we have to expand into the mixed-content array form so
      // Anthropic gets both the text and the base64 image block.
      if (!m.image) {
        out.push({ role: "user", content: m.content });
      } else {
        const parts: AnthropicMsg["content"] = [];
        const split = splitDataUrl(m.image.dataUrl);
        if (split) {
          parts.push({
            type: "image",
            source: {
              type: "base64",
              media_type: split.mediaType,
              data: split.data,
            },
          });
        }
        if (m.image.altText) {
          parts.push({ type: "text", text: `[attached preview] ${m.image.altText}` });
        }
        parts.push({ type: "text", text: m.content });
        out.push({ role: "user", content: parts });
      }
      continue;
    }
    if (m.role === "assistant") {
      const content: AnthropicMsg["content"] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls ?? []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
      }
      out.push({ role: "assistant", content: content.length ? content : m.content });
      continue;
    }
    if (m.role === "tool") {
      const block = {
        type: "tool_result" as const,
        tool_use_id: m.tool_call_id,
        content: m.content,
        ...(m.is_error ? { is_error: true } : {}),
      };
      const tail = out[out.length - 1];
      if (tail && tail.role === "user" && Array.isArray(tail.content)) {
        tail.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }

  return { system: systems.join("\n\n"), messages: out };
}

/**
 * OpenAI / OpenRouter message shape (assistant tool_calls, role:tool).
 * `content` can be an array when a user message carries an image — vision
 * models accept the `image_url` content-block form.
 */
export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenAIMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | OpenAIContentPart[];
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

export function toOpenAIMessages(msgs: AgentMsg[]): OpenAIMsg[] {
  return msgs.map((m): OpenAIMsg => {
    if (m.role === "system") {
      return { role: m.role, content: m.content };
    }
    if (m.role === "user") {
      if (!m.image) return { role: "user", content: m.content };
      // Multimodal: image_url accepts data: URLs directly on every model
      // we target (gpt-4o, gpt-4.1, gemini via openai-compat, openrouter).
      const parts: OpenAIContentPart[] = [
        { type: "image_url", image_url: { url: m.image.dataUrl } },
      ];
      if (m.image.altText) {
        parts.push({ type: "text", text: `[attached preview] ${m.image.altText}` });
      }
      parts.push({ type: "text", text: m.content });
      return { role: "user", content: parts };
    }
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: m.content || null,
        ...(m.tool_calls && m.tool_calls.length
          ? {
              tool_calls: m.tool_calls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      };
    }
    return {
      role: "tool",
      tool_call_id: m.tool_call_id,
      name: m.name,
      content: m.content,
    };
  });
}
