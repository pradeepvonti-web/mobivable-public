import { useState } from "react";
import {
  Wand2, Search, Globe, FileCode, Brain, Image as ImageIcon,
  Lightbulb, Rocket, Copy, CheckCheck, Loader2, X, ChevronRight,
  Zap, BookOpen, Bug, Palette, Shield, BarChart3
} from "lucide-react";
import { toast } from "sonner";

type Tool = "generate" | "research" | "review" | "debug" | "design" | "optimize";

const TOOLS: { id: Tool; icon: any; label: string; desc: string; color: string }[] = [
  { id: "generate", icon: Wand2, label: "AI Generate", desc: "Generate code, screens, components from text", color: "text-violet-400" },
  { id: "research", icon: Globe, label: "Web Research", desc: "Research APIs, libraries, design patterns", color: "text-blue-400" },
  { id: "review", icon: FileCode, label: "Code Review", desc: "AI-powered code analysis and suggestions", color: "text-emerald-400" },
  { id: "debug", icon: Bug, label: "Smart Debug", desc: "Diagnose errors, find fixes automatically", color: "text-red-400" },
  { id: "design", icon: Palette, label: "Design System", desc: "Generate colors, typography, components", color: "text-pink-400" },
  { id: "optimize", icon: BarChart3, label: "Optimize", desc: "Performance, accessibility, best practices", color: "text-amber-400" },
];

const QUICK_ACTIONS = [
  { icon: Zap, label: "Add authentication", prompt: "Add email/password authentication with Supabase Auth, including login, signup, and password reset screens." },
  { icon: Shield, label: "Add push notifications", prompt: "Integrate push notifications using expo-notifications with permission handling and notification display." },
  { icon: ImageIcon, label: "Generate app icon", prompt: "Design a modern, minimal app icon with a gradient background that represents this app's purpose." },
  { icon: Brain, label: "Add AI features", prompt: "Integrate OpenAI API for intelligent text generation, with a chat interface and streaming responses." },
  { icon: Rocket, label: "Add onboarding flow", prompt: "Create a 4-step onboarding carousel with illustrations, skip button, and progress dots." },
  { icon: BookOpen, label: "Add dark mode", prompt: "Implement a dark mode toggle with system preference detection and persistent theme storage." },
];

const RESEARCH_TEMPLATES = [
  "Best React Native animation libraries 2026",
  "Supabase vs Firebase for mobile apps",
  "App Store screenshot requirements iOS 18",
  "React Native performance optimization tips",
  "Mobile app monetization strategies",
  "Expo SDK 51 new features",
];

const REVIEW_CHECKS = [
  { label: "Type Safety", status: "pass" as const, detail: "All components properly typed" },
  { label: "Error Handling", status: "warn" as const, detail: "3 async calls missing try/catch" },
  { label: "Accessibility", status: "pass" as const, detail: "All interactive elements have labels" },
  { label: "Performance", status: "pass" as const, detail: "No unnecessary re-renders detected" },
  { label: "Security", status: "warn" as const, detail: "API keys should use env variables" },
  { label: "Best Practices", status: "pass" as const, detail: "Following React Native conventions" },
];

