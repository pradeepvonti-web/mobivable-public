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
    q: "What's an AI credit?",
    a: "One credit covers one AI action — a chat turn with your agent team, an AI Studio generation, a debug pass, or a research call. Heavier operations like full-project generation or image generation cost a few credits each. The cost is shown next to every action in the editor.",
  },
  {
    q: "Do credits roll over?",
    a: "No. Monthly credits reset every 30 days on your billing anniversary. Free Beta's daily credits reset every 24 hours. Unused credits do not accumulate — pick a plan that matches how much you build each month.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "AI actions are blocked until your next reset, or until you upgrade. Your project and code stay safe — only AI generation is paused. One-time credit top-ups are coming soon.",
  },
  {
    q: "How does billing work?",
    a: "Subscriptions are billed securely via Stripe on the cadence you select — monthly or yearly. Yearly plans are charged upfront and save roughly 20%. Every payment generates a tax-compliant invoice emailed to you.",
  },
  {
    q: "What's your refund policy?",
    a: "We offer a 30-day money-back guarantee on first-time purchases of any paid plan. You can cancel anytime from your dashboard's billing portal to stop future renewals. See our refund policy page for full details.",
  },
  {
    q: "What happens when I upgrade or downgrade?",
    a: "Upgrades take effect immediately with prorated billing, and your credit bucket refills to the new plan's allowance right away. Downgrades take effect at the end of your current billing period.",
  },
];

type PlanValue = "free_beta" | "starter" | "pro" | "scale" | "business";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Mobivable" },
      { name: "description", content: "Credit-based plans for building native mobile apps with AI. Free during beta, plans from $29/mo." },
      { property: "og:title", content: "Pricing — Mobivable" },
      { property: "og:description", content: "Pick a credit bucket that matches how aggressively you ship native iOS and Android apps." },
    ],
  }),
});

const tiers: Array<{
  code: string;
  name: string;
  plan: PlanValue;
  monthly: number;
  yearly: number;
  credits: string;
  creditsSub: string;
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
    credits: "6",
    creditsSub: "daily credits",
    freeNote: "Free during public beta",
    features: ["6 AI credits / day", "1 published app", "Native iOS + Android builds", "Community support"],
    cta: "Start Free",
  },
  {
    code: "T-01",
    name: "Starter",
    plan: "starter",
    monthly: 29,
    yearly: 23,
    credits: "120",
    creditsSub: "monthly credits",
    features: ["120 AI credits / month", "5 published apps", "Source code export", "Custom domains", "Email support"],
    cta: "Go Starter",
  },
  {
    code: "T-02",
    name: "Pro",
    plan: "pro",
    monthly: 59,
    yearly: 47,
    credits: "300",
    creditsSub: "monthly credits",
    features: ["300 AI credits / month", "Unlimited published apps", "Priority compile queue", "Advanced AI Studio", "Priority support"],
    highlight: true,
    cta: "Go Pro",
  },
  {
    code: "T-03",
    name: "Scale",
    plan: "scale",
    monthly: 119,
    yearly: 95,
    credits: "700",
    creditsSub: "monthly credits",
    features: ["700 AI credits / month", "Everything in Pro", "Team workspaces (3 seats)", "App analytics", "1:1 onboarding"],
    cta: "Go Scale",
  },
  {
    code: "T-04",
    name: "Business",
    plan: "business",
    monthly: 299,
    yearly: 239,
    credits: "2,000",
    creditsSub: "monthly credits",
    features: ["2,000 AI credits / month", "Unlimited seats", "SSO + audit log", "Dedicated success manager", "SLA & priority builds"],
    cta: "Go Business",
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
              className={`px-5 py-3 transition-colors ${billing === c ? "bg-primary text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c}
              {c === "yearly" && <span className="ml-2 opacity-70">−20%</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 border border-border">
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
              className={`p-8 ${i < tiers.length - 1 ? "lg:border-r border-border" : ""} ${
                t.highlight ? "bg-primary text-background" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-6">
                <span className={`font-mono text-[10px] uppercase tracking-widest ${t.highlight ? "text-background/60" : "text-primary"}`}>
                  {t.code}
                </span>
                {t.highlight && (
                  <span className="font-mono text-[10px] uppercase tracking-widest bg-background text-primary px-2 py-1">
                    Popular
                  </span>
                )}
              </div>
              <h3 className="font-display text-3xl uppercase mb-2">{t.name}</h3>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-display text-5xl">${price}</span>
              </div>
              <p className={`font-mono text-[10px] uppercase tracking-widest mb-6 ${t.highlight ? "text-background/70" : "text-muted-foreground"}`}>
                {note}
              </p>
              <div className={`mb-6 pb-4 border-b ${t.highlight ? "border-background/30" : "border-border"}`}>
                <div className="font-display text-2xl">⚡ {t.credits}</div>
                <div className={`font-mono text-[10px] uppercase tracking-widest ${t.highlight ? "text-background/70" : "text-muted-foreground"}`}>
                  {t.creditsSub}
                </div>
              </div>
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

      <section className="mt-32 border-t border-border pt-20">
        <div className="mb-12 flex items-end justify-between gap-8 flex-wrap">
          <h2 className="font-display text-4xl md:text-5xl uppercase tracking-tight">
            Pricing FAQ
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground max-w-sm">
            Billing, refunds, app limits, and what changes when you switch plans.
          </p>
        </div>
        <Accordion type="single" collapsible className="max-w-3xl">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-border">
              <AccordionTrigger className="text-left font-display text-lg md:text-xl uppercase tracking-tight hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="font-mono text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PageShell>
  );
}
