import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

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
  let session = (await supabase.auth.getSession()).data.session;

  if (!session && hasOAuthRedirectArtifacts()) {
    // Give supabase-js's detectSessionInUrl up to 3s to finish.
    session = await waitForSession(3000);
    if (!session) {
      session = (await supabase.auth.getSession()).data.session;
    }
  }

  if (!session) {
    // One short retry to cover the storage-hydration race.
    await new Promise((r) => setTimeout(r, 250));
    session = (await supabase.auth.getSession()).data.session;
  }

  if (!session) {
    // Final chance: listen briefly for a late SIGNED_IN event.
    session = await waitForSession(1000);
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
