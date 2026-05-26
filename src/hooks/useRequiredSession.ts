import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getRestoredSession } from "@/lib/require-auth";

type RequiredSessionState = {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
};

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
        const restoredSession = await withTimeout(getRestoredSession(), 4000);
        if (restoredSession) {
          applySession(restoredSession);
          return;
        }

        const userResult = await withTimeout(supabase.auth.getUser(), 2000);
        const userData = userResult?.data;
        const error = userResult?.error;

        if (error) {
          console.error("[useRequiredSession] User lookup failed", error);
        }

        const user = userData?.user ?? null;

        if (user) {
          applySession({ user } as Session);

          void supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
              applySession(data.session);
            }
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