import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  monthly: number;
  yearly: number;
  freeNote?: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}> = [
  {
    code: "T-00",
    name: "Free Beta",
    plan: "free_beta",
    monthly: 0,
    yearly: 0,
    freeNote: "Free during public beta",
    features: ["Unlimited AI iterations", "1 published app", "Native iOS + Android builds", "App Store submission", "Community support"],
    cta: "Start Free",
  },
  {
    code: "T-01",
    name: "Starter",
    plan: "starter",
    monthly: 29,
    yearly: 23,
    features: ["5 published apps", "Source code export", "Custom domains", "Priority compile queue", "Email support"],
    highlight: true,
    cta: "Go Starter",
  },
  {
    code: "T-02",
    name: "Pro",
    plan: "pro",
    monthly: 99,
    yearly: 79,
    features: ["Unlimited published apps", "Team workspaces", "Advanced analytics", "Dedicated support", "Everything in Starter"],
    cta: "Go Pro",
  },
];

function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  return (
    <PageShell
      eyebrow="Pricing Matrix"
      title="Pay to Ship. Nothing Else."
      intro="No seat tax. No build minute counters. Pick the tier that matches how aggressively you plan to deploy."
    >
      <div className="mb-8 flex justify-center">
        <div className="inline-flex border border-border font-mono text-[10px] uppercase tracking-widest" role="tablist" aria-label="Billing cadence">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={billing === c}
              onClick={() => setBilling(c)}
              className={`px-5 py-3 transition-colors ${billing === c ? "bg-primary text-background" : "text-muted hover:text-foreground"}`}
            >
              {c}
              {c === "yearly" && <span className="ml-2 opacity-70">−20%</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 border border-border">
        {tiers.map((t, i) => {
          const price = billing === "yearly" ? t.yearly : t.monthly;
          const note = t.freeNote
            ? t.freeNote
            : billing === "yearly"
              ? "Per month, billed yearly"
              : "Per month";
          return (
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
                <span className="font-display text-6xl">${price}</span>
              </div>
              <p className={`font-mono text-[10px] uppercase tracking-widest mb-8 ${t.highlight ? "text-background/70" : "text-muted"}`}>
                {note}
              </p>
              <ul className="space-y-3 mb-10">
                {t.features.map((f) => (
                  <li key={f} className={`text-sm flex gap-3 ${t.highlight ? "text-background" : "text-foreground"}`}>
                    <span className={t.highlight ? "text-background" : "text-primary"}>+</span>
                    {f}
                  </li>
                ))}
              </ul>
              {t.plan === "free_beta" ? (
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
              ) : (
                <Link
                  to="/checkout"
                  search={{ plan: t.plan, cadence: billing }}
                  className={`block text-center w-full px-6 py-4 font-display text-sm uppercase tracking-wider transition-all ${
                    t.highlight
                      ? "bg-background text-primary hover:scale-105"
                      : "bg-primary text-background hover:invert"
                  }`}
                >
                  {t.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
