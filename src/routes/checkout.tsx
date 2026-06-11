import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";

const PLAN_VALUES = ["starter", "pro", "scale", "business"] as const;
const CADENCE_VALUES = ["monthly", "yearly"] as const;
type Plan = (typeof PLAN_VALUES)[number];

const PLAN_META: Record<Plan, { name: string; tag: string; blurb: string }> = {
  starter: { name: "Starter", tag: "TIER_01", blurb: "120 AI credits / month, 5 published apps, source export." },
  pro: { name: "Pro", tag: "TIER_02", blurb: "300 AI credits / month, unlimited apps, priority queue." },
  scale: { name: "Scale", tag: "TIER_03", blurb: "700 AI credits / month, team seats, app analytics." },
  business: { name: "Business", tag: "TIER_04", blurb: "2,000 AI credits / month, SSO, dedicated success manager." },
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
  const [authState, setAuthState] = useState<"loading" | "guest" | "user">("loading");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

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

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
      : undefined;

  return (
    <PageShell
      eyebrow={`Checkout · ${meta.tag}`}
      title={`Confirm ${meta.name} — ${cadence === "yearly" ? "Yearly" : "Monthly"}`}
      intro={meta.blurb}
    >
      <div className="max-w-3xl border border-border p-6 space-y-6">
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
          </div>
        )}

        {authState === "user" && user && (
          <StripeEmbeddedCheckout
            priceId={priceId}
            customerEmail={user.email}
            userId={user.id}
            returnUrl={returnUrl}
          />
        )}
      </div>
    </PageShell>
  );
}
