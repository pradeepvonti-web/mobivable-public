import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/blog")({
  component: BlogPage,
  head: () => ({
    meta: [
      { title: "Blog — Mobivable" },
      { name: "description", content: "Field notes on AI-native app development, the future of no-code, and Mobivable engineering deep dives." },
      { property: "og:title", content: "Blog — Mobivable" },
      { property: "og:description", content: "Essays, changelogs, and field notes from the Mobivable team." },
    ],
  }),
});

const posts = [
  { code: "LOG-014", date: "2026.05.10", title: "Compiling a Conversation: The v4.0 Engine", excerpt: "How we rebuilt the planner to produce native Swift and Kotlin in a single pass instead of generating intermediate representations." },
  { code: "LOG-013", date: "2026.04.22", title: "Why We Killed Drag-and-Drop", excerpt: "Visual builders capped at the limits of their component library. Language doesn't. A note on why prompts beat palettes." },
  { code: "LOG-012", date: "2026.04.01", title: "Submission Pipeline, Demystified", excerpt: "What actually happens between 'Initialize Build' and your app appearing in TestFlight. Every step, no hand-waving." },
  { code: "LOG-011", date: "2026.03.18", title: "The Case for Native at the Edge", excerpt: "Why we compile to platform binaries instead of wrapping a webview — and the 120fps benchmarks to back it up." },
];

function BlogPage() {
  return (
    <PageShell
      eyebrow="Field Notes"
      title="Dispatch from the Engine Room."
      intro="Engineering deep dives, product changelogs, and unfiltered thinking from the team building Mobivable."
    >
      <div className="border-t border-border">
        {posts.map((p) => (
          <a
            key={p.code}
            href="#"
            className="group block border-b border-border py-10 hover:bg-card transition-colors"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-baseline px-2">
              <div className="md:col-span-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                <div className="text-primary">{p.code}</div>
                <div>{p.date}</div>
              </div>
              <div className="md:col-span-7">
                <h2 className="font-display text-3xl md:text-4xl uppercase tracking-tighter group-hover:text-primary transition-colors mb-2">
                  {p.title}
                </h2>
                <p className="text-sm text-muted max-w-[60ch] leading-relaxed">{p.excerpt}</p>
              </div>
              <div className="md:col-span-3 md:text-right font-mono text-[10px] uppercase tracking-widest text-muted group-hover:text-primary">
                Read entry →
              </div>
            </div>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
