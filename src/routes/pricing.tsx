import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

type PlanValue = "free_beta" | "starter" | "pro";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Mobivable" },
      { name: "description", content: "Free during beta. Simple, transparent plans for solo builders, teams, and enterprise mobile development." },
      { property: "og:title", content: "Pricing — Mobivable" },
      { property: "og:description", content: "Pick a plan that ships native iOS and Android apps from your chat thread." },
    ],
  }),
});

const tiers: Array<{
  code: string;
  name: string;
  plan: PlanValue;
  price: string;
  note: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}> = [
  {
    code: "T-00",
    name: "Free Beta",
    plan: "free_beta",
    price: "$0",
    note: "Free during public beta",
    features: ["Unlimited AI iterations", "1 published app", "Native iOS + Android builds", "App Store submission", "Community support"],
    cta: "Start Free",
  },
  {
    code: "T-01",
    name: "Starter",
    plan: "starter",
    price: "$29",
    note: "Per month",
    features: ["5 published apps", "Source code export", "Custom domains", "Priority compile queue", "Email support"],
    highlight: true,
    cta: "Go Starter",
  },
  {
    code: "T-02",
    name: "Pro",
    plan: "pro",
    price: "$99",
    note: "Per month",
    features: ["Unlimited published apps", "Team workspaces", "Advanced analytics", "Dedicated support", "Everything in Starter"],
    cta: "Go Pro",
  },
];

function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing Matrix"
      title="Pay to Ship. Nothing Else."
      intro="No seat tax. No build minute counters. Pick the tier that matches how aggressively you plan to deploy."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 border border-border">
        {tiers.map((t, i) => (
          <div
            key={t.code}
            className={`p-10 ${i < 2 ? "md:border-r border-border" : ""} ${
              t.highlight ? "bg-primary text-background" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-8">
              <span className={`font-mono text-[10px] uppercase tracking-widest ${t.highlight ? "text-background/60" : "text-primary"}`}>
                {t.code}
              </span>
              {t.highlight && (
                <span className="font-mono text-[10px] uppercase tracking-widest bg-background text-primary px-2 py-1">
                  Recommended
                </span>
              )}
            </div>
            <h3 className="font-display text-4xl uppercase mb-2">{t.name}</h3>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display text-6xl">{t.price}</span>
            </div>
            <p className={`font-mono text-[10px] uppercase tracking-widest mb-8 ${t.highlight ? "text-background/70" : "text-muted"}`}>
              {t.note}
            </p>
            <ul className="space-y-3 mb-10">
              {t.features.map((f) => (
                <li key={f} className={`text-sm flex gap-3 ${t.highlight ? "text-background" : "text-foreground"}`}>
                  <span className={t.highlight ? "text-background" : "text-primary"}>+</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              search={{ plan: t.plan }}
              className={`block text-center w-full px-6 py-4 font-display text-sm uppercase tracking-wider transition-all ${
                t.highlight
                  ? "bg-background text-primary hover:scale-105"
                  : "bg-primary text-background hover:invert"
              }`}
            >
              {t.cta}
            </Link>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
