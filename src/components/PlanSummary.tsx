import { useMemo, useState } from "react";
import { ChevronDown, Layers, Palette, Type, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Plan = {
  name?: string;
  theme?: {
    primary?: string;
    accent?: string;
    background?: string;
    typography?: { headingFont?: string; bodyFont?: string; displayFont?: string };
  };
  screens?: Array<{ id?: string; title?: string; icon?: string; elements?: unknown[] }>;
  navigation?: { items?: Array<{ label?: string; icon?: string }> };
};

function tryParse(text: string): Plan | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1));
    if (obj && (obj.screens || obj.theme)) return obj as Plan;
    return null;
  } catch {
    return null;
  }
}

export function PlanSummary({ content }: { content: string }) {
  const plan = useMemo(() => tryParse(content), [content]);
  const [showRaw, setShowRaw] = useState(false);

  if (!plan) {
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  const theme = plan.theme ?? {};
  const typo = theme.typography ?? {};
  const screens = plan.screens ?? [];
  const navItems = plan.navigation?.items ?? [];

  const swatches = [theme.primary, theme.accent, theme.background].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {/* Title */}
      {plan.name && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            App concept
          </p>
          <h3 className="font-display text-xl leading-tight">{plan.name}</h3>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Screens" value={String(screens.length)} />
        <Stat icon={<Sparkles className="h-3.5 w-3.5" />} label="Nav" value={String(navItems.length)} />
        <Stat
          icon={<Type className="h-3.5 w-3.5" />}
          label="Font"
          value={typo.headingFont ?? typo.displayFont ?? "Default"}
        />
      </div>

      {/* Palette */}
      {swatches.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Palette className="h-3 w-3 text-muted-foreground" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Palette
            </p>
          </div>
          <div className="flex gap-1.5">
            {swatches.map((c) => (
              <div key={c} className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2 py-1">
                <span
                  className="h-3 w-3 rounded-full border border-border/60"
                  style={{ background: c }}
                />
                <span className="font-mono text-[10px] text-muted-foreground">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screens */}
      {screens.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            Screens
          </p>
          <div className="flex flex-col gap-1.5">
            {screens.map((s, i) => (
              <div
                key={s.id ?? i}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.title ?? s.id ?? `Screen ${i + 1}`}</p>
                  {s.id && s.title && (
                    <p className="font-mono text-[10px] text-muted-foreground/70 truncate">{s.id}</p>
                  )}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 ml-2">
                  {(s.elements?.length ?? 0)} blocks
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw toggle */}
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showRaw ? "rotate-180" : ""}`} />
        {showRaw ? "Hide" : "View"} raw schema
      </button>
      {showRaw && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {JSON.stringify(plan, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}
