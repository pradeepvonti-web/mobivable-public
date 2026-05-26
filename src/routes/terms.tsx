import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Mobivable" },
      {
        name: "description",
        content:
          "The terms governing your use of the Mobivable platform operated by AksData AI Corp.",
      },
      { property: "og:title", content: "Terms & Conditions — Mobivable" },
      {
        property: "og:description",
        content:
          "Mobivable terms of service: acceptable use, subscriptions, intellectual property, and liability.",
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

function TermsPage() {
  return (
    <PageShell
      eyebrow="Legal · v1.0"
      title="Terms & Conditions"
      intro="These terms govern your access to and use of Mobivable, provided by AksData AI Corp."
    >
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-10">
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <Section title="1. Who You Are Contracting With">
        <p>
          The Mobivable platform and websites (the "Service") are operated by AksData AI Corp
          ("AksData", "we", "us"), trading as Mobivable. By using the Service you are entering into
          a legally binding agreement with AksData AI Corp.
        </p>
      </Section>

      <Section title="2. Acceptance">
        <p>
          By creating an account or otherwise using the Service, you confirm that you have read,
          understood, and agree to be bound by these Terms. If you do not agree, you must not use
          the Service. If you are using the Service on behalf of an organization, you represent
          that you have authority to bind that organization, and "you" refers to both you and the
          organization. Individual users must be of legal age in their jurisdiction.
        </p>
      </Section>

      <Section title="3. The Service">
        <p>
          Mobivable provides AI-assisted tools that allow you to describe, generate, preview, and
          publish mobile applications. Features, AI credits, and limits depend on your plan, as
          described on the pricing page.
        </p>
      </Section>

      <Section title="4. Accounts & Credentials">
        <p>
          You must provide accurate information, keep it up to date, and maintain the
          confidentiality of your account credentials. You are responsible for all activity under
          your account.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You agree not to misuse the Service. You will not, and will not allow others to:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li>Use the Service for any unlawful, fraudulent, deceptive, or harmful purpose.</li>
          <li>Send spam, run phishing schemes, distribute malware, or send unsolicited communications.</li>
          <li>Infringe any intellectual property, privacy, publicity, or other rights.</li>
          <li>Probe, scan, or test the vulnerability of the Service; attempt to breach security or authentication; interfere with or disrupt service to any user, host, or network.</li>
          <li>Scrape, crawl, or extract data from the Service except as expressly permitted.</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Service, or circumvent technical limitations.</li>
          <li>Resell, sublicense, or redistribute the Service outside the rights granted in your plan.</li>
        </ul>
      </Section>

      <Section title="6. AI Outputs & Responsibility">
        <p>
          Mobivable uses generative AI to produce text, code, designs, and other outputs based on
          your prompts. You are responsible for your prompts, for verifying the accuracy and
          suitability of outputs, and for ensuring you have the necessary rights to any input
          content you provide. AI outputs may be inaccurate or incomplete and must not be relied
          upon as professional, legal, financial, medical, or other regulated advice without
          appropriate human review.
        </p>
        <p>
          You must not use the Service to generate or distribute illegal content, non-consensual
          intimate imagery, deepfakes that mislead about identifiable individuals, hate speech,
          malware, or content designed to jailbreak or manipulate AI systems. We may filter,
          refuse, remove, or restrict outputs and content, and may suspend accounts that repeatedly
          violate these rules. We provide a takedown pathway for rights-holders to report
          infringement; repeat infringers will have their accounts terminated.
        </p>
      </Section>

      <Section title="7. Your Content">
        <p>
          You retain ownership of content and inputs you provide and of the apps you generate, to
          the extent permitted by applicable law and any third-party rights. You grant AksData a
          worldwide, non-exclusive, royalty-free license to host, store, reproduce, process, and
          transmit your content solely as necessary to operate, secure, and improve the Service
          (including via third-party AI providers).
        </p>
      </Section>

      <Section title="8. Intellectual Property">
        <p>
          AksData and its licensors retain all right, title, and interest in and to the Service,
          including the platform, software, documentation, branding, and any improvements. Nothing
          in these Terms transfers ownership of our IP to you. We grant you a limited,
          non-exclusive, non-transferable, revocable right to use the Service within the limits of
          your plan.
        </p>
      </Section>

      <Section title="9. Payments, Subscriptions & Taxes">
        <p>
          Our order process is conducted by our online reseller{" "}
          <a href="https://www.paddle.com" className="text-primary underline" target="_blank" rel="noreferrer noopener">
            Paddle.com
          </a>
          . Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer
          service inquiries and handles returns.
        </p>
        <p>
          Payments, billing, tax handling, cancellations, and refund mechanics are governed by the{" "}
          <a href="https://www.paddle.com/legal/checkout-buyer-terms" className="text-primary underline" target="_blank" rel="noreferrer noopener">
            Paddle Buyer Terms
          </a>
          . Subscriptions automatically renew at the end of each billing period until cancelled.
          You can cancel at any time through your account or via{" "}
          <a href="https://paddle.net" className="text-primary underline" target="_blank" rel="noreferrer noopener">paddle.net</a>.
          See our Refund Policy for our money-back guarantee.
        </p>
      </Section>

      <Section title="10. Service Level">
        <p>
          The Service is provided on an "as is" and "as available" basis. We do not guarantee that
          the Service will be uninterrupted, error-free, or free from security breaches. We may
          modify, suspend, or discontinue features at any time. To the maximum extent permitted by
          law, we disclaim all implied warranties, including merchantability, fitness for a
          particular purpose, and non-infringement.
        </p>
      </Section>

      <Section title="11. Suspension & Termination">
        <p>
          We may suspend or terminate your access to the Service at any time, with or without
          notice, for: material breach of these Terms; non-payment; suspected fraud or security
          risk; legal or regulatory requirements; or repeated or serious policy violations.
        </p>
        <p>
          On termination, your right to use the Service ends. We will retain or delete your data as
          described in our Privacy Notice. You may export your project data during any window
          provided by the Service prior to deletion.
        </p>
      </Section>

      <Section title="12. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, our aggregate liability arising out of or related
          to the Service is limited to the fees you paid to us (via Paddle) for the Service in the
          twelve (12) months preceding the event giving rise to the claim. We will not be liable
          for indirect, incidental, special, consequential, exemplary, or punitive damages, or for
          loss of profits, revenue, data, goodwill, or business opportunities.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability for fraud, death or personal injury
          caused by negligence, or any other liability that cannot be excluded under applicable
          law.
        </p>
      </Section>

      <Section title="13. Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless AksData AI Corp from and against any
          claims, damages, and expenses arising out of your content, your use of the Service in
          violation of these Terms, or your violation of any law or third-party right.
        </p>
      </Section>

      <Section title="14. Force Majeure">
        <p>
          Neither party will be liable for any failure or delay in performance caused by events
          beyond its reasonable control, including natural disasters, war, terrorism, civil
          disturbance, labor actions, internet or telecommunications failures, or government
          actions.
        </p>
      </Section>

      <Section title="15. Assignment">
        <p>
          You may not assign these Terms without our prior written consent. We may assign these
          Terms in connection with a merger, acquisition, or sale of assets, or to an affiliate.
        </p>
      </Section>

      <Section title="16. Governing Law & Disputes">
        <p>
          These Terms are governed by the laws of the jurisdiction in which AksData AI Corp is
          incorporated, without regard to conflict-of-laws principles. The courts of that
          jurisdiction will have exclusive jurisdiction over any disputes, except where applicable
          consumer-protection law grants you the right to bring proceedings in your country of
          residence.
        </p>
      </Section>

      <Section title="17. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes will be communicated by
          email or in-product notice. Continued use of the Service after changes take effect
          constitutes acceptance.
        </p>
      </Section>

      <Section title="18. Contact">
        <p>
          AksData AI Corp · legal@mobivable.dev
        </p>
      </Section>
    </PageShell>
  );
}
