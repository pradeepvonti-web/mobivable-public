import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { PageShell } from "@/components/PageShell";

const searchSchema = z.object({
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/checkout/success")({
  validateSearch: searchSchema,
  component: CheckoutSuccessPage,
  head: () => ({
    meta: [
      { title: "Checkout complete — Mobivable" },
      { name: "description", content: "Your Mobivable subscription is active." },
    ],
  }),
});

function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"polling" | "ready" | "slow">("polling");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const env = getStripeEnvironment();

    const tick = async () => {
      attempts += 1;
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        // No session yet (e.g. confirming email in another tab) — redirect to login.
        navigate({ to: "/login" });
        return;
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (sub?.status && ["active", "trialing", "past_due"].includes(sub.status)) {
        setStatus("ready");
        setTimeout(() => navigate({ to: "/dashboard" }), 800);
        return;
      }
      if (attempts >= 12) {
        // 12 × 1.5s = 18s. Stop polling but let the user proceed manually.
        setStatus("slow");
        return;
      }
      setTimeout(tick, 1500);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <PageShell
      eyebrow="STATUS_200"
      title={status === "ready" ? "Subscription Activated" : "Confirming Payment"}
      intro={
        status === "ready"
          ? "Your plan is live. Taking you to your dashboard…"
          : status === "slow"
            ? "Payment received. Stripe is taking a moment to sync — you can head to the dashboard now."
            : "Waiting for Stripe to confirm your payment…"
      }
    >
      <div className="max-w-xl border border-border p-8 space-y-6">
        <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
          {status === "polling" && "[···] Listening for Stripe confirmation"}
          {status === "ready" && "[✓] Subscription synced · Redirecting"}
          {status === "slow" && "[!] Sync slower than usual · Refresh dashboard in a minute"}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/dashboard"
            className="px-6 py-3 bg-primary text-background font-display uppercase tracking-wider hover:invert transition-all text-center"
          >
            Go to dashboard
          </Link>
          <Link
            to="/"
            className="px-6 py-3 border border-border font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors text-center"
          >
            Back to home
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
