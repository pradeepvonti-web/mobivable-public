import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { MessageCircle, Users, Calendar, Headphones, ExternalLink, Github, Twitter, Youtube, ArrowRight } from "lucide-react";
import { toast } from "sonner";

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
  {
    code: "CH-01", name: "Discord", members: "12,408 online", icon: MessageCircle,
    body: "Real-time channels for builders, AI prompt swaps, and live troubleshooting with engineers.",
    color: "bg-indigo-500", hoverColor: "hover:border-indigo-400",
    cta: "Join Discord",
  },
  {
    code: "CH-02", name: "Forum", members: "38,210 threads", icon: Users,
    body: "Long-form discussions, RFCs, and the source of truth for product feedback and feature requests.",
    color: "bg-emerald-500", hoverColor: "hover:border-emerald-400",
    cta: "Browse Forum",
  },
  {
    code: "CH-03", name: "Build Nights", members: "Weekly · Thursdays", icon: Calendar,
    body: "Live coworking sessions where members ship an app end-to-end on a single Zoom call.",
    color: "bg-amber-500", hoverColor: "hover:border-amber-400",
    cta: "RSVP Next Event",
  },
  {
    code: "CH-04", name: "Office Hours", members: "Bi-weekly", icon: Headphones,
    body: "AMA-style calls with the Mobivable engineering team. Bring your hardest prompts and stuck builds.",
    color: "bg-rose-500", hoverColor: "hover:border-rose-400",
    cta: "Register",
  },
];

const socials = [
  { name: "GitHub", icon: Github, handle: "@mobivable", followers: "2.4K stars" },
  { name: "Twitter", icon: Twitter, handle: "@Mobivable", followers: "8.1K followers" },
  { name: "YouTube", icon: Youtube, handle: "Mobivable", followers: "3.2K subs" },
];

const recentActivity = [
  { user: "sarah_builds", action: "shipped Solace (Meditation app) to App Store", time: "2 hours ago" },
  { user: "devKarthik", action: "shared a prompt pattern for e-commerce flows", time: "5 hours ago" },
  { user: "amelia.ui", action: "posted a tutorial: 'Dark Mode in 30 seconds'", time: "8 hours ago" },
  { user: "buildWithJake", action: "completed Build Night #47 — Fitness tracker", time: "1 day ago" },
  { user: "priya_codes", action: "asked about Supabase RLS patterns", time: "1 day ago" },
];

function CommunityPage() {
  const [email, setEmail] = useState("");

  const handleSubscribe = () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email");
      return;
    }
    toast.success("Subscribed! Check your inbox for the welcome email.");
    setEmail("");
  };

  return (
    <PageShell
      eyebrow="Operator Network"
      title="Builders, Online."
      intro="Mobivable is built in public with the people shipping on it. Join the channels keeping the engine running."
    >
      {/* Main channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {channels.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => toast.info(`${c.name} is launching soon! We'll notify you when it's live.`)}
              className={`group text-left rounded-xl border border-border p-8 transition-all hover:shadow-lg ${c.hoverColor}`}
            >
              <div className="flex items-start justify-between mb-6">
                <div className={`h-10 w-10 rounded-lg ${c.color} grid place-items-center`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {c.members}
                </span>
              </div>
              <div className="flex items-start justify-between mb-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.code}</span>
              </div>
              <h3 className="font-display text-3xl uppercase tracking-tighter mb-3 group-hover:text-primary transition-colors">{c.name}</h3>
              <p className="text-sm text-muted-foreground max-w-[45ch] leading-relaxed mb-6">{c.body}</p>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary group-hover:underline">
                {c.cta} <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Social links */}
      <div className="rounded-xl border border-border p-8 mb-8">
        <h3 className="font-display text-xl uppercase tracking-tight mb-6">Follow the Build</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {socials.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toast.info(`Follow us on ${s.name}! Link coming soon.`)}
                className="flex items-center gap-4 rounded-xl border border-border p-4 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="h-10 w-10 rounded-lg bg-muted grid place-items-center group-hover:bg-primary/10">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{s.handle}</p>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{s.followers}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-border p-8 mb-8">
        <h3 className="font-display text-xl uppercase tracking-tight mb-6">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-bold uppercase shrink-0 mt-0.5">
                {a.user[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold text-primary">@{a.user}</span>{" "}
                  <span className="text-muted-foreground">{a.action}</span>
                </p>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap shrink-0">{a.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Newsletter */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-8">
        <div className="max-w-lg">
          <h3 className="font-display text-xl uppercase tracking-tight mb-2">Weekly Build Digest</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Curated prompts, shipped apps, and engineering insights. Every Thursday.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
            />
            <button
              type="button"
              onClick={handleSubscribe}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
