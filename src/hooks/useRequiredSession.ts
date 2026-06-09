import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getRestoredSession } from "@/lib/require-auth";

type RequiredSessionState = {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
};

const BACKUP_KEY = "mobivable.session.backup.v1";

/**
 * Read any persisted Supabase session token from localStorage synchronously.
 *
 * When the app runs inside the Lovable preview iframe, async `getSession()`
 * occasionally hangs (storage partitioning races, slow IndexedDB) and the
 * UI gets stuck on "Restoring Session". We mirror the session into a tiny
 * backup key so we can rehydrate instantly on next mount, regardless of
 * whether supabase-js has finished bootstrapping.
 */
function readBackupSession(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY) ?? window.sessionStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeBackupSession(session: Session | null) {
  try {
    if (!session?.access_token || !session?.refresh_token) {
      window.localStorage.removeItem(BACKUP_KEY);
      window.sessionStorage.removeItem(BACKUP_KEY);
      return;
    }
    const payload = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    // Write to both — localStorage survives reloads, sessionStorage
    // survives even when localStorage is partitioned in an iframe.
    window.localStorage.setItem(BACKUP_KEY, payload);
    window.sessionStorage.setItem(BACKUP_KEY, payload);
  } catch {
    /* storage unavailable; nothing to do */
  }
}

export function useRequiredSession() {
  const navigate = useNavigate();
  const [state, setState] = useState<RequiredSessionState>({
    session: null,
    status: "loading",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let active = true;
    let bootstrapFinished = false;

    const applySession = (session: Session | null) => {
      if (!active) return;
      writeBackupSession(session);
      setState({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!bootstrapFinished && !session) return;
      applySession(session);
    });

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
      ]);
    };

    void (async () => {
      try {
        // 1. Fast path — try the canonical session immediately (no retries).
        const quick = await withTimeout(supabase.auth.getSession(), 1500);
        if (quick?.data?.session) {
          applySession(quick.data.session);
          bootstrapFinished = true;
          return;
        }

        // 2. Backup path — rehydrate from our mirrored tokens. This is the
        //    critical fix for preview iframes where the supabase-js storage
        //    handshake hangs but the tokens are still readable.
        const backup = readBackupSession();
        if (backup) {
          const restored = await withTimeout(
            supabase.auth.setSession(backup),
            2000,
          );
          if (restored?.data?.session) {
            applySession(restored.data.session);
            bootstrapFinished = true;
            return;
          }
        }

        // 3. Slow path — the original retry-with-backoff restore.
        const restoredSession = await withTimeout(getRestoredSession(), 3000);
        if (restoredSession) {
          applySession(restoredSession);
          bootstrapFinished = true;
          return;
        }

        // 4. Last resort — validate user directly.
        const userResult = await withTimeout(supabase.auth.getUser(), 1500);
        const user = userResult?.data?.user ?? null;
        if (user) {
          applySession({ user } as Session);
          bootstrapFinished = true;
          void supabase.auth.getSession().then(({ data }) => {
            if (data.session) applySession(data.session);
          });
          return;
        }

        applySession(null);
      } catch (error) {
        console.error("[useRequiredSession] Failed to bootstrap auth state", error);
        applySession(null);
      } finally {
        bootstrapFinished = true;
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.status !== "unauthenticated") return;

    navigate({
      to: "/login",
      search:
        typeof window === "undefined"
          ? undefined
          : {
              redirect: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            },
      replace: true,
    });
  }, [navigate, state.status]);

  return state;
}
