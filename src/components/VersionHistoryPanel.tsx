import { useCallback, useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History,
  Save,
  RotateCcw,
  Trash2,
  Loader2,
  Clock,
  GitBranch,
  GitCommit,
  GitCompare,
  Tag,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Minus,
  ArrowRight,
  Check,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from "@/lib/version-history.functions";

// ─── Types ──────────────────────────────────────────────────────

type SnapshotRow = {
  id: string;
  label: string;
  source: string;
  element_count: number;
  screen_count: number;
  created_at: string;
};

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNum: number;
};

type DiffResult = {
  added: number;
  removed: number;
  unchanged: number;
  lines: DiffLine[];
};

// ─── Diff Engine ────────────────────────────────────────────────

function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table (memory-optimized for reasonable sizes)
  if (m > 5000 || n > 5000) {
    // For very large files, fall back to simple line-by-line comparison
    return simpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const lines: DiffLine[] = [];
  let i = m, j = n;
  const result: Array<{ type: "added" | "removed" | "unchanged"; content: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "unchanged", content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", content: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", content: oldLines[i - 1] });
      i--;
    }
  }

  let added = 0, removed = 0, unchanged = 0;
  result.forEach((r, idx) => {
    lines.push({ ...r, lineNum: idx + 1 });
    if (r.type === "added") added++;
    else if (r.type === "removed") removed++;
    else unchanged++;
  });

  return { added, removed, unchanged, lines };
}

function simpleDiff(oldLines: string[], newLines: string[]): DiffResult {
  const lines: DiffLine[] = [];
  let added = 0, removed = 0, unchanged = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (i < oldLines.length && i < newLines.length) {
      if (oldLines[i] === newLines[i]) {
        lines.push({ type: "unchanged", content: oldLines[i], lineNum: i + 1 });
        unchanged++;
      } else {
        lines.push({ type: "removed", content: oldLines[i], lineNum: i + 1 });
        lines.push({ type: "added", content: newLines[i], lineNum: i + 1 });
        removed++;
        added++;
      }
    } else if (i < oldLines.length) {
      lines.push({ type: "removed", content: oldLines[i], lineNum: i + 1 });
      removed++;
    } else {
      lines.push({ type: "added", content: newLines[i], lineNum: i + 1 });
      added++;
    }
  }

  return { added, removed, unchanged, lines };
}

// ─── Component ──────────────────────────────────────────────────

