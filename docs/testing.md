# Testing Mobivable

Two suites live in this repo:

- **Unit tests** — `npm test` (Vitest). Quick, in-memory, no Supabase, no LLM.
- **End-to-end** — `npm run test:e2e` (Playwright). Drives a real browser
  against a built studio that talks to a real local Supabase. Three tiers,
  selected by Playwright `grep`:

| Tier | What | When | Cost |
| --- | --- | --- | --- |
| `@tier-1` | Render smoke — `/agent` structure, picker, preview pane | Every PR | None |
| `@tier-2` | Mocked-LLM tool loop, multimodal image attach, persistence, max-iter cap | Every PR | None |
| `@tier-3` | Live LLM — does the real model pick the right tool name | Nightly cron | Real API key |

The PR workflow runs tiers 1 + 2 ([.github/workflows/e2e-pr.yml](../.github/workflows/e2e-pr.yml)).
The nightly workflow runs tier 3 ([.github/workflows/e2e-nightly.yml](../.github/workflows/e2e-nightly.yml)).

## Run locally

You need:

- Node 20+, `npm`
- Docker (for Supabase) and the [Supabase CLI](https://supabase.com/docs/guides/cli)
- Playwright browsers — install once with `npx playwright install chromium`

```bash
# 1. Bring up a local Supabase
supabase start

# 2. Apply our migrations against it
supabase db reset --linked=false

# 3. Export the URLs the dev server expects
eval "$(supabase status --output env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' | sed \
  -e 's/^API_URL=/export SUPABASE_URL=/' \
  -e 's/^ANON_KEY=/export SUPABASE_PUBLISHABLE_KEY=/' \
  -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/' )"

# 4. Run the suite you want
npm run test:e2e:smoke   # tier 1 only
npm run test:e2e:mocked  # tier 2 only (tier 1 + tier 2 with `test:e2e`)
npm run test:e2e:live    # tier 3 — needs ANTHROPIC_API_KEY too
```

The Playwright config will start `npm run dev` automatically on port 5173
when you run locally; in CI we run the production preview build instead.

After a run, `npm run test:e2e:report` opens the HTML report.

## What gets seeded

Global setup (`tests/e2e/global-setup.ts`) creates:

- A test user `playwright@mobivable.test` (idempotent — re-runs reuse it)
- One project named `[E2E] Test fixture project` owned by that user, with
  a minimal-but-parseable schema so the Flutter iframe boots quickly

The user's session is persisted to `tests/e2e/.auth/user.json`
(gitignored) and reused by every spec via Playwright's `storageState`.

## Writing tests

### Tier 1 (structural)

Hit `/agent`, assert what's in the DOM. Don't send messages — that
crosses into tier 2 territory and burns LLM time.

### Tier 2 (mocked LLM)

Import from `./fixtures`:

```ts
import { test, expect, anthropicScript, sendChat, toolCard } from "./fixtures";

test("calls list_projects", async ({ page, mockLLM }) => {
  await mockLLM([
    anthropicScript([
      { toolCall: { id: "x", name: "list_projects", input: {} } },
    ]),
    anthropicScript([{ text: "Done." }]),
  ]);
  await page.goto("/agent");
  await sendChat(page, "list my projects");
  await expect(toolCard(page, "list_projects")).toBeVisible();
});
```

`mockLLM([...])` queues SSE bodies FIFO. Each upstream LLM call
consumes one. After the queue empties, a default "ok" reply is
returned so unscripted calls don't hang.

### Tier 3 (live LLM)

Keep these *minimal*. Each case is a real API call. Tag with
`@tier-3` and assert on **tool names**, never on prose. Models change
wording; tool choice is what we care about.

## Common gotchas

- **`Test user sign-in failed`** in global-setup → SUPABASE_URL points
  to a different stack than where the migrations + user live. Make sure
  you're exporting from the same `supabase status`.
- **`expected an image block in upstream user message`** (tier 2) →
  Flutter iframe didn't fire `FLUTTER_READY` in time, so capture was
  skipped. Bump the `waitForFunction` timeout or check that the seed
  project's schema still parses.
- **Tier 1 grid-template-columns assertion fails** → someone refactored
  the Tailwind classes on `/agent`. Update the regex in
  `tier1.agent-renders.spec.ts` to the new template string.
