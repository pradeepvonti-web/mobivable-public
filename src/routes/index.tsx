import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronDown, Sparkles, Smartphone, Apple, Palette, Eye, Database,
  KeyRound, CreditCard, MonitorPlay, Rocket, Github, Package,
} from "lucide-react";
import featureBackend from "@/assets/feature-backend.jpg";
import featureNative from "@/assets/feature-native.jpg";
import { SiteNav } from "@/components/SiteNav";
import { Hero3D } from "@/components/Hero3D";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Mobivable — Chat your mobile app into the App Stores" },
      {
        name: "description",
        content:
          "Mobivable democratizes mobile app creation with AI. Go from idea to App Store and Google Play in minutes — just by chatting.",
      },
      { property: "og:title", content: "Mobivable — AI no-code mobile app builder" },
      {
        property: "og:description",
        content:
          "Describe your app. Mobivable's AI ships it to the App Store and Google Play in minutes.",
      },
    ],
  }),
});

function FaqItem({ question, answer, isLast }: { question: string; answer: string; isLast?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`p-8 ${isLast ? "" : "border-b border-border"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-expanded={open}
      >
        <span className="font-display text-xl uppercase tracking-tighter">{question}</span>
        <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-[70ch]">{answer}</p>
      )}
    </div>
  );
}

function Index() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  return (
    <div className="min-h-screen bg-background text-foreground font-body selection:bg-primary selection:text-background">
      <SiteNav />

      {/* Hero */}
      <header id="engine" className="relative pt-20 pb-32 border-b border-border overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-primary" />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-primary" />
        </div>

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 z-10 animate-reveal">
            <div className="inline-block px-2 py-1 border border-primary text-primary text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
              AI Development Protocol v4.0
            </div>
            <h1 className="font-display text-7xl md:text-9xl uppercase leading-[0.85] tracking-tighter text-balance mb-8">
              Chat. <span className="text-primary">Ship.</span>
              <br />
              Dominate.
            </h1>
            <p className="text-xl text-muted-foreground max-w-[45ch] text-pretty leading-relaxed mb-10">
              Democratize mobile app creation with AI. Transform raw ideas into native iOS and
              Android binaries through a single conversational thread.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <Link to="/dashboard" className="px-8 py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all inline-block">
                  Start Generating
                </Link>
                <span className="text-[10px] font-mono text-muted-foreground uppercase text-center mt-2">
                  Free during beta
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative animate-reveal [animation-delay:200ms]">
            <div className="relative bg-card/40 border border-border p-4 rounded-xl backdrop-blur-sm">
              <div className="space-y-4 font-mono text-xs">
                <div className="p-3 bg-foreground/5 border border-foreground/10 rounded-lg text-primary">
                  <span className="opacity-50">USR:</span> Build a luxury real estate app with high-res
                  galleries and dark mode.
                </div>
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <span className="text-primary">SYS:</span> Compiling UI components... Injecting
                  gallery modules... App Store metadata generated.
                </div>
              </div>
              <div className="mt-6 relative group">
                <img
                  src={appPreview}
                  alt="Live preview of a luxury real estate app generated by Mobivable"
                  width={1080}
                  height={1920}
                  className="w-full aspect-[9/16] object-cover rounded-lg outline outline-1 -outline-offset-1 outline-foreground/10 group-hover:outline-primary/50 transition-all"
                />
                <span className="absolute bottom-3 left-3 text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/70 bg-background/60 px-2 py-1 rounded">
                  Live Preview: RealState_App_v1
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Process */}
      <section id="process" className="py-24 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 border border-border">
            {[
              { n: "01", t: "Describe", d: "Converse with our LLM-backed architect. Define features, styling, and logic in plain English." },
              { n: "02", t: "Refine", d: "Mobivable generates high-fidelity screens instantly. Tweak layouts and branding in the real-time preview." },
              { n: "03", t: "Launch", d: "One-click submission to App Store and Google Play. We handle the binaries, screenshots, and certification." },
            ].map((s, i) => (
              <div
                key={s.n}
                className={`p-8 ${i < 2 ? "md:border-r border-border" : ""} animate-reveal`}
                style={{ animationDelay: `${300 + i * 100}ms` }}
              >
                <span className="font-display text-4xl text-primary mb-4 block">{s.n}</span>
                <h3 className="font-display text-2xl uppercase mb-3">{s.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Infrastructure */}
      <section id="infrastructure" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 flex justify-between items-end border-b border-border pb-8">
            <h2 className="font-display text-5xl uppercase tracking-tighter">Core Infrastructure</h2>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
              Status: <span className="text-primary">Operational</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="group">
              <img
                src={featureBackend}
                alt="Automated backend generation visualized as code nodes"
                width={1200}
                height={800}
                loading="lazy"
                className="w-full aspect-video object-cover border border-border rounded-sm mb-6 group-hover:border-primary/40 transition-colors"
              />
              <h4 className="font-display text-xl uppercase mb-2">Self-Healing Logic</h4>
              <p className="text-sm text-muted-foreground max-w-[50ch]">
                AI doesn't just build the UI; it scaffolds your database, authentication, and API
                endpoints automatically.
              </p>
            </div>
            <div className="group">
              <img
                src={featureNative}
                alt="App Store published badge close up"
                width={1200}
                height={800}
                loading="lazy"
                className="w-full aspect-video object-cover border border-border rounded-sm mb-6 group-hover:border-primary/40 transition-colors"
              />
              <h4 className="font-display text-xl uppercase mb-2">Native Performance</h4>
              <p className="text-sm text-muted-foreground max-w-[50ch]">
                No wrappers. No lag. Mobivable compiles to Swift and Kotlin for true native 120fps
                fluid performance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Matrix — all features */}
      <section id="capabilities" className="py-24 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 flex justify-between items-end border-b border-border pb-8">
            <h2 className="font-display text-5xl uppercase tracking-tighter">Capabilities Matrix</h2>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
              12 Modules · Live
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-border">
            {[
              { icon: Sparkles, code: "MOD_01", title: "AI App Generation", desc: "Describe your app in plain English. Mobivable generates a functional React Native mobile app end to end." },
              { icon: Smartphone, code: "MOD_02", title: "iOS + Android", desc: "Cross-platform output. One prompt builds for both App Store and Google Play simultaneously." },
              { icon: Apple, code: "MOD_03", title: "Native Mobile Apps", desc: "True native binaries via Expo/React Native — ready for App Store and Google Play deployment." },
              { icon: Palette, code: "MOD_04", title: "Design, Branding & Assets", desc: "Generates UI, branding, mockups, app icons, logos, illustrations, and marketing assets." },
              { icon: Eye, code: "MOD_05", title: "Live Preview & Testing", desc: "Watch the app update in real time on a device-accurate preview as you iterate via chat." },
              { icon: Database, code: "MOD_06", title: "Backend Support", desc: "Managed backend: PostgreSQL database, storage, authentication, and auto-wired API keys." },
              { icon: KeyRound, code: "MOD_07", title: "Authentication", desc: "User accounts plus Google and Apple sign-in — provisioned with one toggle." },
              { icon: CreditCard, code: "MOD_08", title: "Monetization", desc: "Subscriptions, in-app purchases, trials, upgrades — plus revenue and churn analytics." },
              { icon: MonitorPlay, code: "MOD_09", title: "AdMob Integration", desc: "One-click Google AdMob: banner, interstitial, and rewarded ad units pre-wired." },
              { icon: Rocket, code: "MOD_10", title: "One-Click Deployment", desc: "Publishes to App Store and Google Play. Auto-generates store metadata, screenshots, and docs." },
              { icon: Github, code: "MOD_11", title: "GitHub Integration", desc: "Sync your generated project to a GitHub repo for version control and team collaboration." },
              { icon: Package, code: "MOD_12", title: "APK / IPA Builder", desc: "Build signed APK and IPA artifacts. Test on real devices before pushing to the stores." },
            ].map((c, i, arr) => (
              <div
                key={c.code}
                className={`p-8 ${
                  (i + 1) % 3 !== 0 ? "lg:border-r" : ""
                } ${(i + 1) % 2 !== 0 ? "sm:max-lg:border-r" : ""} ${
                  i < arr.length - (arr.length % 3 || 3) ? "lg:border-b" : ""
                } ${i < arr.length - 2 ? "border-b sm:max-lg:border-b" : ""} border-border group hover:bg-primary/[0.03] transition-colors`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="h-10 w-10 grid place-items-center border border-primary/30 text-primary group-hover:border-primary group-hover:bg-primary/10 transition-colors">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.code}</span>
                </div>
                <h4 className="font-display text-xl uppercase tracking-tight mb-2">{c.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[40ch]">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-10 flex flex-col md:flex-row justify-between md:items-end gap-6 border-b border-border pb-8">
            <h2 className="font-display text-5xl uppercase tracking-tighter">Access Tiers</h2>
            <div className="flex items-center gap-4">
              <div className="inline-flex border border-border font-mono text-[10px] uppercase tracking-widest" role="tablist" aria-label="Billing cadence">
                {(["monthly", "yearly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={billing === c}
                    onClick={() => setBilling(c)}
                    className={`px-4 py-2 transition-colors ${billing === c ? "bg-primary text-background" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {c}
                    {c === "yearly" && <span className="ml-2 opacity-70">−20%</span>}
                  </button>
                ))}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest hidden md:block">
                Pricing Matrix v1.0
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 border border-border">
            {([
              {
                plan: "free_beta" as const,
                name: "Free Beta",
                tag: "TIER_00",
                monthly: 0,
                yearly: 0,
                cadence: "/ forever",
                credits: "6 daily credits (35/mo cap)",
                blurb: "Kick the tires during the public beta.",
                cta: "Start Building",
                featured: false,
                features: [
                  "1 published app",
                  "6 AI credits / day",
                  "Native iOS + Android builds",
                  "Community support",
                ],
              },
              {
                plan: "starter" as const,
                name: "Starter",
                tag: "TIER_01",
                monthly: 29,
                yearly: 23,
                cadence: billing === "yearly" ? "/ mo billed yearly" : "/ month",
                credits: "120 monthly credits",
                blurb: "For solo founders shipping a small portfolio.",
                cta: "Go Starter",
                featured: false,
                features: [
                  "5 published apps",
                  "120 AI credits / month",
                  "Source code export",
                  "Custom domains",
                  "Email support",
                ],
              },
              {
                plan: "pro" as const,
                name: "Pro",
                tag: "TIER_02",
                monthly: 59,
                yearly: 47,
                cadence: billing === "yearly" ? "/ mo billed yearly" : "/ month",
                credits: "300 monthly credits",
                blurb: "For operators iterating daily on live apps.",
                cta: "Go Pro",
                featured: true,
                features: [
                  "Unlimited published apps",
                  "300 AI credits / month",
                  "Priority compile queue",
                  "Advanced analytics",
                  "Email support",
                ],
              },
              {
                plan: "scale" as const,
                name: "Scale",
                tag: "TIER_03",
                monthly: 119,
                yearly: 95,
                cadence: billing === "yearly" ? "/ mo billed yearly" : "/ month",
                credits: "700 monthly credits",
                blurb: "For studios shipping multiple apps in parallel.",
                cta: "Go Scale",
                featured: false,
                features: [
                  "Unlimited published apps",
                  "700 AI credits / month",
                  "Priority compile queue",
                  "Team workspaces",
                  "Priority support",
                ],
              },
              {
                plan: "business" as const,
                name: "Business",
                tag: "TIER_04",
                monthly: 299,
                yearly: 239,
                cadence: billing === "yearly" ? "/ mo billed yearly" : "/ month",
                credits: "2,000 monthly credits",
                blurb: "For agencies and teams at production scale.",
                cta: "Go Business",
                featured: false,
                features: [
                  "Unlimited published apps",
                  "2,000 AI credits / month",
                  "SSO + team seats",
                  "Advanced analytics",
                  "Dedicated support",
                ],
              },
            ]).map((p, i, arr) => (
              <div
                key={p.tag}
                className={`p-8 flex flex-col ${i < arr.length - 1 ? "lg:border-r border-border" : ""} ${p.featured ? "bg-primary/5 relative" : ""}`}
              >
                {p.featured && (
                  <span className="absolute top-0 right-0 bg-primary text-background font-mono text-[10px] uppercase tracking-widest px-3 py-1">
                    Most Picked
                  </span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary mb-4">{p.tag}</span>
                <h3 className="font-display text-3xl uppercase tracking-tighter mb-2">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-[35ch]">{p.blurb}</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-display text-5xl">${billing === "yearly" ? p.yearly : p.monthly}</span>
                  <span className="font-mono text-xs text-muted-foreground uppercase">{p.cadence}</span>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-8">⚡ {p.credits}</div>
                <ul className="space-y-3 mb-10 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <span className="text-primary font-mono mt-0.5">+</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.plan === "free_beta" ? (
                  <Link
                    to="/signup"
                    search={{ plan: p.plan }}
                    className={`block text-center w-full py-4 font-display text-base uppercase tracking-wider transition-all ${
                      p.featured
                        ? "bg-primary text-background hover:invert"
                        : "border border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {p.cta}
                  </Link>
                ) : (
                  <Link
                    to="/checkout"
                    search={{ plan: p.plan, cadence: billing }}
                    className={`block text-center w-full py-4 font-display text-base uppercase tracking-wider transition-all ${
                      p.featured
                        ? "bg-primary text-background hover:invert"
                        : "border border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {p.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs font-mono text-muted-foreground uppercase tracking-widest">
            1 credit ≈ 1 AI chat turn. Image generation and heavy ops may cost more. Credits reset every billing cycle.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 flex justify-between items-end border-b border-border pb-8">
            <h2 className="font-display text-5xl uppercase tracking-tighter">Operator Log</h2>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
              Verified Builders
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                code: "USR-0891",
                quote: "I described a crypto wallet app in three sentences. Twenty minutes later I had a TestFlight build. This is absurd.",
                author: "Maya Chen",
                role: "Indie Hacker",
              },
              {
                code: "USR-1044",
                quote: "We replaced a six-month agency timeline with a single afternoon. The output was production-grade Swift.",
                author: "James Okoro",
                role: "CTO, Baseline",
              },
              {
                code: "USR-1202",
                quote: "I don't know how to code. I shipped my meditation app to the App Store last week. That's the whole review.",
                author: "Sofia Reyes",
                role: "Solo Founder",
              },
            ].map((t) => (
              <div key={t.code} className="border border-border p-8 flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary mb-6">{t.code}</span>
                <p className="text-sm leading-relaxed text-foreground mb-8 flex-1">"{t.quote}"</p>
                <div>
                  <div className="font-display text-lg uppercase">{t.author}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 flex justify-between items-end border-b border-border pb-8">
            <h2 className="font-display text-5xl uppercase tracking-tighter">Signal Clarity</h2>
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
              Common Queries
            </div>
          </div>
          <div className="border border-border">
            <FaqItem
              question="Do I need to know how to code?"
              answer="No. Mobivable is designed for builders who think in products, not syntax. You describe what you want in plain language, and the AI architect generates native iOS and Android binaries. Developers can still drop into the generated source if they want to extend."
            />
            <FaqItem
              question="What does 'native' actually mean here?"
              answer="It means Swift for iOS and Kotlin for Android — not webviews, not wrappers, not cross-platform abstractions. The AI compiles to platform-native code so your app runs at 120fps with full access to camera, push, biometrics, and every other OS capability."
            />
            <FaqItem
              question="How do App Store submissions work?"
              answer="You click one button. Mobivable handles certificates, screenshots, metadata, and the actual upload to App Store Connect and Google Play Console. You track the review status in the same dashboard where you built the app."
            />
            <FaqItem
              question="Can I export the source code?"
              answer="Yes. Every build includes the full generated project — Xcode workspace, Android Studio project, and backend scaffold. You own everything."
            />
            <FaqItem
              question="How do AI credits work?"
              answer="Every AI action — a chat turn, an image generation, a research pass, a code generation — consumes credits from your balance. Free Beta gets 6 credits per day (capped at 35/month). Paid plans get a monthly allowance: Starter 120, Pro 300, Scale 700, Business 2,000. Credits reset on your billing cycle. 1 credit ≈ 1 chat turn; image and heavy ops may cost 2–3."
            />
            <FaqItem
              question="Is there a free tier?"
              answer="Yes. Free Beta is free forever during the public beta. It includes 1 published app, 6 daily AI credits, and community support. When we leave beta, existing free users keep their apps running."
              isLast
            />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="bg-primary text-background py-24 px-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 font-display text-[20vw] leading-none opacity-10 pointer-events-none translate-x-1/4 -translate-y-1/4">
          SHIP
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <h2 className="font-display text-6xl md:text-8xl uppercase tracking-tighter leading-none mb-12">
            From idea to <br />
            App Store{" "}
            <span className="underline decoration-4 underline-offset-8">today</span>.
          </h2>
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <Link to="/dashboard" className="px-12 py-6 bg-background text-primary font-display text-2xl uppercase hover:scale-105 transition-transform inline-block">
              Initialize Build
            </Link>
            <div className="font-mono text-xs uppercase tracking-widest text-background/80">
              [0] No Credit Card Required <br />
              [1] 6 Free AI Credits / Day <br />
              [2] Native iOS + Android Output
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
