import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

function isSessionLike(value: unknown): value is Session {
  return !!value && typeof value === "object" && "access_token" in value && "user" in value;
}

function readSessionFromStorage(): Session | null {
  if (typeof window === "undefined") return null;

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes("auth-token")) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as
        | Session
        | { currentSession?: Session | null; session?: Session | null }
        | null;

      if (isSessionLike(parsed)) return parsed;
      if (isSessionLike(parsed?.currentSession)) return parsed.currentSession;
      if (isSessionLike(parsed?.session)) return parsed.session;
    }
  } catch {
    return null;
  }

  return null;
}

async function getSessionWithTimeout(timeoutMs: number): Promise<Session | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result || !("data" in result)) {
      return readSessionFromStorage();
    }

    return result.data.session ?? readSessionFromStorage();
  } catch {
    return readSessionFromStorage();
  }
}

/** Tokens left by the OAuth provider/broker on the redirect URL. */
function hasOAuthRedirectArtifacts(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return (
    hash.includes("access_token=") ||
    hash.includes("refresh_token=") ||
    hash.includes("provider_token=") ||
    /[?&]code=/.test(search)
  );
}

/** Wait up to `timeoutMs` for an authenticated session via onAuthStateChange. */
function waitForSession(timeoutMs: number): Promise<Session | null> {
  return new Promise((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        resolve(s);
      }
    });
    const timer = setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Global auth guard for protected route `beforeLoad`.
 *
 * 1. Read session from storage.
 * 2. If absent AND the URL still carries OAuth redirect artifacts
 *    (`#access_token=...` / `?code=...`), wait for supabase-js to parse them
 *    and emit a SIGNED_IN event before deciding.
 * 3. Otherwise retry the session lookup ONCE after a short delay to absorb
 *    the storage-hydration race on hard reloads.
 * 4. Only then redirect to /login.
 */
export async function getRestoredSession(): Promise<Session | null> {
  let session = await getSessionWithTimeout(1200);

  if (!session && hasOAuthRedirectArtifacts()) {
    // Give supabase-js's detectSessionInUrl up to 3s to finish.
    session = await waitForSession(3000);
    if (!session) {
      session = await getSessionWithTimeout(1200);
    }
  }

  if (!session) {
    // Retry with exponential backoff to absorb transient hydration races
    // (slow storage reads, async token refresh, throttled main thread).
    const backoffsMs = [150, 300, 600, 1000];
    for (const delay of backoffsMs) {
      await new Promise((r) => setTimeout(r, delay));
      session = await getSessionWithTimeout(1200);
      if (session) break;
    }
  }

  if (!session) {
    // Final chance: listen briefly for a late SIGNED_IN event.
    session = await waitForSession(1500);
  }

  return session;
}

export async function requireAuth(opts?: { redirectTo?: string }): Promise<Session> {
  const session = await getRestoredSession();

  if (!session) {
    throw redirect({
      to: "/login",
      search: opts?.redirectTo ? { redirect: opts.redirectTo } : undefined,
    });
  }
  return session;
}
