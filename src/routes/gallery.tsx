import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { ExternalLink, Star, Download } from "lucide-react";

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
  {
    code: "APP-001", name: "Solace", category: "Meditation & Wellness",
    gradient: "from-violet-500/40 via-indigo-400/30 to-purple-600/40",
    emoji: "🧘", rating: "4.8", downloads: "12.4K",
    desc: "Guided meditation with AI-personalized sessions, sleep sounds, and mindfulness journaling.",
    screens: ["Home", "Meditate", "Journal", "Sleep", "Profile"],
    tags: ["iOS", "Android"],
  },
  {
    code: "APP-002", name: "Vault", category: "Crypto Portfolio",
    gradient: "from-slate-700/50 via-zinc-600/40 to-gray-800/50",
    emoji: "🔐", rating: "4.6", downloads: "8.2K",
    desc: "Multi-chain portfolio tracker with real-time alerts, DeFi yield monitoring, and hardware wallet sync.",
    screens: ["Dashboard", "Assets", "Alerts", "DeFi", "Settings"],
    tags: ["iOS", "Android"],
  },
  {
    code: "APP-003", name: "Atlas", category: "Travel Journal",
    gradient: "from-emerald-400/40 via-teal-300/30 to-cyan-500/40",
    emoji: "🗺️", rating: "4.9", downloads: "21.7K",
    desc: "Photo-rich travel log with GPS tagging, trip timelines, and shareable postcards.",
    screens: ["Map", "Trips", "Photos", "Timeline", "Share"],
    tags: ["iOS"],
  },
  {
    code: "APP-004", name: "Forge", category: "Fitness Tracker",
    gradient: "from-orange-500/40 via-amber-400/30 to-red-500/40",
    emoji: "🏋️", rating: "4.7", downloads: "15.3K",
    desc: "Workout builder with exercise library, progress charts, and Apple Health integration.",
    screens: ["Today", "Workouts", "Exercises", "Progress", "Profile"],
    tags: ["iOS", "Android"],
  },
  {
    code: "APP-005", name: "Mercato", category: "Local Marketplace",
    gradient: "from-lime-400/40 via-green-300/30 to-emerald-500/40",
    emoji: "🛒", rating: "4.5", downloads: "6.8K",
    desc: "Neighborhood marketplace for buying and selling locally. Chat, reviews, and secure payments.",
    screens: ["Browse", "Listings", "Chat", "Sell", "Profile"],
    tags: ["Android"],
  },
  {
    code: "APP-006", name: "Lumen", category: "Smart Home",
    gradient: "from-yellow-400/40 via-amber-300/30 to-orange-400/40",
    emoji: "💡", rating: "4.4", downloads: "4.1K",
    desc: "Unified smart home dashboard with scene automation, energy tracking, and voice control.",
    screens: ["Home", "Devices", "Scenes", "Energy", "Settings"],
    tags: ["iOS", "Android"],
  },
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
          <div key={a.code} className="group block rounded-xl border border-border overflow-hidden hover:border-primary/40 transition-all hover:shadow-lg">
            {/* App visual */}
            <div className={`relative aspect-[4/3] bg-gradient-to-br ${a.gradient} flex items-center justify-center`}>
              <span className="text-6xl filter drop-shadow-lg group-hover:scale-110 transition-transform duration-300">{a.emoji}</span>
              <div className="absolute top-3 left-3 font-mono text-[9px] uppercase tracking-widest text-white/60 bg-black/20 backdrop-blur-sm px-2 py-1 rounded-md">
                {a.code}
              </div>
              <div className="absolute top-3 right-3 flex gap-1.5">
                {a.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-mono uppercase tracking-wider text-white/80 bg-black/25 backdrop-blur-sm px-2 py-1 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
              {/* Floating screen pills */}
              <div className="absolute bottom-3 left-3 right-3 flex gap-1 overflow-hidden">
                {a.screens.map(s => (
                  <span key={s} className="text-[8px] font-mono uppercase tracking-wider text-white/70 bg-black/20 backdrop-blur-sm px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            {/* App info */}
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
              <p className="text-xs text-muted-foreground leading-relaxed">{a.desc}</p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Download className="h-3 w-3" />
                  {a.downloads} downloads
                </div>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                >
                  Build similar <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
