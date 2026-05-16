import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";

const PLAN_VALUES = ["free_beta", "starter", "pro"] as const;
type PlanValue = (typeof PLAN_VALUES)[number];

const PLAN_LABELS: Record<PlanValue, { name: string; tag: string; blurb: string }> = {
  free_beta: { name: "Free Beta", tag: "TIER_00", blurb: "Free forever during public beta. 1 published app." },
  starter: { name: "Starter", tag: "TIER_01", blurb: "$29/mo · 5 published apps, source export, priority compile." },
  pro: { name: "Pro", tag: "TIER_02", blurb: "$99/mo · Unlimited apps, team workspaces, dedicated support." },
};

const searchSchema = z.object({
  plan: z.enum(PLAN_VALUES).catch("free_beta"),
});

export const Route = createFileRoute("/signup")({
  validateSearch: searchSchema,
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Create your account — Mobivable" },
      { name: "description", content: "Sign up and start shipping native apps from a chat thread." },
    ],
  }),
});

function SignupPage() {
  const { plan } = useSearch({ from: "/signup" });
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selected = PLAN_LABELS[plan];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { plan, display_name: displayName },
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      eyebrow={`Access ${selected.tag}`}
      title={`Initialize ${selected.name}`}
      intro={selected.blurb}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Plan picker */}
        <aside className="lg:col-span-5 border border-border p-6">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-4">
            Selected Tier
          </div>
          <div className="space-y-3">
            {PLAN_VALUES.map((p) => {
              const meta = PLAN_LABELS[p];
              const active = p === plan;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => navigate({ to: "/signup", search: { plan: p } })}
                  className={`w-full text-left p-4 border transition-all ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display text-lg uppercase tracking-tighter">{meta.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                      {meta.tag}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{meta.blurb}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted">
            {plan === "free_beta"
              ? "[0] No card required"
              : "[0] You'll confirm billing after account creation"}
          </p>
        </aside>

        {/* Form */}
        <div className="lg:col-span-7 border border-border p-8">
          {sent ? (
            <div>
              <h2 className="font-display text-3xl uppercase tracking-tighter mb-4">
                Check your inbox
              </h2>
              <p className="text-muted leading-relaxed mb-6">
                We sent a confirmation link to <span className="text-foreground">{email}</span>.
                Click it to activate your <span className="text-primary">{selected.name}</span> account.
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-3 border border-border font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="display_name" className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Display Name
                </label>
                <input
                  id="display_name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="email" className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="password" className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
                />
                <p className="mt-2 font-mono text-[10px] text-muted">Min 8 characters</p>
              </div>

              {error && (
                <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 font-mono">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
              >
                {submitting ? "Provisioning…" : `Create ${selected.name} Account`}
              </button>

              <p className="text-center text-sm text-muted">
                Already onboard?{" "}
                <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                  Login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}