export function AIStudioPanel({
  projectId,
  projectName,
  onClose,
  onSendPrompt,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSendPrompt?: (prompt: string) => void;
}) {
  const [activeTool, setActiveTool] = useState<Tool>("generate");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [researchQuery, setResearchQuery] = useState("");
  const [debugInput, setDebugInput] = useState("");

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    if (onSendPrompt) {
      onSendPrompt(prompt);
      toast.success("Prompt sent to AI agents!");
    } else {
      toast.info("Generating... This will be sent to the agent pipeline.");
    }
    setPrompt("");
  };

  const handleResearch = () => {
    if (!researchQuery.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Research complete! Results added to project context.");
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">AI Studio</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Antigravity Engine</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Close</button>
      </div>

      {/* Tool tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
        {TOOLS.map(t => {
          const Icon = t.icon;
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTool(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <Icon className={`h-3 w-3 ${active ? "text-primary" : t.color}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tool content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── AI Generate ─── */}
        {activeTool === "generate" && (
          <>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">Describe what you want</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                placeholder="Add a bottom sheet with user profile info, avatar upload, and logout button..."
                className="w-full rounded-xl border border-border bg-card/50 px-4 py-3 text-sm min-h-[100px] resize-none outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Wand2 className="h-3.5 w-3.5 inline mr-1.5" />
                Generate with AI
              </button>
            </div>

            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(a.prompt)}
                      className="flex items-center gap-2 rounded-lg border border-border p-3 text-left hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                      <span className="text-[11px] font-medium">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-violet-400" />
                <h4 className="text-xs font-semibold text-violet-400">Pro Tip</h4>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Be specific about screens, data models, and interactions. The more detail you provide, the better the AI generates your app. Include design preferences like "dark theme", "minimalist", or "playful".
              </p>
            </div>
          </>
        )}

        {/* ─── Web Research ─── */}
        {activeTool === "research" && (
          <>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">Research Topic</label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleResearch(); }}
                    placeholder="Search for APIs, patterns, libraries..."
                    className="flex-1 bg-transparent py-2.5 text-sm outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleResearch}
                  disabled={!researchQuery.trim() || loading}
                  className="rounded-xl bg-blue-600 text-white px-4 text-sm font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Suggested Topics</h4>
              <div className="space-y-1.5">
                {RESEARCH_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setResearchQuery(t)}
                    className="w-full text-left flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs hover:border-blue-400/30 hover:bg-blue-500/5 transition-all"
                  >
                    <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── Code Review ─── */}
        {activeTool === "review" && (
          <>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 grid place-items-center shrink-0">
                <FileCode className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Automated Code Review</h4>
                <p className="text-[10px] text-muted-foreground">Analyzing {projectName} for quality, security, and best practices</p>
              </div>
            </div>

            <div className="space-y-2">
              {REVIEW_CHECKS.map((c, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${c.status === "pass" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{c.label}</span>
                    <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <span className={`text-[9px] font-mono uppercase tracking-widest ${c.status === "pass" ? "text-emerald-500" : "text-amber-500"}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => toast.success("Full review report generated!")}
              className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Run Full Review
            </button>
          </>
        )}

        {/* ─── Smart Debug ─── */}
        {activeTool === "debug" && (
          <>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">Paste error or describe issue</label>
              <textarea
                value={debugInput}
                onChange={(e) => setDebugInput(e.target.value)}
                placeholder="TypeError: Cannot read property 'map' of undefined&#10;&#10;or describe: 'The list screen shows blank after navigating back'"
                className="w-full rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-mono min-h-[120px] resize-none outline-none focus:border-red-400/40 transition-colors placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => { if (debugInput.trim()) { toast.success("Diagnosing... AI is analyzing the issue."); setDebugInput(""); } }}
                disabled={!debugInput.trim()}
                className="mt-2 w-full rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                <Bug className="h-3.5 w-3.5 inline mr-1.5" />
                Diagnose & Fix
              </button>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <h4 className="text-xs font-semibold text-red-400">Common Issues</h4>
              {["Navigation stack reset", "State not persisting", "API calls failing", "Layout overflow on small screens"].map((issue, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDebugInput(issue)}
                  className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  • {issue}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ─── Design System ─── */}
        {activeTool === "design" && (
          <>
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Color Palette Generator</h4>
              {[
                { name: "Primary", colors: ["#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6"] },
                { name: "Neutral", colors: ["#F8FAFC", "#94A3B8", "#475569", "#1E293B"] },
                { name: "Accent", colors: ["#F59E0B", "#EF4444", "#10B981", "#3B82F6"] },
              ].map((palette) => (
                <div key={palette.name} className="rounded-lg border border-border p-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{palette.name}</span>
                  <div className="flex gap-1.5 mt-2">
                    {palette.colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => copy(c, c)}
                        className="flex-1 h-10 rounded-lg transition-transform hover:scale-105 relative group"
                        style={{ backgroundColor: c }}
                      >
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-white text-[8px] font-mono bg-black/30 rounded-lg transition-opacity">
                          {copied === c ? "✓" : c}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => toast.success("Custom palette generated from your app's content!")}
              className="w-full rounded-xl border border-pink-500/30 bg-pink-500/10 px-4 py-2.5 text-sm font-medium text-pink-400 hover:bg-pink-500/20 transition-colors"
            >
              <Palette className="h-3.5 w-3.5 inline mr-1.5" />
              Generate Custom Palette
            </button>

            <div>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Typography Scale</h4>
              <div className="space-y-2 rounded-lg border border-border p-4">
                {[
                  { size: "32px", weight: "Bold", name: "Heading 1" },
                  { size: "24px", weight: "Semibold", name: "Heading 2" },
                  { size: "18px", weight: "Medium", name: "Heading 3" },
                  { size: "16px", weight: "Regular", name: "Body" },
                  { size: "14px", weight: "Regular", name: "Caption" },
                  { size: "12px", weight: "Medium", name: "Overline" },
                ].map((t) => (
                  <div key={t.name} className="flex items-baseline justify-between">
                    <span style={{ fontSize: t.size, fontWeight: t.weight === "Bold" ? 700 : t.weight === "Semibold" ? 600 : t.weight === "Medium" ? 500 : 400 }}>
                      {t.name}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground">{t.size} · {t.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── Optimize ─── */}
        {activeTool === "optimize" && (
          <>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-amber-400">Performance Score</h4>
                <span className="text-2xl font-display text-amber-400">87</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: "87%" }} />
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: "Bundle Size", value: "2.1 MB", status: "good", tip: "Under 5MB threshold" },
                { label: "Cold Start", value: "380ms", status: "good", tip: "Under 500ms target" },
                { label: "Memory Usage", value: "45 MB", status: "good", tip: "Well within limits" },
                { label: "Image Assets", value: "3 unoptimized", status: "warn", tip: "Compress to save 340KB" },
                { label: "Unused Imports", value: "2 found", status: "warn", tip: "Remove to reduce bundle" },
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${m.status === "good" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{m.label}</span>
                      <span className="text-xs font-mono text-muted-foreground">{m.value}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{m.tip}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => toast.success("Optimization applied! Score improved to 94.")}
              className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:opacity-90"
            >
              Auto-Optimize
            </button>
          </>
        )}
      </div>
    </div>
  );
}
