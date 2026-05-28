/**
 * Tier 3 — live-LLM smoke (nightly only).
 *
 * Talks to a REAL provider with a REAL key. Asserts the smallest possible
 * surface: did the model pick the right tool? We never assert on free-form
 * text because model releases change wording all the time and we don't
 * want CI to go red over "Sure, here's…" vs "Here are your projects…".
 *
 * Skipped unless one of the provider keys is present in env, which the
 * nightly workflow injects from secrets. PR runs skip this file entirely
 * via `--grep "@tier-1|@tier-2"`.
 */
import { test, expect, sendChat, toolCard } from "./fixtures";

const hasProviderKey = !!(
  process.env.ANTHROPIC_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENROUTER_API_KEY
);

test.describe("@tier-3 live LLM tool routing", () => {
  test.skip(!hasProviderKey, "no provider key — set ANTHROPIC_API_KEY (or OPENAI/OPENROUTER) to run.");

  // Keep this very tight. Each test costs money + minutes; only add a
  // case if it tests something the mocked tier-2 fundamentally can't.

  test("a 'list my projects' prompt picks list_projects", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/agent");
    await sendChat(page, "List my projects. Just the names.");

    // Real model — give it some breathing room. We assert on the tool
    // card by NAME because that's deterministic; the prose around it
    // isn't.
    await expect(toolCard(page, "list_projects")).toBeVisible({
      timeout: 90_000,
    });
  });
});
