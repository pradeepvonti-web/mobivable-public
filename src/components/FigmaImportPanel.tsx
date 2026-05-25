import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  X,
  Eye,
  EyeOff,
  Download,
  Check,
  Palette,
  Type,
  Layers,
  LayoutGrid,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { extractFigmaDesign, exportFigmaImage, saveFigmaTokens, compileFigmaToSchema, type FigmaDesignTokens } from "@/lib/figma.functions";

const TOKEN_KEY = "mobivable:figmaToken";

export function FigmaImportPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<FigmaDesignTokens | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [compiling, setCompiling] = useState(false);

  const extractFn = useServerFn(extractFigmaDesign);
  const exportFn = useServerFn(exportFigmaImage);
  const saveTokensFn = useServerFn(saveFigmaTokens);
  const compileFn = useServerFn(compileFigmaToSchema);

  // Load saved token from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) setFigmaToken(saved);
  }, []);

  // Persist token
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (figmaToken) window.localStorage.setItem(TOKEN_KEY, figmaToken);
    else window.localStorage.removeItem(TOKEN_KEY);
  }, [figmaToken]);

  const handleImport = useCallback(async () => {
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      toast.error("Please enter both a Figma URL and token");
      return;
    }
    setLoading(true);
    setTokens(null);
    setPreviewUrl(null);
    setApplied(false);
    try {
      const res = await extractFn({
        data: { projectId, figmaUrl: figmaUrl.trim(), figmaToken: figmaToken.trim() },
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        setTokens(res.tokens);
        toast.success(`Imported ${res.tokens.colors.length} colors, ${res.tokens.typography.length} fonts, ${res.tokens.components.length} components`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }, [figmaUrl, figmaToken, projectId, extractFn]);

  const handlePreview = useCallback(async () => {
    if (!figmaUrl.trim() || !figmaToken.trim()) return;
    setPreviewLoading(true);
    try {
      const res = await exportFn({
        data: { figmaUrl: figmaUrl.trim(), figmaToken: figmaToken.trim(), format: "png", scale: 2 },
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        setPreviewUrl(res.imageUrl);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [figmaUrl, figmaToken, exportFn]);

  const handleApply = useCallback(async () => {
    if (!tokens) return;
    setLoading(true);
    try {
      const res = await saveTokensFn({
        data: { projectId, tokens },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Store tokens in localStorage for client-side queries
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `mobivable:figmaTokens:${projectId}`,
          JSON.stringify(tokens),
        );
      }
      setApplied(true);
      toast.success("Design tokens applied and saved to project database!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply tokens");
    } finally {
      setLoading(false);
    }
  }, [tokens, projectId, saveTokensFn]);

  const handleCompile = useCallback(async () => {
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      toast.error("Please enter both a Figma URL and token");
      return;
    }
    setCompiling(true);
    try {
      const res = await compileFn({
        data: { projectId, figmaUrl: figmaUrl.trim(), figmaToken: figmaToken.trim() },
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Successfully compiled Figma design into interactive schema!");
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compile failed");
    } finally {
      setCompiling(false);
    }
  }, [figmaUrl, figmaToken, projectId, compileFn]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 grid place-items-center">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Figma Import</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Design tokens &amp; assets
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      </div>

      {/* Inputs */}
      <div className="p-4 space-y-3 border-b border-border">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Figma File / Frame URL
          </label>
          <input
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/XXXXX/..."
            className="w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-xs outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Personal Access Token
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? "text" : "password"}
                value={figmaToken}
                onChange={(e) => setFigmaToken(e.target.value)}
                placeholder="figd_..."
                className="w-full rounded-lg border border-border bg-card/50 px-3 py-2 pr-8 text-xs font-mono outline-none focus:border-primary/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Generate at{" "}
            <a
              href="https://www.figma.com/developers/api#access-tokens"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              figma.com/developers <ExternalLink className="h-2 w-2" />
            </a>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={loading || compiling || !figmaUrl.trim() || !figmaToken.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary/10 text-primary border border-primary/20 px-4 py-2 text-xs font-medium hover:bg-primary/20 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {loading ? "Importing…" : "Extract Tokens"}
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading || compiling || !figmaUrl.trim() || !figmaToken.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50 transition-all"
            >
              {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Preview
            </button>
          </div>

          <button
            type="button"
            onClick={handleCompile}
            disabled={compiling || loading || !figmaUrl.trim() || !figmaToken.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
          >
            {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {compiling ? "Compiling Figma Design…" : "Compile Figma to App"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Preview image */}
        {previewUrl && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3 w-3" /> Frame Preview
            </h3>
            <div className="rounded-xl border border-border overflow-hidden bg-card/40">
              <img
                src={previewUrl}
                alt="Figma frame preview"
                className="w-full h-auto"
              />
            </div>
          </div>
        )}

        {/* Design tokens */}
        {tokens && (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold">{tokens.fileName}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {tokens.colors.length} colors · {tokens.typography.length} fonts · {tokens.components.length} components
                </p>
              </div>
            </div>

            {/* Colors */}
            {tokens.colors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Palette className="h-3 w-3" /> Colors ({tokens.colors.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tokens.colors.slice(0, 24).map((color, i) => (
                    <button
                      key={`${color}-${i}`}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(color).catch(() => {});
                        toast(`Copied ${color}`);
                      }}
                      className="group flex flex-col items-center gap-1"
                      title={color}
                    >
                      <div
                        className="h-8 w-8 rounded-lg border border-border shadow-sm group-hover:ring-2 ring-primary/50 transition-all"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[8px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                        {color}
                      </span>
                    </button>
                  ))}
                  {tokens.colors.length > 24 && (
                    <span className="text-[9px] text-muted-foreground self-center">
                      +{tokens.colors.length - 24} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Typography */}
            {tokens.typography.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Type className="h-3 w-3" /> Typography ({tokens.typography.length})
                </h3>
                <div className="space-y-1.5">
                  {tokens.typography.slice(0, 12).map((t, i) => (
                    <div
                      key={`${t.fontFamily}-${t.fontSize}-${i}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2"
                    >
                      <span className="text-xs font-medium" style={{ fontFamily: t.fontFamily }}>
                        {t.fontFamily}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {t.fontSize}px / w{t.fontWeight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Components */}
            {tokens.components.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Components ({tokens.components.length})
                </h3>
                <div className="space-y-1.5">
                  {tokens.components.slice(0, 20).map((c, i) => (
                    <div
                      key={`${c.id}-${i}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-xs truncate">{c.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground shrink-0 ml-2">
                        {c.type.replace("_", " ")}
                        {c.width && c.height ? ` · ${Math.round(c.width)}×${Math.round(c.height)}` : ""}
                      </span>
                    </div>
                  ))}
                  {tokens.components.length > 20 && (
                    <p className="text-[9px] text-muted-foreground text-center">
                      +{tokens.components.length - 20} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Layout */}
            {tokens.layout.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <LayoutGrid className="h-3 w-3" /> Layout ({tokens.layout.length})
                </h3>
                <div className="space-y-1.5">
                  {tokens.layout.slice(0, 10).map((l, i) => (
                    <div
                      key={`${l.nodeId}-${i}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2"
                    >
                      <span className="text-xs truncate">{l.name}</span>
                      <span className="text-[9px] font-mono text-muted-foreground shrink-0 ml-2">
                        {l.layoutMode}{l.gap ? ` · gap ${l.gap}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Apply button */}
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-all ${
                applied
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {applied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Applied to Project
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Apply to Project
                </>
              )}
            </button>
          </>
        )}

        {/* Empty state */}
        {!tokens && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Layers className="h-10 w-10 opacity-20" />
            <p className="text-xs text-center max-w-[200px] leading-relaxed">
              Paste a Figma file or frame URL above to extract design tokens for your app.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Extracting design tokens…</p>
          </div>
        )}
      </div>
    </div>
  );
}
