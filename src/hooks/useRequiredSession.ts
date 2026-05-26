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

    const applySession = (session: Session | null) => {
      if (!active) return;
      setState({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    void getRestoredSession().then(applySession);

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