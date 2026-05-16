import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
  head: () => ({
    meta: [
      { title: "Gallery — Mobivable" },
      { name: "description", content: "Real apps shipped to the App Store and Google Play by Mobivable users. Browse the showcase." },
      { property: "og:title", content: "Gallery — Mobivable" },
      { property: "og:description", content: "Native apps generated end-to-end by Mobivable, live in the App Stores." },
    ],
  }),
});

const apps = [
  { code: "APP-001", name: "Solace", category: "Meditation", color: "from-primary/40 to-transparent" },
  { code: "APP-002", name: "Vault", category: "Crypto Wallet", color: "from-foreground/30 to-transparent" },
  { code: "APP-003", name: "Atlas", category: "Travel Log", color: "from-primary/30 to-transparent" },
  { code: "APP-004", name: "Forge", category: "Fitness", color: "from-foreground/20 to-transparent" },
  { code: "APP-005", name: "Mercato", category: "Marketplace", color: "from-primary/50 to-transparent" },
  { code: "APP-006", name: "Lumen", category: "Smart Home", color: "from-foreground/25 to-transparent" },
];

function GalleryPage() {
  return (
    <PageShell
      eyebrow="Showcase Archive"
      title="Shipped From Chat."
      intro="A live archive of native mobile apps generated end-to-end with Mobivable. Each one started as a sentence."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {apps.map((a) => (
          <a key={a.code} href="#" className="group block">
            <div className={`relative aspect-[3/4] border border-border rounded-sm overflow-hidden bg-gradient-to-br ${a.color} bg-card group-hover:border-primary transition-colors`}>
              <div className="absolute inset-0 flex items-end p-6">
                <span className="font-display text-5xl uppercase tracking-tighter text-foreground">
                  {a.name}
                </span>
              </div>
              <div className="absolute top-4 left-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {a.code}
              </div>
              <div className="absolute top-4 right-4 size-2 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{a.category}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
                View →
              </span>
            </div>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
