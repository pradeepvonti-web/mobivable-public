import { useEffect, useState } from "react";
import {
  Settings, Check, X, Sparkles, ChevronRight,
  Cpu, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getAIProviderStatus } from "@/lib/ai-status.functions";

type ProviderInfo = {
  id: string;
  name: string;
  configured: boolean;
  models: { id: string; label: string }[];
  isActive: boolean;
};

const PROVIDER_META: Record<string, { color: string; icon: string; envKey: string; docsUrl: string }> = {
  openai: {
    color: "#10a37f",
    icon: "🟢",
    envKey: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    color: "#4285f4",
    icon: "🔵",
    envKey: "GOOGLE_AI_API_KEY",
    docsUrl: "https://aistudio.google.com/apikey",
  },
  anthropic: {
    color: "#d97706",
    icon: "🟠",
    envKey: "ANTHROPIC_API_KEY",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  groq: {
    color: "#f97316",
    icon: "⚡",
    envKey: "GROQ_API_KEY",
    docsUrl: "https://console.groq.com/keys",
  },
  openrouter: {
    color: "#8b5cf6",
    icon: "🌐",
    envKey: "OPENROUTER_API_KEY",
    docsUrl: "https://openrouter.ai/keys",
  },
};

export function AIProviderSettings() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState("Not configured");
  const [hasAny, setHasAny] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const getStatus = useServerFn(getAIProviderStatus);

  useEffect(() => {
    getStatus().then((data) => {
      setProviders(data.providers);
      setActiveProvider(data.activeProvider);
      setHasAny(data.hasAny);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 text-muted-foreground text-sm">
        <Cpu className="h-4 w-4 animate-pulse" />
        <span>Checking AI providers…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        hasAny
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/10 border-destructive/30 text-destructive"
      }`}>
        {hasAny ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {hasAny ? `Active: ${activeProvider}` : "No AI provider configured"}
          </p>
          <p className="text-[10px] opacity-70 mt-0.5">
            {hasAny
              ? "AI features (generation, chat, agents) are active."
              : "Set at least one API key in your .env file to enable AI features."}
          </p>
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            AI Providers
          </h3>
          <button
            type="button"
            onClick={() => setShowKeys(!showKeys)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showKeys ? "Hide" : "Show"} env vars
          </button>
        </div>

        {providers.map((p) => {
          const meta = PROVIDER_META[p.id];
          if (!meta) return null;

          return (
            <div
              key={p.id}
              className={`rounded-xl border p-3 transition-all ${
                p.isActive
                  ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                  : p.configured
                    ? "border-emerald-500/30 bg-card/60"
                    : "border-border bg-card/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{p.name}</span>
                    {p.isActive && (
                      <span className="text-[8px] font-mono uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        active
                      </span>
                    )}
                    {p.configured && !p.isActive && (
                      <span className="text-[8px] font-mono uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                        ready
                      </span>
                    )}
                  </div>
                  {showKeys && (
                    <code className="text-[9px] text-muted-foreground font-mono mt-0.5 block">
                      {meta.envKey}={p.configured ? "••••••••" : "(not set)"}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {p.configured ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <a
                      href={meta.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] text-primary hover:text-primary/80"
                    >
                      Get Key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Models list */}
              {p.configured && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.models.map((m) => (
                    <span
                      key={m.id}
                      className="text-[8px] font-mono bg-background/50 border border-border/50 px-1.5 py-0.5 rounded-full text-muted-foreground"
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Setup instructions */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-primary flex items-center gap-2">
          <Settings className="h-3.5 w-3.5" />
          Setup Instructions
        </h3>
        <div className="space-y-2 text-[11px] text-foreground/70 leading-relaxed">
          <p>
            Add your API key(s) to the <code className="text-[10px] bg-card px-1 py-0.5 rounded font-mono">.env</code> file
            in your project root:
          </p>
          <pre className="text-[9px] font-mono bg-card border border-border rounded-lg p-3 overflow-x-auto text-foreground/60">
{`# Pick one or more (first found is used):
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# Optional: force a specific provider
# AI_PROVIDER=openai

# Optional: override the default model
# AI_MODEL=gpt-4o`}
          </pre>
          <p>
            After adding a key, <strong>restart the dev server</strong> for changes to take effect.
          </p>
        </div>
      </div>

      {/* Model routing info */}
      <div className="rounded-xl border border-border bg-card/30 p-4 space-y-2">
        <h3 className="text-xs font-semibold text-foreground/90 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Smart Model Routing
        </h3>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          The system automatically maps model selections to the best equivalent
          on your configured provider. For example, selecting "Gemini 2.5 Pro"
          will use <code className="text-[9px] bg-card px-1 py-0.5 rounded font-mono">gpt-4o</code> on
          OpenAI, <code className="text-[9px] bg-card px-1 py-0.5 rounded font-mono">claude-sonnet-4</code> on
          Anthropic, or <code className="text-[9px] bg-card px-1 py-0.5 rounded font-mono">llama-3.3-70b</code> on Groq.
        </p>
      </div>
    </div>
  );
}
