import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { PageShell } from "@/components/PageShell";

const PLAN_VALUES = ["starter", "pro"] as const;
const CADENCE_VALUES = ["monthly", "yearly"] as const;
type Plan = (typeof PLAN_VALUES)[number];
type Cadence = (typeof CADENCE_VALUES)[number];

const PLAN_META: Record<Plan, { name: string; tag: string; blurb: string }> = {
  starter: { name: "Starter", tag: "TIER_01", blurb: "5 published apps, source export, priority compile queue." },
  pro: { name: "Pro", tag: "TIER_02", blurb: "Unlimited apps, team workspaces, advanced analytics." },
};

const searchSchema = z.object({
  plan: fallback(z.enum(PLAN_VALUES), "starter").default("starter"),
  cadence: fallback(z.enum(CADENCE_VALUES), "monthly").default("monthly"),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: zodValidator(searchSchema),
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "Checkout — Mobivable" },
      { name: "description", content: "Confirm your Mobivable plan and complete payment." },
    ],
  }),
});

function CheckoutPage() {
  const { plan, cadence } = Route.useSearch();
  const navigate = useNavigate();
  const { openCheckout } = usePaddleCheckout();

  const [authState, setAuthState] = useState<"loading" | "guest" | "user">("loading");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const launched = useRef(false);

  const meta = PLAN_META[plan as Plan];
  const priceId = `${plan}_${cadence}`;

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      if (u) {
        setUser({ id: u.id, email: u.email ?? undefined });
        setAuthState("user");
      } else {
        setAuthState("guest");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u) {
        setUser({ id: u.id, email: u.email ?? undefined });
        setAuthState("user");
      } else {
        setAuthState("guest");
        setUser(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authState !== "user" || !user || launched.current) return;
    launched.current = true;
    openCheckout({
      priceId,
      customerEmail: user.email,
      customData: { userId: user.id },
      successUrl: `${window.location.origin}/checkout/success`,
    }).catch((e) => {
      launched.current = false;
      setError(e instanceof Error ? e.message : "Failed to open checkout");
    });
  }, [authState, user, priceId, plan, openCheckout]);

  return (
    <PageShell
      eyebrow={`Checkout · ${meta.tag}`}
      title={`Confirm ${meta.name} — ${cadence === "yearly" ? "Yearly" : "Monthly"}`}
      intro={meta.blurb}
    >
      <div className="max-w-2xl border border-border p-8 space-y-6">
        {authState === "loading" && (
          <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
            [···] Checking session
          </p>
        )}

        {authState === "guest" && (
          <div className="space-y-5">
            <p className="text-muted-foreground leading-relaxed">
              You need an account before we can attach your{" "}
              <span className="text-foreground">{meta.name}</span> subscription. Create one now
              (or log in) and you'll come right back here to finish checkout.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/signup"
                search={{ plan }}
                className="px-6 py-3 bg-primary text-background font-display uppercase tracking-wider hover:invert transition-all text-center"
              >
                Create account
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 border border-border font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors text-center"
              >
                Log in
              </Link>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              [0] After signing in, this page will open checkout automatically.
            </p>
          </div>
        )}

        {authState === "user" && (
          <div className="space-y-4">
            <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
              [···] Opening secure checkout
            </p>
            <p className="text-sm text-muted-foreground">
              The Paddle checkout should appear in a moment. If it doesn't,{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  launched.current = false;
                  navigate({ to: "/checkout", search: { plan, cadence } });
                }}
              >
                retry
              </button>
              .
            </p>
            {error && (
              <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 font-mono">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
