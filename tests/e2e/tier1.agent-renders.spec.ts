/**
 * Tier 1 — render smoke for /agent.
 *
 * Pure UI assertions: no LLM call, no sendChat. We're catching structural
 * regressions — route compile errors, layout grid death, missing imports
 * that pass tsc but blow up at runtime, etc.
 *
 * Every assertion here should be cheap and deterministic. If something
 * needs the AI provider, it belongs in tier-2.
 */
import { test, expect } from "./fixtures";
import { SEED_PROJECT_NAME } from "./global-setup";

test.describe("@tier-1 /agent renders", () => {
  test("threads sidebar, project picker, composer, empty state", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/agent");

    // Page-shell header
    await expect(page.getByRole("heading", { name: /Agent/i })).toBeVisible();

    // Sidebar
    await expect(page.getByRole("button", { name: /New thread/i })).toBeVisible();

    // Project picker is populated by global-setup's seed project
    const picker = page.getByLabel("Active project");
    await expect(picker).toBeVisible();
    await expect(picker).toContainText("No active project");
    await expect(picker).toContainText(SEED_PROJECT_NAME);

    // Composer
    await expect(
      page.getByPlaceholder(/Ask the agent to do something/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send$/ })).toBeVisible();

    // Empty state
    await expect(page.getByText("What would you like to do?")).toBeVisible();

    // No client-side errors during the render. We filter out a couple of
    // known-benign Vite warnings that aren't actionable.
    const noisy = errors.filter(
      (e) => !/Download the React DevTools/.test(e) && !/source map/i.test(e),
    );
    expect(noisy, `Unexpected console errors:\n${noisy.join("\n")}`).toHaveLength(0);
  });

  test("picking a project mounts the preview pane (3-col layout)", async ({ page }) => {
    await page.goto("/agent");

    // The layout flips to 3 columns once a project is selected. Grep the
    // grid template-columns rather than the className so this stays
    // resilient to Tailwind class reorders.
    const grid = page.locator("div.grid").first();
    await expect(grid).toHaveAttribute("class", /grid-cols-\[260px_1fr\]/);

    await page.getByLabel("Active project").selectOption({ label: SEED_PROJECT_NAME });

    await expect(grid).toHaveAttribute(
      "class",
      /grid-cols-\[220px_1fr_360px\]/,
    );

    // Flutter iframe is mounted (it doesn't need to be READY for this
    // assertion — just present in the DOM).
    await expect(
      page.locator('iframe[title="Flutter Preview"]'),
    ).toBeVisible();

    // The "Hide preview" toggle appears once a project is active.
    await expect(page.getByRole("button", { name: /Hide preview/i })).toBeVisible();
  });

  test("Hide preview collapses to 2 columns", async ({ page }) => {
    await page.goto("/agent");
    await page.getByLabel("Active project").selectOption({ label: SEED_PROJECT_NAME });

    await page.getByRole("button", { name: /Hide preview/i }).click();

    const grid = page.locator("div.grid").first();
    await expect(grid).toHaveAttribute("class", /grid-cols-\[260px_1fr\]/);
    await expect(page.locator('iframe[title="Flutter Preview"]')).toHaveCount(0);

    // Toggle label flips
    await expect(page.getByRole("button", { name: /Show preview/i })).toBeVisible();
  });
});
