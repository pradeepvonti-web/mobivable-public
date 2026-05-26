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
    let settled = false;

    const applySession = (session: Session | null) => {
      if (!active) return;
      settled = true;
      setState({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    const fallbackTimer = window.setTimeout(async () => {
      if (!active || settled) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          applySession(data.session);
          return;
        }

        const { data: userData, error } = await supabase.auth.getUser();
        if (error) {
          console.error("[useRequiredSession] Fallback user lookup failed", error);
        }

        if (userData.user) {
          const refreshed = await supabase.auth.refreshSession();
          applySession(refreshed.data.session ?? null);
          return;
        }

        applySession(null);
      } catch (error) {
        console.error("[useRequiredSession] Timed out restoring session", error);
        applySession(null);
      }
    }, 5000);

    void getRestoredSession()
      .then(applySession)
      .catch((error) => {
        console.error("[useRequiredSession] Failed to restore session", error);
        applySession(null);
      });

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
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