export function VersionHistoryPanel({
  projectId,
  currentSchema,
  onClose,
  onRestore,
}: {
  projectId: string;
  currentSchema: string | null;
  onClose: () => void;
  onRestore: () => void;
}) {
  const qc = useQueryClient();
  const fetchSnapshots = useServerFn(listSnapshots);
  const createFn = useServerFn(createSnapshot);
  const fetchSnapshot = useServerFn(getSnapshot);
  const restoreFn = useServerFn(restoreSnapshot);
  const deleteFn = useServerFn(deleteSnapshot);

  const [label, setLabel] = useState("");
  const [branchTag, setBranchTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  // Diff view state
  const [diffMode, setDiffMode] = useState(false);
  const [diffSource, setDiffSource] = useState<string | null>(null); // snapshot id or "__current__"
  const [diffTarget, setDiffTarget] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffCollapsed, setDiffCollapsed] = useState(false);

  // Preview snapshot
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const snapshotsQ = useQuery({
    queryKey: ["snapshots", projectId],
    queryFn: () => fetchSnapshots({ data: { projectId } }),
    staleTime: 10_000,
  });

  const snapshots: SnapshotRow[] =
    snapshotsQ.data?.ok ? ((snapshotsQ.data as unknown as { ok: true; snapshots: SnapshotRow[] }).snapshots) : [];

  // Branch tags from localStorage
  const [branchTags, setBranchTags] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(`mobivable:branches-tags:${projectId}`) ?? "{}");
    } catch { return {}; }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(`mobivable:branches-tags:${projectId}`, JSON.stringify(branchTags));
    } catch { /* ignore */ }
  }, [branchTags, projectId]);

  // ─── Mutations ────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          label: (branchTag ? `[${branchTag}] ` : "") + (label.trim() || "Auto-save"),
          source: "manual" as const,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Snapshot saved");
      if (branchTag && res.ok && 'snapshot' in res) {
        setBranchTags((prev) => ({ ...prev, [(res as any).snapshot.id]: branchTag }));
      }
      setLabel("");
      setBranchTag("");
      setShowTagInput(false);
      qc.invalidateQueries({ queryKey: ["snapshots", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: (snapshotId: string) =>
      restoreFn({ data: { projectId, snapshotId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error((res as { ok: false; error: string }).error);
        return;
      }
      toast.success("Snapshot restored — your previous state was backed up");
      qc.invalidateQueries({ queryKey: ["snapshots", projectId] });
      onRestore();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (snapshotId: string) =>
      deleteFn({ data: { snapshotId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error((res as { ok: false; error: string }).error);
        return;
      }
      toast("Snapshot deleted");
      qc.invalidateQueries({ queryKey: ["snapshots", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Diff computation ─────────────────────────────────────

  const runDiff = useCallback(async (sourceId: string, targetId: string) => {
    setDiffLoading(true);
    setDiffResult(null);
    try {
      let sourceText = "";
      let targetText = "";

      if (sourceId === "__current__") {
        sourceText = currentSchema ? JSON.stringify(JSON.parse(currentSchema), null, 2) : "";
      } else {
        const res = await fetchSnapshot({ data: { snapshotId: sourceId } });
        if (res.ok && 'snapshot' in res) {
          sourceText = JSON.stringify((res as any).snapshot.schema, null, 2);
        }
      }

      if (targetId === "__current__") {
        targetText = currentSchema ? JSON.stringify(JSON.parse(currentSchema), null, 2) : "";
      } else {
        const res = await fetchSnapshot({ data: { snapshotId: targetId } });
        if (res.ok && 'snapshot' in res) {
          targetText = JSON.stringify((res as any).snapshot.schema, null, 2);
        }
      }

      const diff = computeDiff(sourceText, targetText);
      setDiffResult(diff);
    } catch (e) {
      toast.error("Failed to compute diff");
    } finally {
      setDiffLoading(false);
    }
  }, [currentSchema, fetchSnapshot]);

  // ─── Preview snapshot ─────────────────────────────────────

  const previewSnapshot = useCallback(async (snapshotId: string) => {
    setPreviewLoading(true);
    setPreviewId(snapshotId);
    try {
      const res = await fetchSnapshot({ data: { snapshotId } });
      if (res.ok && 'snapshot' in res) {
        setPreviewContent(JSON.stringify((res as any).snapshot.schema, null, 2));
      }
    } catch {
      toast.error("Failed to load snapshot");
    } finally {
      setPreviewLoading(false);
    }
  }, [fetchSnapshot]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleRestore = useCallback(
    (snapshotId: string, snapshotLabel: string) => {
      if (!window.confirm(`Restore "${snapshotLabel}"?\nA backup of your current state will be saved automatically.`))
        return;
      restoreMut.mutate(snapshotId);
    },
    [restoreMut]
  );

  const handleDelete = useCallback(
    (snapshotId: string) => {
      if (!window.confirm("Delete this snapshot? This cannot be undone."))
        return;
      deleteMut.mutate(snapshotId);
    },
    [deleteMut]
  );

  const handleCompare = useCallback((snapshotId: string) => {
    setDiffSource("__current__");
    setDiffTarget(snapshotId);
    setDiffMode(true);
    setDiffCollapsed(false);
    runDiff("__current__", snapshotId);
  }, [runDiff]);

  // ─── Helpers ──────────────────────────────────────────────

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function extractBranch(label: string): { branch: string | null; msg: string } {
    const match = label.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) return { branch: match[1], msg: match[2] || label };
    return { branch: null, msg: label };
  }

  // Group snapshots by branch
  const groupedSnapshots = useMemo(() => {
    const groups: Record<string, SnapshotRow[]> = { main: [] };
    for (const snap of snapshots) {
      const { branch } = extractBranch(snap.label);
      const tag = branchTags[snap.id] ?? branch;
      const key = tag ?? "main";
      if (!groups[key]) groups[key] = [];
      groups[key].push(snap);
    }
    return groups;
  }, [snapshots, branchTags]);

  const branchNames = Object.keys(groupedSnapshots).sort((a, b) =>
    a === "main" ? -1 : b === "main" ? 1 : a.localeCompare(b)
  );

  const [activeBranch, setActiveBranch] = useState("main");
  const activeSnapshots = groupedSnapshots[activeBranch] ?? [];

  // ─── Render ───────────────────────────────────────────────

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[520px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 grid place-items-center shrink-0 shadow-sm">
            <GitCommit className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm uppercase tracking-tight">Version Control</h2>
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">
              {snapshots.length} commit{snapshots.length !== 1 && "s"} · {branchNames.length} branch{branchNames.length !== 1 && "es"}
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

      {/* Branch tabs */}
      {branchNames.length > 1 && (
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-1 overflow-x-auto bg-card/20" style={{ scrollbarWidth: 'none' }}>
          {branchNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveBranch(name)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors shrink-0 ${
                activeBranch === name
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <GitBranch className="h-3 w-3" />
              {name}
              <span className="text-[8px] px-1 py-0.5 rounded bg-muted/40">
                {groupedSnapshots[name]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Commit input */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-1.5">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Commit message (optional)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/50 transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saveMut.isPending) saveMut.mutate();
              }}
            />
            {showTagInput && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={branchTag}
                  onChange={(e) => setBranchTag(e.target.value)}
                  placeholder="Branch name (e.g. feature/auth)"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={saveMut.isPending || !currentSchema}
              onClick={() => saveMut.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saveMut.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitCommit className="h-3 w-3" />
              )}
              Commit
            </button>
            <button
              type="button"
              onClick={() => setShowTagInput((v) => !v)}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors text-center"
            >
              {showTagInput ? "Hide branch" : "+ Branch"}
            </button>
          </div>
        </div>
        {!currentSchema && (
          <p className="text-[10px] text-muted-foreground italic">
            Generate a schema first to save commits.
          </p>
        )}
      </div>

      {/* Diff View */}
      {diffMode && (
        <div className="border-b border-border" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
          <div className="px-4 py-2 flex items-center justify-between bg-card/30">
            <div className="flex items-center gap-2">
              <GitCompare className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Diff View
              </span>
              {diffResult && (
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-emerald-400">+{diffResult.added}</span>
                  <span className="text-red-400">-{diffResult.removed}</span>
                  <span className="text-muted-foreground/50">~{diffResult.unchanged}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDiffCollapsed((v) => !v)}
                className="h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {diffCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => { setDiffMode(false); setDiffResult(null); }}
                className="h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {!diffCollapsed && (
            <div className="max-h-[300px] overflow-auto bg-[#0a0a12]" style={{ scrollbarWidth: 'thin' }}>
              {diffLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Computing diff…</span>
                </div>
              ) : diffResult ? (
                <div className="font-mono text-[11px] leading-[1.6]">
                  {diffResult.lines.map((line, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        line.type === "added"
                          ? "bg-emerald-500/10"
                          : line.type === "removed"
                          ? "bg-red-500/10"
                          : ""
                      }`}
                    >
                      <span className={`w-8 shrink-0 text-right pr-2 select-none ${
                        line.type === "added"
                          ? "text-emerald-500/40"
                          : line.type === "removed"
                          ? "text-red-500/40"
                          : "text-white/10"
                      }`}>
                        {line.lineNum}
                      </span>
                      <span className={`w-4 shrink-0 text-center select-none ${
                        line.type === "added"
                          ? "text-emerald-400"
                          : line.type === "removed"
                          ? "text-red-400"
                          : "text-white/10"
                      }`}>
                        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                      </span>
                      <span className={`flex-1 px-2 whitespace-pre-wrap ${
                        line.type === "added"
                          ? "text-emerald-300"
                          : line.type === "removed"
                          ? "text-red-300"
                          : "text-white/40"
                      }`}>
                        {line.content}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Select two snapshots to compare
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview overlay */}
      {previewId && (
        <div className="border-b border-border" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
          <div className="px-4 py-2 flex items-center justify-between bg-card/30">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Snapshot Preview
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setPreviewId(null); setPreviewContent(null); }}
              className="h-5 w-5 grid place-items-center rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-[200px] overflow-auto bg-[#0a0a12] font-mono text-[10px] text-emerald-300/80 leading-[1.6] p-3" style={{ scrollbarWidth: 'thin' }}>
            {previewLoading ? (
              <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap">{previewContent}</pre>
            )}
          </div>
        </div>
      )}

      {/* Commit log (Git-style timeline) */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0" style={{ scrollbarWidth: 'thin' }}>
        {snapshotsQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : activeSnapshots.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="h-12 w-12 mx-auto rounded-xl bg-muted/30 grid place-items-center">
              <GitCommit className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">No commits yet</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Save a commit to track changes and enable rollback
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-1">
              {activeSnapshots.map((snap, i) => {
                const { branch, msg } = extractBranch(snap.label);
                const tag = branchTags[snap.id] ?? branch;
                const isLatest = i === 0;
                const isManual = snap.source === "manual";

                return (
                  <div key={snap.id} className="relative pl-7 group" style={{ animation: `fadeInUp ${0.1 + i * 0.05}s ease-out` }}>
                    {/* Commit dot */}
                    <div
                      className={`absolute left-[5px] top-3 h-[10px] w-[10px] rounded-full border-2 z-10 transition-colors ${
                        isLatest
                          ? "border-primary bg-primary shadow-sm shadow-primary/30"
                          : isManual
                          ? "border-primary/60 bg-primary/20"
                          : "border-muted-foreground/30 bg-card"
                      }`}
                    />

                    <div className={`rounded-xl border bg-card/60 p-3 transition-all ${
                      isLatest
                        ? "border-primary/30 shadow-sm shadow-primary/5"
                        : "border-border hover:border-primary/20"
                    }`}>
                      {/* Commit header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-foreground truncate">
                              {msg}
                            </span>
                            {isLatest && (
                              <span className="text-[8px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                                HEAD
                              </span>
                            )}
                            {tag && (
                              <span className="text-[8px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                                <GitBranch className="h-2 w-2" />
                                {tag}
                              </span>
                            )}
                            <span
                              className={`text-[8px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded-full border ${
                                isManual
                                  ? "border-primary/20 bg-primary/5 text-primary/70"
                                  : "border-border bg-muted/20 text-muted-foreground/60"
                              }`}
                            >
                              {snap.source}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>{snap.screen_count} screen{snap.screen_count !== 1 && "s"}</span>
                            <span>·</span>
                            <span>{snap.element_count} element{snap.element_count !== 1 && "s"}</span>
                            <span className="ml-auto flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatTime(snap.created_at)}
                            </span>
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground/30 mt-0.5">
                            {snap.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={restoreMut.isPending}
                          onClick={() => handleRestore(snap.id, snap.label)}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompare(snap.id)}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <GitCompare className="h-3 w-3" />
                          Diff
                        </button>
                        <button
                          type="button"
                          onClick={() => previewSnapshot(snap.id)}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                        <button
                          type="button"
                          disabled={deleteMut.isPending}
                          onClick={() => handleDelete(snap.id)}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40 ml-auto"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
