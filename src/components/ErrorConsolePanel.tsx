import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, XCircle, Info, Trash2, ChevronDown, Terminal } from "lucide-react";

export type LogLevel = "error" | "warn" | "info" | "log";

export interface ConsoleEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  source?: string;
  count?: number;
}

interface ErrorConsolePanelProps {
  entries: ConsoleEntry[];
  onClear: () => void;
  onClose: () => void;
}

const LEVEL_CONFIG: Record<LogLevel, { icon: any; color: string; bg: string }> = {
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  warn: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  log: { icon: Terminal, color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

const LEVEL_FILTERS: LogLevel[] = ["error", "warn", "info", "log"];

export function ErrorConsolePanel({ entries, onClear, onClose }: ErrorConsolePanelProps) {
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = filter === "all" ? entries : entries.filter((e) => e.level === filter);

  const counts = {
    error: entries.filter((e) => e.level === "error").length,
    warn: entries.filter((e) => e.level === "warn").length,
    info: entries.filter((e) => e.level === "info").length,
    log: entries.filter((e) => e.level === "log").length,
  };

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/50">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Console</span>
          {counts.error > 0 && (
            <span className="text-[9px] font-mono bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full">
              {counts.error} error{counts.error > 1 ? "s" : ""}
            </span>
          )}
          {counts.warn > 0 && (
            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full">
              {counts.warn} warn
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Filter buttons */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2 py-1 rounded text-[9px] font-mono transition-colors ${
                filter === "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({entries.length})
            </button>
            {LEVEL_FILTERS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setFilter(lvl)}
                className={`px-2 py-1 rounded text-[9px] font-mono transition-colors ${
                  filter === lvl ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lvl} ({counts[lvl]})
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClear}
            title="Clear console"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {entries.length === 0 ? "No console output yet." : "No entries match this filter."}
          </div>
        ) : (
          filtered.map((entry) => {
            const config = LEVEL_CONFIG[entry.level];
            const Icon = config.icon;
            const isExpanded = expanded.has(entry.id);
            const isLong = entry.message.length > 200;

            return (
              <div
                key={entry.id}
                className={`flex items-start gap-2 px-4 py-2 border-b ${config.bg} transition-colors hover:opacity-90`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div
                    className={`whitespace-pre-wrap break-all ${isLong && !isExpanded ? "line-clamp-3" : ""}`}
                    onClick={isLong ? () => toggleExpand(entry.id) : undefined}
                    style={isLong ? { cursor: "pointer" } : undefined}
                  >
                    {entry.message}
                  </div>
                  {entry.source && (
                    <span className="text-[9px] text-muted-foreground mt-0.5 block">{entry.source}</span>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {(entry.count ?? 1) > 1 && (
                    <span className="text-[8px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      ×{entry.count}
                    </span>
                  )}
                  <span className="text-[8px] text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Hook to capture console messages from the preview iframe or window. */
export function useConsoleCapture() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  let counter = 0;

  const addEntry = useCallback((level: LogLevel, message: string, source?: string) => {
    setEntries((prev) => {
      // Dedupe consecutive identical messages
      const last = prev[prev.length - 1];
      if (last && last.message === message && last.level === level) {
        return prev.map((e, i) =>
          i === prev.length - 1 ? { ...e, count: (e.count ?? 1) + 1, timestamp: Date.now() } : e,
        );
      }
      return [
        ...prev,
        { id: `log-${Date.now()}-${counter++}`, level, message, timestamp: Date.now(), source, count: 1 },
      ].slice(-200); // Keep last 200 entries
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, addEntry, clear };
}
