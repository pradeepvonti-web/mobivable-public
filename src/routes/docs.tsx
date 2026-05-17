import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ChevronRight, BookOpen, Zap, Smartphone, Rocket, Code2, ArrowRightLeft, Search, Copy, CheckCheck } from "lucide-react";

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
  {
    code: "01", title: "Quickstart", icon: Zap,
    body: "Spin up your first AI-generated app in under 5 minutes. Auth, database, and a publishable build — all from one prompt.",
    content: [
      { heading: "1. Create a Project", text: "From the Dashboard, click "+ New Project". Give your app a name and describe what it does in plain English. The AI will interpret your intent and scaffold the full project." },
      { heading: "2. Chat with Agents", text: "The Product Manager agent will generate requirements, personas, and a feature list. Review and refine by chatting back. Each agent handles a different phase of development." },
      { heading: "3. Preview & Iterate", text: "Watch your app render in real-time in the phone preview. Click any agent in the sidebar to modify screens, logic, or styling. Changes apply instantly." },
      { heading: "4. Export or Publish", text: "Hit Export to download a complete Expo project (App.tsx, package.json, etc.). Run 'npx expo start' to launch on your device, or use Publish to build binaries for the App Store." },
    ],
  },
  {
    code: "02", title: "Prompting Patterns", icon: BookOpen,
    body: "How to phrase intent so the AI architect generates clean UI flows, data models, and integrations on the first try.",
    content: [
      { heading: "Be Specific About Screens", text: "Instead of 'make a fitness app', try 'Build a workout tracker with: Home (daily summary, streak counter), Log Workout (exercise picker, sets/reps/weight), Progress (weekly chart), Profile (settings, goals)'." },
      { heading: "Describe Data Relationships", text: "Mention entities explicitly: 'Users have many Workouts. Each Workout has many Exercises. Each Exercise has sets with reps and weight.' The AI will generate proper schemas." },
      { heading: "Reference Design Patterns", text: "Use terms like 'tab navigation', 'bottom sheet modal', 'pull-to-refresh list', 'floating action button'. The AI knows standard mobile patterns." },
      { heading: "Iterate, Don't Restart", text: "After the first generation, refine with follow-up prompts: 'Add a dark mode toggle to Settings', 'Make the chart use a bar style instead of line'. The AI preserves context." },
    ],
  },
  {
    code: "03", title: "Native Modules", icon: Smartphone,
    body: "Camera, push notifications, biometrics, location. Drop in capabilities by name and watch the binaries adapt.",
    content: [
      { heading: "Camera & Media", text: "Ask for 'photo capture with gallery picker'. The AI will integrate expo-camera and expo-image-picker with proper permissions." },
      { heading: "Push Notifications", text: "Say 'add push notifications'. The AI configures expo-notifications, registers for device tokens, and generates the notification handler." },
      { heading: "Authentication", text: "Request 'email/password login with Google OAuth'. The AI wires up Supabase Auth with proper session management and protected routes." },
      { heading: "Location & Maps", text: "Ask for 'location tracking with a map view'. The AI integrates expo-location and react-native-maps with permission handling." },
    ],
  },
  {
    code: "04", title: "Submission Pipeline", icon: Rocket,
    body: "Certificates, screenshots, App Store Connect metadata — automated. Track each binary through review.",
    content: [
      { heading: "Export Your Project", text: "Click Export → Download ZIP. The package includes all source code, assets, and configuration files needed for a production build." },
      { heading: "Configure EAS Build", text: "Run 'eas build --platform ios' or '--platform android' in the exported project. EAS handles signing, provisioning profiles, and binary compilation." },
      { heading: "Generate Store Assets", text: "Use the Screenshots tab to capture App Store-quality screenshots at the correct device resolutions (iPhone 15 Pro, Pixel 8, iPad Pro)." },
      { heading: "Submit for Review", text: "Upload the binary to App Store Connect or Google Play Console. The generated README includes metadata fields (description, keywords, category) ready to paste." },
    ],
  },
  {
    code: "05", title: "API Reference", icon: Code2,
    body: "REST endpoints and CLI commands for advanced workflows, CI/CD integration, and team deployments.",
    content: [
      { heading: "Project API", text: "GET /api/projects — List all projects. POST /api/projects — Create a new project. GET /api/projects/:id — Get project details including generated schema and code." },
      { heading: "Chat API", text: "POST /api/projects/:id/chat — Send a message to the agent pipeline. The response includes generated code diffs, schema updates, and agent outputs." },
      { heading: "Export API", text: "GET /api/projects/:id/export — Download the full Expo project as a ZIP. Supports query params for platform targeting and asset inclusion." },
      { heading: "Webhooks", text: "Configure webhooks in Settings to receive events: project.created, build.completed, agent.finished. Payload includes full context." },
    ],
  },
  {
    code: "06", title: "Migration Guides", icon: ArrowRightLeft,
    body: "Move existing Expo, Flutter, or native projects into Mobivable without losing your existing user base.",
    content: [
      { heading: "From Expo", text: "Import your app.json and component tree. Describe the existing screens to the AI: 'I have an existing Expo app with these screens: [list]. Rebuild it with these improvements: [list]'." },
      { heading: "From Flutter", text: "Describe your Flutter widgets and state management pattern. The AI will generate equivalent React Native components with similar architecture." },
      { heading: "From Native (Swift/Kotlin)", text: "Provide your screen flow and data model. The AI will create a cross-platform version maintaining your app's core logic and user experience." },
      { heading: "Data Migration", text: "If you have an existing Supabase or Firebase backend, connect it via the Backend panel. The AI can generate data migration scripts for schema changes." },
    ],
  },
];

function DocsPage() {
  const [expanded, setExpanded] = useState<string | null>("01");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = searchQuery.trim()
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.content.some(
            (c) =>
              c.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
              c.text.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : sections;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <PageShell
      eyebrow="Developer Documentation"
      title="The Mobivable Manual"
      intro="Everything you need to operate the AI development protocol — from first prompt to App Store binary."
    >
      {/* Search */}
      <div className="mb-8 max-w-xl">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card/50">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filtered.map((s) => {
          const Icon = s.icon;
          const isOpen = expanded === s.code;
          return (
            <div key={s.code} className="border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : s.code)}
                className={`w-full text-left p-6 flex items-start gap-4 transition-colors ${
                  isOpen ? "bg-primary/5" : "hover:bg-card/50"
                }`}
              >
                <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{s.code}</span>
                    <h3 className="font-display text-xl uppercase tracking-tight">{s.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
                <ChevronRight className={`h-5 w-5 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
              </button>
              {isOpen && (
                <div className="border-t border-border bg-card/30 p-6 space-y-6">
                  {s.content.map((c, i) => (
                    <div key={i} className="group">
                      <div className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold mb-1.5">{c.heading}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyText(c.text, `${s.code}-${i}`); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted shrink-0"
                          title="Copy to clipboard"
                        >
                          {copied === `${s.code}-${i}` ? (
                            <CheckCheck className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No results for "{searchQuery}"</p>
          <button onClick={() => setSearchQuery("")} className="mt-2 text-xs text-primary hover:underline">
            Clear search
          </button>
        </div>
      )}
    </PageShell>
  );
}
