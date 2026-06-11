import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => ({
    meta: [
      { title: "Refund Policy — Mobivable" },
      {
        name: "description",
        content:
          "Mobivable's 30-day money-back guarantee and how to request a refund.",
      },
      { property: "og:title", content: "Refund Policy — Mobivable" },
      {
        property: "og:description",
        content:
          "30-day money-back guarantee on Mobivable subscriptions.",
      },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-2xl uppercase tracking-tight mb-4 text-primary">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed max-w-[75ch]">
        {children}
      </div>
    </section>
  );
}

function RefundPage() {
  return (
    <PageShell
      eyebrow="Legal · v1.0"
      title="Refund Policy"
      intro="AksData AI Corp (operating Mobivable) offers a 30-day money-back guarantee on paid subscriptions. Payments are processed securely by Stripe."
    >
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-10">
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <Section title="1. 30-Day Money-Back Guarantee">
        <p>
          If you are not satisfied with your Mobivable subscription, you may request a full refund
          within <strong>thirty (30) days</strong> of your initial purchase. The guarantee applies
          to first-time purchases of any paid plan.
        </p>
      </Section>

      <Section title="2. How to Request a Refund">
        <p>
          Email <a href="mailto:support@mobivable.dev" className="text-primary underline">support@mobivable.dev</a>{" "}
          from the address on your account and include your order or payment reference. We will
          process eligible refunds through Stripe back to your original payment method.
        </p>
        <p>
          Refunds typically post within 5–10 business days, depending on your bank or card
          provider.
        </p>
      </Section>

      <Section title="3. Renewals & Subscription Cancellations">
        <p>
          You can cancel your subscription at any time from the billing portal accessible in your
          dashboard. Cancellation stops future renewals; your plan remains active until the end of
          the current billing period.
        </p>
        <p>
          Refunds for renewal charges are evaluated on a case-by-case basis, including for
          unintended renewals or where the Service has been substantially unavailable. We will not
          unreasonably withhold approval for such requests.
        </p>
      </Section>

      <Section title="4. Chargebacks">
        <p>
          Before initiating a chargeback with your card issuer, please contact us. Most billing
          issues can be resolved quickly and directly without a chargeback.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>
          AksData AI Corp · <a href="mailto:support@mobivable.dev" className="text-primary underline">support@mobivable.dev</a>
        </p>
      </Section>
    </PageShell>
  );
}
