import { useState, useCallback, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  Square,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Loader2,
  Trash2,
  Copy,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  Zap,
  Clock,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import { executeSandbox, validateCode } from "@/lib/e2b-sandbox.functions";
import type { SandboxLogEntry, SandboxResult } from "@/lib/e2b-sandbox.functions";

// ─── Log Entry Component ────────────────────────────────────────

function LogEntry({ entry }: { entry: SandboxLogEntry }) {
  const icons: Record<string, React.ReactNode> = {
    stdout: <Terminal className="h-3 w-3 text-emerald-400 shrink-0" />,
    stderr: <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />,
    result: <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0" />,
    error: <XCircle className="h-3 w-3 text-red-400 shrink-0" />,
    info: <Info className="h-3 w-3 text-muted-foreground shrink-0" />,
  };

  const colors: Record<string, string> = {
    stdout: "text-emerald-300",
    stderr: "text-amber-300",
    result: "text-blue-300",
    error: "text-red-300",
    info: "text-muted-foreground",
  };

  const bgColors: Record<string, string> = {
    stdout: "",
    stderr: "bg-amber-500/5",
    result: "bg-blue-500/5",
    error: "bg-red-500/5",
    info: "",
  };

  return (
    <div className={`flex items-start gap-2 px-3 py-1 ${bgColors[entry.type] ?? ""}`}>
      {icons[entry.type]}
      <span className={`text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all ${colors[entry.type] ?? ""}`}>
        {entry.content}
      </span>
    </div>
  );
}

// ─── SandboxPanel ───────────────────────────────────────────────

export function SandboxPanel({
  projectId,
  code,
  language,
  onClose,
}: {
  projectId: string;
  code: string;
  language?: string;
  onClose: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [logs, setLogs] = useState<SandboxLogEntry[]>([]);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [validationResult, setValidationResult] = useState<{
    safe: boolean;
    issues: string[];
    stats: { lineCount: number; importCount: number; funcCount: number };
    syntaxValid: boolean;
  } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const executeFn = useServerFn(executeSandbox);
  const validateFn = useServerFn(validateCode);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ─── Run in sandbox ─────────────────────────────────────────

  const handleRun = useCallback(async () => {
    setRunning(true);
    setLogs([]);
    setResult(null);

    try {
      const res = await executeFn({
        data: {
          code,
          language: (language === "typescriptreact" || language === "typescript")
            ? "typescript"
            : "javascript",
          timeout: 10000,
          projectId,
        },
      });

      setLogs(res.logs);
      setResult(res);

      if (res.ok) {
        toast.success(`Execution complete (${(res.executionTimeMs / 1000).toFixed(1)}s)`);
      } else {
        toast.error("Execution failed", { description: res.error });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to execute";
      setLogs((prev) => [
        ...prev,
        { type: "error" as const, content: errorMsg, timestamp: Date.now() },
      ]);
      toast.error(errorMsg);
    } finally {
      setRunning(false);
    }
  }, [code, language, projectId, executeFn]);

  // ─── Validate code ─────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const res = await validateFn({
        data: {
          code,
          language: (language === "typescriptreact" || language === "typescript")
            ? "typescript"
            : "javascript",
        },
      });

      if (res.ok) {
        setValidationResult(res);
        if (res.safe && res.syntaxValid) {
          toast.success("Code is safe to execute");
        } else {
          toast.warning("Issues found in code");
        }
      }
    } catch (e) {
      toast.error("Validation failed");
    } finally {
      setValidating(false);
    }
  }, [code, language, validateFn]);

  // ─── Copy logs ────────────────────────────────────────────

  const handleCopyLogs = useCallback(() => {
    const text = logs.map((l) => `[${l.type.toUpperCase()}] ${l.content}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  // ─── Clear ─────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setLogs([]);
    setResult(null);
    setValidationResult(null);
  }, []);

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[520px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 grid place-items-center shrink-0 shadow-sm">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm uppercase tracking-tight">E2B Sandbox</h2>
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">
              Secure Code Execution
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Status bar */}
      <div className="px-4 py-2 border-b border-border bg-card/20 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {result ? (
            result.ok ? (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-400" />
            )
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground/40" />
          )}
          <span className={`text-[10px] font-mono uppercase tracking-widest ${
            result ? (result.ok ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
          }`}>
            {running
              ? "Running..."
              : result
              ? result.ok
                ? "Passed"
                : "Failed"
              : "Ready"}
          </span>
        </div>

        {result && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {(result.executionTimeMs / 1000).toFixed(1)}s
            </span>
            <span className="flex items-center gap-0.5">
              <Terminal className="h-3 w-3" />
              {logs.filter((l) => l.type !== "info").length} outputs
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !code.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20"
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {running ? "Running..." : "Run in Sandbox"}
        </button>

        <button
          type="button"
          onClick={handleValidate}
          disabled={validating || !code.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-40"
        >
          {validating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          Validate
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30"
            title="Copy logs"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0 && !result}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30"
            title="Clear output"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Validation result */}
      {validationResult && (
        <div className="px-4 py-2.5 border-b border-border space-y-2" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
          <div className="flex items-center gap-2">
            {validationResult.safe ? (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            )}
            <span className={`text-xs font-medium ${validationResult.safe ? "text-emerald-400" : "text-amber-400"}`}>
              {validationResult.safe ? "Code is safe" : `${validationResult.issues.length} issue(s) found`}
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <Code2 className="h-3 w-3" />
              {validationResult.stats.lineCount} lines
            </span>
            <span>{validationResult.stats.importCount} imports</span>
            <span>{validationResult.stats.funcCount} declarations</span>
            <span className={`flex items-center gap-1 ${
              validationResult.syntaxValid ? "text-emerald-400" : "text-red-400"
            }`}>
              {validationResult.syntaxValid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              Syntax
            </span>
          </div>

          {/* Issues */}
          {validationResult.issues.length > 0 && (
            <div className="space-y-1 mt-1">
              {validationResult.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-amber-300">{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Console output */}
      <div className="flex-1 flex flex-col min-h-0">
        <button
          type="button"
          onClick={() => setConsoleOpen((v) => !v)}
          className="px-3 py-1.5 border-b border-border bg-[#0d0d15] flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <Terminal className="h-3 w-3" />
          Console
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-[9px]">
              {logs.length}
            </span>
          )}
          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${consoleOpen ? "" : "-rotate-90"}`} />
        </button>

        {consoleOpen && (
          <div className="flex-1 overflow-y-auto bg-[#0a0a12]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted/10 grid place-items-center">
                  <Terminal className="h-6 w-6 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground/60">No output yet</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-1">
                    Click "Run in Sandbox" to execute code safely
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-1">
                {logs.map((entry, i) => (
                  <LogEntry key={i} entry={entry} />
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-1.5 flex items-center justify-between text-[9px] font-mono bg-[#0d0d15]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            E2B Sandbox
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span>Isolated execution</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground/50">
          <span>Max 30s timeout</span>
          <span className="text-muted-foreground/40">|</span>
          <span>100KB limit</span>
        </div>
      </div>
    </section>
  );
}
