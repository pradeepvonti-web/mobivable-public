import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/checkout/success")({
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

  // Auto-redirect to dashboard after a short beat so the user sees confirmation.
  useEffect(() => {
    const t = setTimeout(() => navigate({ to: "/dashboard" }), 2500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <PageShell
      eyebrow="STATUS_200"
      title="Subscription Activated"
      intro="Your plan is live. Taking you to your dashboard…"
    >
      <div className="max-w-xl border border-border p-8 space-y-6">
        <p className="font-mono text-sm text-muted uppercase tracking-widest">
          [···] Receipt sent to your email · Redirecting
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
