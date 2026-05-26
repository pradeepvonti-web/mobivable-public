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
          "Mobivable's 30-day money-back guarantee and how to request a refund via Paddle, the merchant of record.",
      },
      { property: "og:title", content: "Refund Policy — Mobivable" },
      {
        property: "og:description",
        content:
          "30-day money-back guarantee on Mobivable subscriptions. Refunds are handled by Paddle at paddle.net.",
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
      intro="AksData AI Corp (operating Mobivable) offers a 30-day money-back guarantee on paid subscriptions. Refunds are processed by Paddle, our Merchant of Record."
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
          Our order process is conducted by our online reseller{" "}
          <a href="https://www.paddle.com" className="text-primary underline" target="_blank" rel="noreferrer noopener">
            Paddle.com
          </a>
          , who is the Merchant of Record for all our orders. To request a refund:
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-1.5">
          <li>
            Visit{" "}
            <a href="https://paddle.net" className="text-primary underline" target="_blank" rel="noreferrer noopener">
              paddle.net
            </a>{" "}
            and look up your order using the email address you used at checkout.
          </li>
          <li>Select the order and request a refund. Paddle may ask for a brief reason.</li>
          <li>
            Alternatively, email <a href="mailto:support@mobivable.dev" className="text-primary underline">support@mobivable.dev</a>{" "}
            and our team will work with Paddle to process your refund.
          </li>
        </ol>
        <p>
          Refunds are typically processed back to your original payment method within 5–10 business
          days, depending on your bank or card provider.
        </p>
      </Section>

      <Section title="3. Renewals & Subscription Cancellations">
        <p>
          You can cancel your subscription at any time through your account settings or via{" "}
          <a href="https://paddle.net" className="text-primary underline" target="_blank" rel="noreferrer noopener">paddle.net</a>.
          Cancellation stops future renewals; your plan remains active until the end of the current
          billing period.
        </p>
        <p>
          Refunds for renewal charges are evaluated by Paddle on a case-by-case basis in line with
          the{" "}
          <a href="https://www.paddle.com/legal/refund-policy" className="text-primary underline" target="_blank" rel="noreferrer noopener">
            Paddle Refund Policy
          </a>
          , including for unintended renewals or where the Service has been substantially
          unavailable. We will not unreasonably withhold approval for such requests.
        </p>
      </Section>

      <Section title="4. Chargebacks">
        <p>
          Before initiating a chargeback with your card issuer, please contact us or Paddle. Most
          billing issues can be resolved quickly and directly without a chargeback.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>
          AksData AI Corp · <a href="mailto:support@mobivable.dev" className="text-primary underline">support@mobivable.dev</a>
          <br />
          For payment and refund inquiries:{" "}
          <a href="https://paddle.net" className="text-primary underline" target="_blank" rel="noreferrer noopener">paddle.net</a>
        </p>
      </Section>
    </PageShell>
  );
}
