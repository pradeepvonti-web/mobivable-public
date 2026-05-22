import { useState } from "react";
import {
  Wand2, Search, Globe, FileCode, Brain, Image as ImageIcon,
  Lightbulb, Rocket, Copy, CheckCheck, Loader2, ChevronRight,
  Zap, BookOpen, Bug, Palette, Shield, BarChart3, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  aiGenerate, aiResearch, aiCodeReview, aiDebug, aiPalette, aiOptimize,
  type ReviewResult, type PaletteResult,
} from "@/lib/ai-studio.functions";

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

function ResultBlock({ text, accent = "violet" }: { text: string; accent?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`rounded-xl border border-${accent}-500/20 bg-${accent}-500/5 p-4 relative group`}>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        aria-label="Copy result"
      >
        {copied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90 font-sans">{text}</pre>
    </div>
  );
}

export function AIStudioPanel({
  projectId: _projectId,
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

  // Results state
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [paletteResult, setPaletteResult] = useState<PaletteResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<string | null>(null);

  const fnGenerate = useServerFn(aiGenerate);
  const fnResearch = useServerFn(aiResearch);
  const fnReview = useServerFn(aiCodeReview);
  const fnDebug = useServerFn(aiDebug);
  const fnPalette = useServerFn(aiPalette);
  const fnOptimize = useServerFn(aiOptimize);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  async function withLoading<T>(fn: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    try { return await fn(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "AI request failed"); return null; }
    finally { setLoading(false); }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (onSendPrompt) { onSendPrompt(prompt); toast.success("Prompt sent to AI agents!"); setPrompt(""); return; }
    const res = await withLoading(() => fnGenerate({ data: { prompt, projectName } }));
    if (res) { setGenerateResult(res.text); toast.success("Plan generated"); }
  };

  const handleResearch = async () => {
    if (!researchQuery.trim()) return;
    const res = await withLoading(() => fnResearch({ data: { query: researchQuery } }));
    if (res) { setResearchResult(res.text); toast.success("Research complete"); }
  };

  const handleReview = async () => {
    const res = await withLoading(() => fnReview({ data: { projectName } }));
    if (res) { setReviewResult(res); toast.success("Review complete"); }
  };

  const handleDebug = async () => {
    if (!debugInput.trim()) return;
    const res = await withLoading(() => fnDebug({ data: { input: debugInput, projectName } }));
    if (res) { setDebugResult(res.text); toast.success("Diagnosis ready"); }
  };

  const handlePalette = async () => {
    const res = await withLoading(() => fnPalette({ data: { projectName } }));
    if (res) { setPaletteResult(res); toast.success("Palette generated"); }
  };

  const handleOptimize = async () => {
    const res = await withLoading(() => fnOptimize({ data: { projectName, focus: "all" } }));
    if (res) { setOptimizeResult(res.text); toast.success("Recommendations ready"); }
  };

  const displayPalettes = paletteResult?.palettes ?? [
    { name: "Primary", colors: ["#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6"] },
    { name: "Neutral", colors: ["#F8FAFC", "#94A3B8", "#475569", "#1E293B"] },
    { name: "Accent", colors: ["#F59E0B", "#EF4444", "#10B981", "#3B82F6"] },
  ];

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
                disabled={!prompt.trim() || loading}
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Generate with AI
              </button>
            </div>

            {generateResult && <ResultBlock text={generateResult} accent="violet" />}

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
                Be specific about screens, data models, and interactions. The more detail you provide, the better the AI generates your app.
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

            {researchResult && <ResultBlock text={researchResult} accent="blue" />}

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

            <button
              type="button"
              onClick={handleReview}
              disabled={loading}
              className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode className="h-3.5 w-3.5" />}
              Run Review
            </button>

            {reviewResult && (
              <>
                <div className="space-y-2">
                  {reviewResult.checks.map((c, i) => {
                    const color = c.status === "pass" ? "emerald" : c.status === "warn" ? "amber" : "red";
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                        <div className={`h-2.5 w-2.5 rounded-full mt-1.5 bg-${color}-500`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium">{c.label}</span>
                          <p className="text-[10px] text-muted-foreground">{c.detail}</p>
                        </div>
                        <span className={`text-[9px] font-mono uppercase tracking-widest text-${color}-500`}>{c.status}</span>
                      </div>
                    );
                  })}
                </div>
                {reviewResult.summary && <ResultBlock text={reviewResult.summary} accent="emerald" />}
              </>
            )}
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
                placeholder="TypeError: Cannot read property 'map' of undefined&#10;&#10;or: 'The list screen shows blank after navigating back'"
                className="w-full rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-mono min-h-[120px] resize-none outline-none focus:border-red-400/40 transition-colors placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={handleDebug}
                disabled={!debugInput.trim() || loading}
                className="mt-2 w-full rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
                Diagnose & Fix
              </button>
            </div>

            {debugResult && <ResultBlock text={debugResult} accent="red" />}

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
              <h4 className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> Common Issues
              </h4>
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
            <button
              type="button"
              onClick={handlePalette}
              disabled={loading}
              className="w-full rounded-xl border border-pink-500/30 bg-pink-500/10 px-4 py-2.5 text-sm font-medium text-pink-400 hover:bg-pink-500/20 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Palette className="h-3.5 w-3.5" />}
              Generate Custom Palette
            </button>

            <div className="space-y-3">
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Color Palette</h4>
              {displayPalettes.map((palette) => (
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

            {paletteResult?.rationale && <ResultBlock text={paletteResult.rationale} accent="pink" />}
          </>
        )}

        {/* ─── Optimize ─── */}
        {activeTool === "optimize" && (
          <>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 grid place-items-center shrink-0">
                <BarChart3 className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Optimization Audit</h4>
                <p className="text-[10px] text-muted-foreground">Performance, accessibility, bundle size, best practices</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOptimize}
              disabled={loading}
              className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Run Optimization Audit
            </button>

            {optimizeResult && <ResultBlock text={optimizeResult} accent="amber" />}
          </>
        )}
      </div>
    </div>
  );
}
