import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Smartphone,
  Copy,
  Check,
  Loader2,
  Code2,
  X,
  FileText,
  Sparkles,
  Github,
  ExternalLink,
} from "lucide-react";

import { toast } from "sonner";
import { generateMobileCode } from "@/lib/pixlab.functions";
import {
  getGithubConnection,
  startGithubOAuth,
  pushCodeToGithub,
  disconnectGithub,
} from "@/lib/github.functions";

type Framework = "react_native" | "flutter" | "swiftui" | "jetpack_compose";

const FRAMEWORKS: { id: Framework; label: string; icon: string; lang: string }[] = [
  { id: "react_native", label: "React Native", icon: "⚛️", lang: "tsx" },
  { id: "flutter", label: "Flutter", icon: "🐦", lang: "dart" },
  { id: "swiftui", label: "SwiftUI", icon: "🍎", lang: "swift" },
  { id: "jetpack_compose", label: "Jetpack Compose", icon: "🤖", lang: "kotlin" },
];

const FRAMEWORK_FILENAME: Record<Framework, string> = {
  react_native: "App.tsx",
  flutter: "lib/main.dart",
  swiftui: "ContentView.swift",
  jetpack_compose: "MainActivity.kt",
};

export function CodeExportPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [framework, setFramework] = useState<Framework>("react_native");
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [designSpec, setDesignSpec] = useState("");
  const [showDesignSpec, setShowDesignSpec] = useState(false);

  const generateFn = useServerFn(generateMobileCode);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setCode(null);
    try {
      const res = await generateFn({
        data: {
          projectId,
          framework,
          designSpec: designSpec.trim() || undefined,
        },
      });
      if (!res.ok) {
        setError(res.error);
        toast.error("Code generation failed", { description: res.error });
      } else {
        setCode(res.code);
        toast.success("Code generated!", {
          description: `${res.frameworkLabel} code is ready`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate code";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [generateFn, projectId, framework, designSpec]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const activeFramework = FRAMEWORKS.find((f) => f.id === framework)!;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center">
            <Smartphone className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Code Export</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              PixLab AI Coder
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

      {/* Framework selector */}
      <div className="p-4 border-b border-border space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Target Framework
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FRAMEWORKS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFramework(f.id);
                setCode(null);
                setError(null);
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
                framework === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/20"
              }`}
            >
              <span className="text-lg">{f.icon}</span>
              <span className="text-xs font-medium">{f.label}</span>
            </button>
          ))}
        </div>
      </div>




      {/* Design spec toggle */}
      <div className="px-4 pt-3 pb-1">
        <button
          type="button"
          onClick={() => setShowDesignSpec(!showDesignSpec)}
          className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="h-3 w-3" />
          {showDesignSpec ? "Hide" : "Add"} Design Spec
        </button>
      </div>

      {showDesignSpec && (
        <div className="px-4 pb-3">
          <textarea
            value={designSpec}
            onChange={(e) => setDesignSpec(e.target.value)}
            placeholder="Paste your designer agent output or describe the UI you want..."
            rows={4}
            className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      )}

      {/* Generate button */}
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating {activeFramework.label}...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate {activeFramework.label} Code
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
            <div className="flex items-start gap-2">
              <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Generated code */}
      {code && (
        <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">
                {activeFramework.label} Output
              </span>
              <span className="text-[9px] font-mono text-muted-foreground">
                .{activeFramework.lang}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-[#0a0a0f] overflow-hidden min-h-0">
            <pre className="p-4 overflow-auto text-[10px] leading-relaxed font-mono text-emerald-300/90 h-full max-h-[55vh]">
              <code>{code}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!code && !error && !generating && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
          <Code2 className="h-10 w-10 opacity-20" />
          <p className="text-xs text-center max-w-[200px]">
            Select a framework and generate production-ready mobile code powered by PixLab AI.
          </p>
        </div>
      )}
    </div>
  );
}
