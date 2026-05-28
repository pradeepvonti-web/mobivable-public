/**
 * Playwright config for Mobivable's e2e suite.
 *
 * Three tiers, gated by Playwright `grep` so CI can run each
 * independently:
 *
 *   tier-1  Structural smoke (every PR). Pure UI rendering, no LLM, no
 *           write-path. Fast — should stay <30 s wall-clock.
 *   tier-2  Mocked-LLM tool round-trip (every PR). Intercepts the
 *           upstream provider fetch and replays canned SSE so the chat
 *           UI exercises its parser + tool-card logic deterministically.
 *   tier-3  Live-LLM smoke (nightly cron). Real provider. Asserts on
 *           tool-call NAMES, never on free-form model text — model
 *           releases change wording, not which tool gets picked.
 *
 * Tests advertise their tier via title prefix (`@tier-1 …`). The CI
 * workflows pass `--grep "@tier-1|@tier-2"` (PR) or `"@tier-3"` (nightly).
 *
 * Browsers are skipped from the install step in the workflow because
 * Playwright handles browser caching better when you do it explicitly
 * (`npx playwright install --with-deps chromium`).
 */
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 5173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // CI runs in headless mode by default; locally `--headed` works.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Use the storageState minted by global-setup. Tier-2 / tier-3 specs
    // override this when they need an anonymous page or a different user.
    storageState: "tests/e2e/.auth/user.json",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Reuse a running dev server if the developer is iterating locally;
  // CI starts its own via the workflow.
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        port,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
