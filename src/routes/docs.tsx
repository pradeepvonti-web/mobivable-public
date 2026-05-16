import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Docs — Mobivable" },
      { name: "description", content: "Learn how to ship a native mobile app to the App Store and Google Play with Mobivable's AI engine." },
      { property: "og:title", content: "Docs — Mobivable" },
      { property: "og:description", content: "Guides, references, and protocols for building native apps with Mobivable." },
    ],
  }),
});

const sections = [
  { code: "01", title: "Quickstart", body: "Spin up your first AI-generated app in under 5 minutes. Auth, database, and a publishable build — all from one prompt." },
  { code: "02", title: "Prompting Patterns", body: "How to phrase intent so the AI architect generates clean UI flows, data models, and integrations on the first try." },
  { code: "03", title: "Native Modules", body: "Camera, push notifications, biometrics, location. Drop in capabilities by name and watch the binaries adapt." },
  { code: "04", title: "Submission Pipeline", body: "Certificates, screenshots, App Store Connect metadata — automated. Track each binary through review." },
  { code: "05", title: "API Reference", body: "REST endpoints and CLI commands for advanced workflows, CI/CD integration, and team deployments." },
  { code: "06", title: "Migration Guides", body: "Move existing Expo, Flutter, or native projects into Mobivable without losing your existing user base." },
];

function DocsPage() {
  return (
    <PageShell
      eyebrow="Developer Documentation"
      title="The Mobivable Manual"
      intro="Everything you need to operate the AI development protocol — from first prompt to App Store binary."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-border">
        {sections.map((s, i) => (
          <a
            key={s.code}
            href="#"
            className={`group p-8 border-border hover:bg-primary hover:text-background transition-colors ${
              i % 3 !== 2 ? "lg:border-r" : ""
            } ${i % 2 !== 1 ? "md:border-r lg:border-r" : ""} ${
              i < sections.length - (sections.length % 3 || 3) ? "border-b" : ""
            }`}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary group-hover:text-background block mb-4">
              {s.code}
            </span>
            <h3 className="font-display text-2xl uppercase mb-3">{s.title}</h3>
            <p className="text-sm text-muted group-hover:text-background/80 leading-relaxed">{s.body}</p>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
