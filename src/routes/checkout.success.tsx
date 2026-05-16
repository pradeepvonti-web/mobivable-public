import { createFileRoute, Link } from "@tanstack/react-router";
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
  return (
    <PageShell
      eyebrow="STATUS_200"
      title="Subscription Activated"
      intro="Your plan is live. We're provisioning your workspace — you can start chatting your next app into existence."
    >
      <div className="max-w-xl border border-border p-8 space-y-6">
        <p className="font-mono text-sm text-muted uppercase tracking-widest">
          [···] Receipt sent to your email
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/"
            className="px-6 py-3 bg-primary text-background font-display uppercase tracking-wider hover:invert transition-all text-center"
          >
            Start Building
          </Link>
          <Link
            to="/pricing"
            className="px-6 py-3 border border-border font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors text-center"
          >
            View Plans
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
