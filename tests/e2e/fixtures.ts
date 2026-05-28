/**
 * Playwright fixtures.
 *
 * Exports a custom `test` whose pages come with two pre-wired helpers:
 *
 *   - `mockLLM(events)` — installs route handlers for `api.anthropic.com`
 *     and `api.openai.com` (+ `openrouter.ai` / `groq.com`) that pretend to
 *     be the upstream provider and return a canned SSE stream. Lets tier-2
 *     specs run the full agent loop end-to-end without burning real
 *     credits or going flaky on model changes.
 *
 *   - `lastLLMRequest()` — returns the last intercepted request body so a
 *     spec can assert "yes, the multimodal image block was attached."
 *
 * Both helpers are designed to be cheap — tests that don't call
 * `mockLLM()` will hit the real provider, which is the right thing for
 * tier-3 nightly.
 */
import { test as base, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

export interface AnthropicCannedEvent {
  /** Use the Anthropic SSE event names directly — keeps the canned
   *  scripts copy-pasteable from real-world dumps. */
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop";
  data?: unknown;
}

/** Convenience: build an Anthropic SSE stream out of high-level steps. */
export function anthropicScript(steps: {
  text?: string;
  toolCall?: { id: string; name: string; input: Record<string, unknown> };
}[]): string {
  const chunks: string[] = [];
  let blockIndex = 0;
  chunks.push(`event: message_start\ndata: ${JSON.stringify({ type: "message_start" })}\n\n`);
  for (const step of steps) {
    if (step.text !== undefined) {
      const idx = blockIndex++;
      chunks.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: idx,
          content_block: { type: "text", text: "" },
        })}\n\n`,
      );
      chunks.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: idx,
          delta: { type: "text_delta", text: step.text },
        })}\n\n`,
      );
      chunks.push(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: idx,
        })}\n\n`,
      );
    }
    if (step.toolCall) {
      const idx = blockIndex++;
      chunks.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: idx,
          content_block: {
            type: "tool_use",
            id: step.toolCall.id,
            name: step.toolCall.name,
          },
        })}\n\n`,
      );
      chunks.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: idx,
          delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify(step.toolCall.input),
          },
        })}\n\n`,
      );
      chunks.push(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: idx,
        })}\n\n`,
      );
    }
  }
  chunks.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`);
  chunks.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  return chunks.join("");
}

/** Captured-request mirror — last body, for spec assertions. */
interface LLMInterception {
  lastRequestBody: unknown;
  callCount: number;
}

export const test = base.extend<{
  /** Install a canned-SSE stream as the LLM upstream. Call this BEFORE
   *  the page issues any send. Multiple calls queue scripts FIFO — each
   *  intercepted request gets the next script. */
  mockLLM: (scripts: string[]) => Promise<void>;
  /** Inspect what the studio actually sent upstream. */
  llmIntercept: LLMInterception;
}>({
  llmIntercept: async ({}, use) => {
    const state: LLMInterception = { lastRequestBody: null, callCount: 0 };
    await use(state);
  },

  mockLLM: async ({ page, llmIntercept }, use) => {
    const matchers = [
      "**/api.anthropic.com/**",
      "**/api.openai.com/**",
      "**/openrouter.ai/**",
      "**/api.groq.com/**",
      "**/generativelanguage.googleapis.com/**",
      "**/ai.gateway.lovable.dev/**",
    ];

    const queue: string[] = [];

    const handler = async (route: Route) => {
      const request = route.request();
      try {
        llmIntercept.lastRequestBody = request.postDataJSON();
      } catch {
        llmIntercept.lastRequestBody = request.postData();
      }
      llmIntercept.callCount += 1;

      const body =
        queue.shift() ??
        // Default script: a tiny text-only reply so unscripted calls don't
        // hang the agent loop.
        anthropicScript([{ text: "ok" }]);

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    };

    for (const pattern of matchers) {
      await page.route(pattern, handler);
    }

    await use(async (scripts) => {
      queue.push(...scripts);
    });
  },
});

export { expect };

/** Drive the chat composer: type a message and hit send. */
export async function sendChat(page: Page, content: string): Promise<void> {
  const textarea = page.getByPlaceholder(/Ask the agent to do something/i);
  await textarea.fill(content);
  await page.getByRole("button", { name: /^Send$/ }).click();
}

/** Locator for a tool card by name (e.g. "list_projects"). */
export function toolCard(page: Page, name: string) {
  return page.locator(`code:has-text("${name}")`).first();
}
