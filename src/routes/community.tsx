import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/community")({
  component: CommunityPage,
  head: () => ({
    meta: [
      { title: "Community — Mobivable" },
      { name: "description", content: "Join thousands of builders shipping native apps with Mobivable. Discord, forums, events, and showcases." },
      { property: "og:title", content: "Community — Mobivable" },
      { property: "og:description", content: "Connect with builders shipping mobile apps from chat threads." },
    ],
  }),
});

const channels = [
  { code: "CH-01", name: "Discord", members: "12,408 online", body: "Real-time channels for builders, AI prompt swaps, and live troubleshooting with engineers." },
  { code: "CH-02", name: "Forum", members: "38,210 threads", body: "Long-form discussions, RFCs, and the source of truth for product feedback and feature requests." },
  { code: "CH-03", name: "Build Nights", members: "Weekly · Thursdays", body: "Live coworking sessions where members ship an app end-to-end on a single Zoom call." },
  { code: "CH-04", name: "Office Hours", members: "Bi-weekly", body: "AMA-style calls with the Mobivable engineering team. Bring your hardest prompts and stuck builds." },
];

function CommunityPage() {
  return (
    <PageShell
      eyebrow="Operator Network"
      title="Builders, Online."
      intro="Mobivable is built in public with the people shipping on it. Join the channels keeping the engine running."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
        {channels.map((c) => (
          <a
            key={c.code}
            href="#"
            className="group block p-10 bg-background hover:bg-primary hover:text-background transition-colors"
          >
            <div className="flex items-start justify-between mb-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary group-hover:text-background">
                {c.code}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-background/70">
                {c.members}
              </span>
            </div>
            <h3 className="font-display text-4xl md:text-5xl uppercase tracking-tighter mb-4">{c.name}</h3>
            <p className="text-sm text-muted-foreground group-hover:text-background/80 max-w-[45ch] leading-relaxed mb-8">{c.body}</p>
            <span className="font-mono text-[10px] uppercase tracking-widest group-hover:underline">
              Connect →
            </span>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
