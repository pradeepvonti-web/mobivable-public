import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Notice — Mobivable" },
      {
        name: "description",
        content:
          "How AksData AI Corp collects, uses, shares, and protects personal data on the Mobivable platform.",
      },
      { property: "og:title", content: "Privacy Notice — Mobivable" },
      {
        property: "og:description",
        content:
          "Mobivable's privacy notice: data categories, purposes, retention, sharing, and your rights.",
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

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Legal · v1.0"
      title="Privacy Notice"
      intro="AksData AI Corp (operating Mobivable) is committed to protecting personal data. This notice explains what we collect, why, how we use it, and your rights."
    >
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-10">
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <Section title="1. Who We Are">
        <p>
          AksData AI Corp ("AksData", "we", "us", "our") is the data controller for personal data
          processed through the Mobivable platform and websites (the "Service"). If you have any
          questions about this notice or our handling of your data, contact us at the email address
          listed in the Contact section below.
        </p>
      </Section>

      <Section title="2. Categories of Personal Data We Collect">
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><strong>Account data</strong>: name, email, password hash, profile image.</li>
          <li><strong>Authentication data</strong>: login credentials, OAuth identifiers (Google, Apple), session tokens.</li>
          <li><strong>Project content</strong>: prompts, generated app schemas, uploaded assets, and any data you store via Mobivable.</li>
          <li><strong>Usage & telemetry</strong>: features used, page views, AI credit consumption, error reports.</li>
          <li><strong>Device & network data</strong>: IP address, browser type, operating system, device identifiers.</li>
          <li><strong>Support communications</strong>: messages you send to support and our responses.</li>
          <li><strong>Billing metadata</strong>: subscription tier, plan history. Payment card details are collected directly by Stripe and are never seen or stored by us.</li>
        </ul>
      </Section>

      <Section title="3. Purposes & Legal Basis">
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><strong>Provide the Service</strong> (performance of contract): account creation, app generation, hosting previews, builds, and deployments.</li>
          <li><strong>Security & fraud prevention</strong> (legitimate interests / legal obligation): detect abuse, prevent unauthorized access.</li>
          <li><strong>Customer support</strong> (performance of contract): respond to your inquiries.</li>
          <li><strong>Service improvement & analytics</strong> (legitimate interests): understand usage patterns and improve features.</li>
          <li><strong>Marketing communications</strong> (consent, where required): product updates and offers. You can unsubscribe at any time.</li>
          <li><strong>Legal compliance</strong> (legal obligation): tax, accounting, and regulatory requirements.</li>
        </ul>
      </Section>

      <Section title="4. How We Share Your Data">
        <p>We share personal data with the following categories of recipients only as necessary:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><strong>Stripe, Inc.</strong> — our payment processor. Stripe handles checkout, subscription management, payment processing, tax calculation, and invoicing. See <a href="https://stripe.com/privacy" className="text-primary underline" target="_blank" rel="noreferrer noopener">Stripe's Privacy Policy</a>.</li>
          <li><strong>Cloud infrastructure providers</strong>: hosting, databases, file storage, and CDN.</li>
          <li><strong>AI model providers</strong>: large-language-model and image-generation APIs used to process your prompts.</li>
          <li><strong>Analytics & error monitoring providers</strong>: aggregated usage and error reporting.</li>
          <li><strong>Support tooling providers</strong>: ticketing and communications systems.</li>
          <li><strong>Professional advisers</strong>: legal, accounting, and audit professionals under confidentiality.</li>
          <li><strong>Authorities</strong>: where required by law, court order, or to protect rights and safety.</li>
        </ul>
        <p>We do not sell your personal data.</p>
      </Section>

      <Section title="5. International Transfers">
        <p>
          We and our processors may transfer data outside your country of residence, including to
          the United States and the European Economic Area. Where applicable, transfers are
          protected by Standard Contractual Clauses, adequacy decisions, or equivalent safeguards.
        </p>
      </Section>

      <Section title="6. Data Retention">
        <p>
          We retain personal data only as long as needed to provide the Service, comply with legal
          obligations, resolve disputes, and enforce our agreements. Account and project data is
          retained while your account is active and deleted or anonymized within a reasonable
          period after account closure, unless we are required to retain it longer (e.g., for tax
          records).
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>
          Depending on your jurisdiction, you may have the following rights: access, rectification,
          erasure, restriction of processing, data portability, objection to processing, withdrawal
          of consent, and the right to lodge a complaint with your local supervisory authority. We
          respond to verified requests within the period required by applicable law (e.g., one
          month under GDPR).
        </p>
        <p>To exercise your rights, contact us using the details in the Contact section.</p>
      </Section>

      <Section title="8. Security">
        <p>
          We implement appropriate technical and organizational measures including encryption in
          transit (TLS), encryption at rest, role-based access controls, security logging, and
          regular reviews. No method of transmission or storage is fully secure; we cannot
          guarantee absolute security.
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          We use strictly necessary cookies for authentication and session management, and
          analytics cookies to understand usage. You can manage cookie preferences through your
          browser settings. Disabling necessary cookies may prevent parts of the Service from
          functioning.
        </p>
      </Section>

      <Section title="10. Children">
        <p>The Service is not directed to children under 16, and we do not knowingly collect data from them.</p>
      </Section>

      <Section title="11. Changes to This Notice">
        <p>
          We may update this notice from time to time. Material changes will be communicated by
          email or in-product notice. The "Last updated" date at the top reflects the latest
          revision.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          AksData AI Corp · privacy@mobivable.dev
        </p>
      </Section>
    </PageShell>
  );
}
