import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { PageShell } from "@/components/PageShell";
import {
  openCustomerPortal,
  changeSubscriptionPlan,
} from "@/utils/payments.functions";
import { AppPromptComposer } from "@/components/AppPromptComposer";

type Sub = {
  status: string;
  price_id: string;
  product_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  environment: string;
};

type Profile = { display_name: string | null; plan: "free_beta" | "starter" | "pro" };

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: DashboardPage,
  pendingComponent: AuthHydrating,
  pendingMs: 0,
  pendingMinMs: 0,
  head: () => ({
    meta: [
      { title: "Dashboard — Mobivable" },
      { name: "description", content: "Manage your Mobivable subscription and account." },
    ],
  }),
});

const PRICE_LABEL: Record<string, string> = {
  starter_monthly: "Starter · Monthly",
  starter_yearly: "Starter · Yearly",
  pro_monthly: "Pro · Monthly",
  pro_yearly: "Pro · Yearly",
};

const PLAN_QUOTA: Record<Profile["plan"], string> = {
  free_beta: "1 published app",
  starter: "5 published apps",
  pro: "Unlimited published apps",
};

function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const portal = useServerFn(openCustomerPortal);
  const changePlan = useServerFn(changeSubscriptionPlan);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const env = getPaddleEnvironment();
    const [{ data: prof }, { data: subRow }] = await Promise.all([
      supabase.from("profiles").select("display_name, plan").eq("id", u.user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status, price_id, product_id, current_period_end, cancel_at_period_end, environment")
        .eq("user_id", u.user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setProfile(prof as Profile | null);
    setSub(subRow as Sub | null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleManage() {
    setBusy("portal");
    setError(null);
    try {
      const { url } = await portal({});
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open portal");
    } finally {
      setBusy(null);
    }
  }

  async function handleChange(targetPriceId: string) {
    setBusy(targetPriceId);
    setError(null);
    try {
      await changePlan({ data: { targetPriceId: targetPriceId as any } });
      await load();
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change plan");
    } finally {
      setBusy(null);
    }
  }

  const isPastDue = sub?.status === "past_due";
  const isCanceled = sub?.status === "canceled" || sub?.cancel_at_period_end;
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : null;

  const tierOptions: { id: string; label: string }[] = [
    { id: "starter_monthly", label: "Starter · Monthly · $29" },
    { id: "starter_yearly", label: "Starter · Yearly · $276" },
    { id: "pro_monthly", label: "Pro · Monthly · $99" },
    { id: "pro_yearly", label: "Pro · Yearly · $948" },
  ].filter((o) => o.id !== sub?.price_id);

  return (
    <PageShell
      eyebrow="ACCOUNT"
      title={profile?.display_name ? `Hello, ${profile.display_name}` : "Your Dashboard"}
      intro="Manage your subscription, change plans, and update billing."
    >
      <div className="space-y-12 max-w-4xl mx-auto">
        <AppPromptComposer />

        {isPastDue && (
          <div className="border border-destructive/50 bg-destructive/10 p-5">
            <p className="font-display text-sm uppercase tracking-wider text-destructive mb-2">
              Payment failed
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              We couldn't process your latest payment. Your access stays on while we retry, but
              please update your payment method to avoid losing it.
            </p>
            <button
              type="button"
              onClick={handleManage}
              disabled={busy === "portal"}
              className="px-4 py-2 bg-destructive text-background font-display text-xs uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Update payment method"}
            </button>
          </div>
        )}

        {loading ? (
          <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
            [···] Loading
          </p>
        ) : (
          <>
            <section className="border border-border p-8">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Current plan
              </p>
              <h2 className="font-display text-4xl uppercase tracking-tight mb-2">
                {profile?.plan === "free_beta" ? "Free Beta" : profile?.plan === "pro" ? "Pro" : "Starter"}
              </h2>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-6">
                {PLAN_QUOTA[profile?.plan ?? "free_beta"]}
              </p>

              {sub && (
                <div className="space-y-2 font-mono text-xs uppercase tracking-wider text-muted-foreground border-t border-border pt-4">
                  <div>Subscription · {PRICE_LABEL[sub.price_id] ?? sub.price_id}</div>
                  <div>Status · {sub.status}</div>
                  {periodEnd && (
                    <div>
                      {isCanceled ? "Access until" : "Renews on"} · {periodEnd}
                    </div>
                  )}
                </div>
              )}
            </section>

            {sub && !isCanceled && (
              <section className="border border-border p-8">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Change plan
                </p>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Upgrades apply immediately with prorated billing. Downgrades take effect at your
                  next renewal so you keep what you've paid for.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {tierOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => handleChange(o.id)}
                      className="px-4 py-3 border border-border font-display text-xs uppercase tracking-wider text-left hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {busy === o.id ? "Updating…" : o.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {sub && (
              <section className="border border-border p-8">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Billing
                </p>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Manage your payment method, download invoices, or cancel your subscription
                  through our payment portal.
                </p>
                <button
                  type="button"
                  onClick={handleManage}
                  disabled={busy === "portal"}
                  className="px-5 py-3 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
                >
                  {busy === "portal" ? "Opening…" : "Manage billing"}
                </button>
              </section>
            )}

            {!sub && (
              <section className="border border-border p-8">
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  You're on the Free Beta plan. Upgrade for more published apps, custom domains,
                  and priority compile queue.
                </p>
                <Link
                  to="/pricing"
                  className="inline-block px-5 py-3 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all"
                >
                  View plans
                </Link>
              </section>
            )}

            {error && (
              <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 font-mono">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
