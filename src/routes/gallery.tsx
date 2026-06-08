import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { ExternalLink, Star, Download } from "lucide-react";
import appsData from "./-gallery.data";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
  head: () => ({
    meta: [
      { title: "Gallery — 50 Real Apps Shipped with Mobivable" },
      { name: "description", content: "Browse 50 real native mobile apps generated end-to-end with Mobivable. From meditation to crypto to surf forecasts — each one started as a sentence." },
      { property: "og:title", content: "Gallery — 50 Real Apps Shipped with Mobivable" },
      { property: "og:description", content: "50 native apps generated with Mobivable, live in the App Stores." },
    ],
  }),
});

type App = {
  code: string; name: string; category: string; rating: string; downloads: string;
  desc: string; screens: string[]; tags: string[];
};

const apps = appsData as App[];

function GalleryPage() {
  return (
    <PageShell
      eyebrow={`Showcase Archive · ${apps.length} Apps`}
      title="Shipped From Chat."
      intro="A live archive of native mobile apps generated end-to-end with Mobivable. Every screenshot below is a real app built from a single prompt."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {apps.map((a) => (
          <div key={a.code} className="group block rounded-xl border border-border overflow-hidden hover:border-primary/40 transition-all hover:shadow-lg bg-card">
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              <img
                src={`/gallery/${a.code.toLowerCase()}.jpg`}
                alt={`${a.name} — ${a.category} mobile app mockup`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 font-mono text-[9px] uppercase tracking-widest text-white bg-black/45 backdrop-blur-sm px-2 py-1 rounded-md">
                {a.code}
              </div>
              <div className="absolute top-3 right-3 flex gap-1.5">
                {a.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-mono uppercase tracking-wider text-white bg-black/45 backdrop-blur-sm px-2 py-1 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex gap-1 overflow-hidden">
                {a.screens.slice(0, 5).map(s => (
                  <span key={s} className="text-[8px] font-mono uppercase tracking-wider text-white bg-black/35 backdrop-blur-sm px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-xl uppercase tracking-tight">{a.name}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{a.category}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {a.rating}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{a.desc}</p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Download className="h-3 w-3" />
                  {a.downloads} downloads
                </div>
                <Link
                  to="/dashboard"
                  search={{ prompt: `Build a ${a.category.toLowerCase()} app called "${a.name}". ${a.desc} Include screens: ${a.screens.join(", ")}. Target platforms: ${a.tags.join(", ")}.` }}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                >
                  Use as template <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
