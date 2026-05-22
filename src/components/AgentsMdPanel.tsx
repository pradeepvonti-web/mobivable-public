import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, RefreshCw, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { generateAgentsMd, getAgentsMd } from "@/lib/agents-md.functions";

export function AgentsMdPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const getFn = useServerFn(getAgentsMd);
  const genFn = useServerFn(generateAgentsMd);
  const [md, setMd] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getFn({ data: { projectId } });
        if (cancelled) return;
        if (r.ok) {
          setMd(r.agentsMd);
          // Auto-generate if empty
          if (!r.agentsMd.trim()) {
            setGenerating(true);
            const g = await genFn({ data: { projectId } });
            if (cancelled) return;
            if (g.ok) setMd(g.agentsMd);
            else toast.error(g.error);
            setGenerating(false);
          }
        } else {
          toast.error(r.error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, getFn, genFn]);

  async function regenerate() {
    setGenerating(true);
    const g = await genFn({ data: { projectId } });
    if (g.ok) {
      setMd(g.agentsMd);
      toast.success("Agents.md regenerated");
    } else {
      toast.error(g.error);
    }
    setGenerating(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] bg-card border border-border rounded-xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg">Agents.md</h2>
          <span className="text-xs text-muted-foreground">
            Per-project agent guide
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={copy}
              disabled={!md}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={regenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {generating ? "Generating…" : "Regenerate"}
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5">
          {loading || (generating && !md) ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {generating ? "Generating Agents.md from the bible…" : "Loading…"}
            </div>
          ) : md ? (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{md}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Agents.md yet. Click Regenerate to create one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
