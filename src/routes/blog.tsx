import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ChevronDown, Calendar, Clock, Tag } from "lucide-react";

export const Route = createFileRoute("/blog")({
  component: BlogPage,
  head: () => ({
    meta: [
      { title: "Blog — Mobivable" },
      { name: "description", content: "Field notes on AI-native app development, the future of no-code, and Mobivable engineering deep dives." },
      { property: "og:title", content: "Blog — Mobivable" },
      { property: "og:description", content: "Essays, changelogs, and field notes from the Mobivable team." },
      { property: "og:url", content: "https://mobivable.dev/blog" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://mobivable.dev/blog" }],
  }),
});

const posts = [
  {
    code: "LOG-014", date: "2026.05.10", readTime: "8 min",
    title: "Compiling a Conversation: The v4.0 Engine",
    excerpt: "How we rebuilt the planner to produce native Swift and Kotlin in a single pass instead of generating intermediate representations.",
    tags: ["Engineering", "Architecture"],
    body: `The v4.0 engine represents our biggest architectural shift since launch. Previous versions would generate a React Native scaffold, then transpile portions to native code during the export step. This introduced subtle bugs — layout inconsistencies, missing native module bindings, and memory leaks from bridge overhead.

**The new approach:** We now generate a complete app schema from the conversation in a single pass. The schema is a platform-agnostic JSON AST that maps directly to native components. When you hit Export, the compiler walks this AST and emits platform-specific code — SwiftUI for iOS, Jetpack Compose for Android — without any intermediate React Native layer.

**Results:**
- 3x faster export times
- 40% smaller binary sizes
- Zero bridge-related crashes in production builds
- Native animations at 120fps on ProMotion displays

The multi-agent pipeline (Product Manager → UI/UX → Frontend → QA) remains the same, but each agent now contributes to the shared schema instead of generating code independently. This eliminates the "merge conflicts" that occasionally caused agents to overwrite each other's work.`,
  },
  {
    code: "LOG-013", date: "2026.04.22", readTime: "6 min",
    title: "Why We Killed Drag-and-Drop",
    excerpt: "Visual builders capped at the limits of their component library. Language doesn't. A note on why prompts beat palettes.",
    tags: ["Product", "Philosophy"],
    body: `Every no-code tool eventually hits the same wall: the component library becomes the ceiling. Need a custom chart? Build a plugin. Want a non-standard navigation pattern? Fork the framework. Drag-and-drop is intuitive until it isn't — and then it's actively hostile.

**The core insight:** Natural language has infinite expressiveness. When you tell Mobivable "add a radial progress ring that fills based on daily calorie intake, with the remaining count in the center", you get exactly that. No hunting through component panels. No CSS overrides. No compromise.

We still provide a visual preview — it's essential for spatial reasoning. But the input mechanism is conversation, not cursor. This distinction matters because it means:

1. **No component library limits** — if you can describe it, we can generate it
2. **No learning curve** — you already know how to talk
3. **No vendor lock-in** — the output is standard React Native / Expo code

The irony is that removing the visual builder made the platform more visual. With drag-and-drop, users spent 80% of their time configuring components. With prompts, they spend 80% of their time looking at the preview and iterating on what they see.`,
  },
  {
    code: "LOG-012", date: "2026.04.01", readTime: "10 min",
    title: "Submission Pipeline, Demystified",
    excerpt: "What actually happens between 'Initialize Build' and your app appearing in TestFlight. Every step, no hand-waving.",
    tags: ["Infrastructure", "Tutorial"],
    body: `When you click "Publish" in Mobivable, a remarkable amount of automation kicks in. Here's the full pipeline, step by step:

**Step 1: Schema Validation**
The app schema is validated against platform-specific constraints. iOS requires specific icon sizes (1024×1024 for App Store, 180×180 for iPhone), Android needs adaptive icons. We check all of this before starting the build.

**Step 2: Code Generation**
The export compiler walks the schema AST and generates the full project structure. For Expo projects, this includes App.tsx, navigation setup, screen components, and all configuration files.

**Step 3: Asset Pipeline**
App icons are resized to all required dimensions. Splash screens are generated. Screenshots captured in the Screenshot Gallery are tagged with device metadata for store listings.

**Step 4: EAS Build (coming soon)**
The project is submitted to Expo Application Services for cloud compilation. EAS handles code signing, provisioning profiles, and binary generation. iOS builds produce an IPA, Android builds produce an AAB.

**Step 5: Store Submission**
The compiled binary, along with metadata (description, keywords, screenshots), is submitted to App Store Connect or Google Play Console via their respective APIs.

**Current status:** Steps 1-3 are fully automated today. Steps 4-5 are in active development and will be available in the next release. For now, you can export the project and run EAS Build locally.`,
  },
  {
    code: "LOG-011", date: "2026.03.18", readTime: "7 min",
    title: "The Case for Native at the Edge",
    excerpt: "Why we compile to platform binaries instead of wrapping a webview — and the 120fps benchmarks to back it up.",
    tags: ["Engineering", "Performance"],
    body: `The mobile web has come a long way. PWAs are legitimate. Capacitor and Ionic produce solid apps. But for the class of apps our users are building — fitness trackers, social platforms, marketplaces — native performance isn't a nice-to-have. It's the baseline.

**Our benchmarks (iPhone 15 Pro, Expo SDK 51):**
- List scrolling: 120fps sustained with 1,000+ items
- Screen transitions: ~16ms (one frame at 60fps)
- Cold start: 380ms to interactive
- Memory: 45MB average for a 5-screen app

**Webview equivalent (same app, Capacitor):**
- List scrolling: 45-60fps with noticeable jank
- Screen transitions: ~80ms with visible re-paints
- Cold start: 1,200ms to interactive
- Memory: 120MB average

The difference is especially noticeable in gesture-heavy interfaces — swipe-to-dismiss, pull-to-refresh, pinch-to-zoom. These interactions need to run on the main thread at frame rate, which webviews can't guarantee.

We chose React Native + Expo as our compilation target because it gives us the best of both worlds: a single codebase (TypeScript) that compiles to genuine native components via JSI (JavaScript Interface, no bridge).`,
  },
];

function BlogPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <PageShell
      eyebrow="Field Notes"
      title="Dispatch from the Engine Room."
      intro="Engineering deep dives, product changelogs, and unfiltered thinking from the team building Mobivable."
    >
      <div className="border-t border-border">
        {posts.map((p) => {
          const isOpen = expanded === p.code;
          return (
            <div key={p.code} className="border-b border-border">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : p.code)}
                className="group w-full text-left py-10 hover:bg-card/50 transition-colors"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-baseline px-2">
                  <div className="md:col-span-2 space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-primary">{p.code}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">{p.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">{p.readTime}</span>
                    </div>
                  </div>
                  <div className="md:col-span-8">
                    <h2 className="font-display text-3xl md:text-4xl uppercase tracking-tighter group-hover:text-primary transition-colors mb-2">
                      {p.title}
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-[60ch] leading-relaxed mb-3">{p.excerpt}</p>
                    <div className="flex gap-2">
                      {p.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    <ChevronDown className={`h-5 w-5 text-muted-foreground inline-block transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="px-2 pb-10">
                  <div className="md:ml-[16.666%] md:max-w-[66.666%]">
                    <div className="prose prose-sm max-w-none">
                      {p.body.split('\n\n').map((paragraph, i) => {
                        if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                          return <h3 key={i} className="font-display text-lg uppercase mt-6 mb-2">{paragraph.replace(/\*\*/g, '')}</h3>;
                        }
                        if (paragraph.startsWith('- ')) {
                          return (
                            <ul key={i} className="list-disc list-inside space-y-1 text-sm text-muted-foreground leading-relaxed my-3">
                              {paragraph.split('\n').map((li, j) => (
                                <li key={j}>{li.replace(/^- /, '')}</li>
                              ))}
                            </ul>
                          );
                        }
                        // Handle bold text inline
                        const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
                        return (
                          <p key={i} className="text-sm text-muted-foreground leading-relaxed my-3">
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j} className="text-foreground font-semibold">{part.replace(/\*\*/g, '')}</strong>;
                              }
                              return part;
                            })}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
