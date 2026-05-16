import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "How does billing work?",
    a: "Subscriptions are billed via Paddle on the cadence you select at checkout — monthly or yearly. Yearly plans are charged upfront and save roughly 20% versus paying month-to-month. Your card is charged automatically at the start of each billing period, and every payment generates a tax-compliant invoice emailed to you.",
  },
  {
    q: "What's your refund policy?",
    a: "We offer a 14-day money-back guarantee on first-time purchases of any paid plan — email support and we'll process a full refund through Paddle, no questions asked. Renewals after the first period are non-refundable, but you can cancel at any time to stop future charges.",
  },
  {
    q: "How many apps can I publish on each plan?",
    a: "Free includes 1 published app with a Lovable subdomain. Starter raises the limit to 5 published apps with custom domains. Pro is unlimited published apps, white-label deploys, and priority build infrastructure. Draft and unpublished projects don't count toward the limit on any plan.",
  },
  {
    q: "What happens when I upgrade my plan?",
    a: "Upgrades take effect immediately. You'll be charged a prorated amount for the remainder of the current billing period at the new rate, and all higher-tier features unlock right away — no redeploy required.",
  },
  {
    q: "What happens when I downgrade or cancel?",
    a: "Downgrades and cancellations take effect at the end of your current billing period, so you keep access to paid features until then. If you exceed the new plan's app limit, existing published apps stay live but you won't be able to publish new ones until you're back within the quota.",
  },
  {
    q: "Can I switch between monthly and yearly?",
    a: "Yes. Switching from monthly to yearly applies immediately with proration. Switching from yearly to monthly takes effect at the next renewal so you get the full value of the year you already paid for.",
  },
];

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
