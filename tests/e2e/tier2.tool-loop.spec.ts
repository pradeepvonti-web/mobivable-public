/**
 * Tier 2 — mocked-LLM tool round-trip.
 *
 * We intercept the upstream provider's SSE endpoint with `mockLLM` and
 * feed canned scripts. The studio's actual code runs unchanged — auth,
 * server fns, supabase, the SSE parser, the tool dispatch, persistence.
 *
 * Assertions stay on the UI surface (tool cards visible, image attached
 * in upstream body, refresh hydrates) — not on free-form model text.
 */
import { test, expect, anthropicScript, sendChat, toolCard } from "./fixtures";
import { SEED_PROJECT_NAME } from "./global-setup";

test.describe("@tier-2 agent tool loop (mocked LLM)", () => {
  test("first send renders a tool card + final reply", async ({ page, mockLLM }) => {
    // Iteration 1: model calls list_projects.
    // Iteration 2: model sees tool result, replies in text.
    await mockLLM([
      anthropicScript([
        { text: "Looking at your projects." },
        {
          toolCall: {
            id: "toolu_01abc",
            name: "list_projects",
            input: { limit: 5 },
          },
        },
      ]),
      anthropicScript([{ text: "You have one project so far." }]),
    ]);

    await page.goto("/agent");
    await sendChat(page, "List my projects.");

    // The collapsed tool card surfaces by tool name.
    await expect(toolCard(page, "list_projects")).toBeVisible({ timeout: 15_000 });

    // Final text from iteration-2 lands in the message list.
    await expect(
      page.getByText("You have one project so far."),
    ).toBeVisible();
  });

  test("active project + screenshot attaches as multimodal image", async ({
    page,
    mockLLM,
    llmIntercept,
  }) => {
    await mockLLM([anthropicScript([{ text: "I can see the home screen." }])]);

    await page.goto("/agent");
    await page.getByLabel("Active project").selectOption({ label: SEED_PROJECT_NAME });

    // Give the iframe a moment to fire FLUTTER_READY (capture is gated on it).
    // The seed project's empty-but-parseable schema means the engine
    // boots quickly. If it stalls past 10 s we want to know — that's a
    // regression in the bridge.
    await page.waitForFunction(
      () => document.querySelector('iframe[title="Flutter Preview"]') !== null,
      undefined,
      { timeout: 15_000 },
    );

    await sendChat(page, "Describe this screen.");
    await expect(page.getByText("I can see the home screen.")).toBeVisible({
      timeout: 20_000,
    });

    // The last intercepted upstream body should have an image block in
    // the latest user message. We don't assert on the base64 contents —
    // just the structural shape, so the assertion stays stable across
    // engine changes.
    const body = llmIntercept.lastRequestBody as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    const lastUser = body.messages
      ?.filter((m) => m.role === "user")
      .at(-1);
    expect(lastUser, "no user message in upstream body").toBeTruthy();
    const content = lastUser?.content;
    // Anthropic shape: array of content blocks
    expect(Array.isArray(content), "user content should be an array when image attached").toBe(true);
    if (Array.isArray(content)) {
      const hasImage = content.some(
        (b) => (b as { type?: string }).type === "image",
      );
      expect(hasImage, "expected an image block in upstream user message").toBe(true);
    }
  });

  test("refresh rehydrates the tool card + message history", async ({
    page,
    mockLLM,
  }) => {
    await mockLLM([
      anthropicScript([
        {
          toolCall: {
            id: "toolu_02xyz",
            name: "list_projects",
            input: { limit: 3 },
          },
        },
      ]),
      anthropicScript([{ text: "Persistence check ok." }]),
    ]);

    await page.goto("/agent");
    await sendChat(page, "Persistence check.");

    await expect(toolCard(page, "list_projects")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Persistence check ok.")).toBeVisible();

    await page.reload();

    // After hydration, the same content + tool card should re-render
    // from mcp_agent_messages — proving the round-trip persisted.
    await expect(toolCard(page, "list_projects")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Persistence check ok.")).toBeVisible();
  });

  test("max-iteration cap stops a runaway tool loop", async ({ page, mockLLM }) => {
    // Queue 10 identical scripts. The agent loop caps at 8 iterations,
    // so beyond that the runtime should stop and surface the cap message
    // — we don't want this to spin forever in CI.
    const runaway = anthropicScript([
      {
        toolCall: {
          id: "toolu_loop",
          name: "list_projects",
          input: { limit: 1 },
        },
      },
    ]);
    await mockLLM(Array.from({ length: 10 }, () => runaway));

    await page.goto("/agent");
    await sendChat(page, "Call list_projects forever.");

    await expect(
      page.getByText(/Stopped after \d+ tool iterations/i),
    ).toBeVisible({ timeout: 30_000 });
  });
});
