/**
 * Playwright global setup — runs once before any spec.
 *
 * What it does:
 *   1. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.
 *   2. Creates (or reuses) a deterministic test user via the admin API.
 *   3. Seeds one project owned by that user so the project picker has
 *      something to pick on first paint.
 *   4. Signs the user in with supabase-js, then persists the resulting
 *      session into `tests/e2e/.auth/user.json` — Playwright reuses it
 *      as `storageState` so every spec starts already authenticated.
 *
 * Idempotent: re-runs against the same Supabase don't duplicate the
 * user or pile up projects.
 *
 * If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing we throw
 * loudly — the suite cannot meaningfully run without a backend.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// ESM ("type":"module") has no __dirname; derive it from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url));

export const TEST_USER_EMAIL = "playwright@mobivable.test";
export const TEST_USER_PASSWORD = "playwright-fixture-pw!42";
export const SEED_PROJECT_NAME = "[E2E] Test fixture project";

export default async function globalSetup(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error(
      "Playwright e2e: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY. " +
        "Tier-1 and tier-2 specs need a real (local Supabase is fine) backend.",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. user ──
  // The admin SDK doesn't expose a clean "upsert user" — create + ignore
  // the 422 if they already exist from a prior run.
  let userId: string;
  const created = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });
  if (created.error) {
    // Already exists path: look them up by email.
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.data.users.find((u) => u.email === TEST_USER_EMAIL);
    if (!existing) {
      throw new Error(
        `Could not create or find test user: ${created.error.message}`,
      );
    }
    userId = existing.id;
  } else {
    userId = created.data.user.id;
  }

  // ── 2. seed project ──
  // Skip if one already exists with our marker name so re-runs stay clean.
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", SEED_PROJECT_NAME)
    .maybeSingle();
  if (!existing) {
    await admin.from("projects").insert({
      user_id: userId,
      name: SEED_PROJECT_NAME,
      prompt: "A minimal fixture project so the agent has something to talk about.",
      model: "google/gemini-2.5-flash",
      status: "ready",
      // Schema is empty-but-parseable so parseAppSchema doesn't return null
      // and the Flutter iframe doesn't sit in 'loading…' forever.
      result: JSON.stringify({
        screens: [{ id: "home", title: "Home", layout: "stack", elements: [] }],
      }),
    });
  }

  // ── 3. sign in + persist session ──
  const userClient = createClient(url, anonKey);
  const signin = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signin.error || !signin.data.session) {
    throw new Error(`Test user sign-in failed: ${signin.error?.message}`);
  }

  const { access_token, refresh_token } = signin.data.session;
  const authPath = resolve(__dirname, ".auth/user.json");
  await mkdir(dirname(authPath), { recursive: true });

  // Mirror the format Supabase's gotrue client uses in localStorage so
  // the SSR session hydration on first paint picks it up.
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const storageValue = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: signin.data.session.expires_at,
    token_type: "bearer",
    user: signin.data.user,
  });

  await writeFile(
    authPath,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: process.env.E2E_BASE_URL ?? "http://localhost:5173",
          localStorage: [{ name: storageKey, value: storageValue }],
        },
      ],
    }),
    "utf-8",
  );
}
