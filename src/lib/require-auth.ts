import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * Global auth guard for protected route `beforeLoad`.
 *
 * Waits for the Supabase session to hydrate from storage (handles the
 * post-OAuth-redirect race where `getUser()` fires before the session is
 * restored). Redirects to `/login` if no session materialises.
 */
export async function requireAuth(opts?: { redirectTo?: string }): Promise<Session> {
  let session = (await supabase.auth.getSession()).data.session;

  if (!session) {
    session = await new Promise<Session | null>((resolve) => {
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
      }, 1500);
    });
  }

  if (!session) {
    throw redirect({ to: "/login", search: opts?.redirectTo ? { redirect: opts.redirectTo } : undefined });
  }
  return session;
}
