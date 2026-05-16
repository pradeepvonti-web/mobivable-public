import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, ExternalLink, Loader2, Eye, EyeOff, Sparkles } from "lucide-react";
import { getAdminStats } from "@/lib/admin.functions";

type ProviderInfo = { id: string; name: string; configured: boolean; models: { id: string; label: string }[]; isActive: boolean };

const META: Record<string, { color: string; icon: string; envKey: string; docsUrl: string }> = {
  openai: { color: "#10a37f", icon: "🟢", envKey: "OPENAI_API_KEY", docsUrl: "https://platform.openai.com/api-keys" },
  gemini: { color: "#4285f4", icon: "🔵", envKey: "GOOGLE_AI_API_KEY", docsUrl: "https://aistudio.google.com/apikey" },
  anthropic: { color: "#d97706", icon: "🟠", envKey: "ANTHROPIC_API_KEY", docsUrl: "https://console.anthropic.com/settings/keys" },
  groq: { color: "#f97316", icon: "⚡", envKey: "GROQ_API_KEY", docsUrl: "https://console.groq.com/keys" },
  openrouter: { color: "#8b5cf6", icon: "🌐", envKey: "OPENROUTER_API_KEY", docsUrl: "https://openrouter.ai/keys" },
};

export function AdminAIConfig() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const fn = useServerFn(getAdminStats);

  useEffect(() => {
    fn().then((stats: any) => {
      setProviders(stats.providers);
      setActiveProvider(stats.activeProvider);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const configured = providers.filter((p) => p.configured).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl tracking-tight">AI Provider Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">{configured}/5 providers configured · Active: {activeProvider}</p>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-5 rounded-2xl border ${
        configured > 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"
      }`}>
        {configured > 0 ? <Check className="h-5 w-5 text-emerald-500" /> : <X className="h-5 w-5 text-destructive" />}
        <div className="flex-1">
          <p className="text-sm font-medium">{configured > 0 ? `AI Active — using ${activeProvider}` : "No AI Provider Configured"}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {configured > 0 ? "All AI features (code gen, chat, agents, image gen) are operational." : "Add at least one API key to your .env file and restart the server."}
          </p>
        </div>
        <button type="button" onClick={() => setShowKeys(!showKeys)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showKeys ? "Hide" : "Show"} env vars
        </button>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {providers.map((p) => {
          const meta = META[p.id];
          if (!meta) return null;
          return (
            <div key={p.id} className={`rounded-2xl border p-5 space-y-4 transition-all ${
              p.isActive ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : p.configured ? "border-emerald-500/30 bg-card" : "border-border bg-card/40"
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{meta.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.isActive && <span className="text-[8px] font-mono uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">active</span>}
                    {p.configured && !p.isActive && <span className="text-[8px] font-mono uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">ready</span>}
                  </div>
                  {showKeys && (
                    <code className="text-[9px] text-muted-foreground font-mono">{meta.envKey}={p.configured ? "••••••••" : "(not set)"}</code>
                  )}
                </div>
                {p.configured ? <Check className="h-4 w-4 text-emerald-500" /> : (
                  <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="text-[9px] text-primary hover:underline flex items-center gap-1">
                    Get Key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              {p.configured && (
                <div className="flex flex-wrap gap-1">
                  {p.models.map((m) => (
                    <span key={m.id} className="text-[8px] font-mono bg-background/60 border border-border/50 px-1.5 py-0.5 rounded-full text-muted-foreground">{m.label}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Setup card */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Sparkles className="h-4 w-4" /> Configuration Guide</h3>
        <pre className="text-[10px] font-mono bg-card border border-border rounded-xl p-4 overflow-x-auto text-foreground/60">
{`# Add to your .env file (pick one or more):
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# Optional overrides:
AI_PROVIDER=openai     # Force provider
AI_MODEL=gpt-4o        # Force model`}
        </pre>
        <p className="text-[11px] text-muted-foreground">After adding keys, restart the dev server for changes to take effect.</p>
      </div>
    </div>
  );
}
