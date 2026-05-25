import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History,
  Save,
  RotateCcw,
  Trash2,
  Loader2,
  Clock,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
} from "@/lib/version-history.functions";

type SnapshotRow = {
  id: string;
  label: string;
  source: string;
  element_count: number;
  screen_count: number;
  created_at: string;
};

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
  const restoreFn = useServerFn(restoreSnapshot);
  const deleteFn = useServerFn(deleteSnapshot);

  const [label, setLabel] = useState("");

  const snapshotsQ = useQuery({
    queryKey: ["snapshots", projectId],
    queryFn: () => fetchSnapshots({ data: { projectId } }),
    staleTime: 10_000,
  });

  const snapshots: SnapshotRow[] =
    snapshotsQ.data?.ok ? ((snapshotsQ.data as unknown as { ok: true; snapshots: SnapshotRow[] }).snapshots) : [];

  const saveMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          label: label.trim() || undefined,
          source: "manual" as const,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Snapshot saved");
      setLabel("");
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
      toast.success("Snapshot restored");
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

  const handleRestore = useCallback(
    (snapshotId: string, snapshotLabel: string) => {
      if (
        !window.confirm(
          `Restore "${snapshotLabel}"? A backup of your current state will be saved automatically.`
        )
      )
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

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <header className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
            <History className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base truncate">
              Version History
            </h2>
            <p className="text-[10px] text-muted-foreground truncate">
              {snapshots.length} snapshot{snapshots.length !== 1 && "s"} saved
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
      </header>

      {/* Save new snapshot */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Snapshot label (optional)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saveMut.isPending) saveMut.mutate();
            }}
          />
          <button
            type="button"
            disabled={saveMut.isPending || !currentSchema}
            onClick={() => saveMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
        {!currentSchema && (
          <p className="text-[10px] text-muted-foreground italic">
            Generate a schema first to save snapshots.
          </p>
        )}
      </div>

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        {snapshotsQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="h-12 w-12 mx-auto rounded-xl bg-muted/30 grid place-items-center">
              <History className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                No snapshots yet
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Save a snapshot to track changes and enable rollback
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline connector line */}
            <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

            <div className="space-y-1">
              {snapshots.map((snap, i) => (
                <div key={snap.id} className="relative pl-8 group">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-[7px] top-3.5 h-[9px] w-[9px] rounded-full border-2 z-10 ${
                      snap.source === "manual"
                        ? "border-primary bg-primary/30"
                        : "border-muted-foreground/40 bg-card"
                    }`}
                  />

                  <div className="rounded-xl border border-border bg-card/60 p-3 hover:border-primary/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground truncate">
                            {snap.label}
                          </span>
                          <span
                            className={`text-[8px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded-full border ${
                              snap.source === "manual"
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            {snap.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span>{snap.screen_count} screen{snap.screen_count !== 1 && "s"}</span>
                          <span>·</span>
                          <span>{snap.element_count} element{snap.element_count !== 1 && "s"}</span>
                          <span className="ml-auto flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatTime(snap.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/50">
                      <button
                        type="button"
                        disabled={restoreMut.isPending}
                        onClick={() => handleRestore(snap.id, snap.label)}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
                      >
                        {restoreMut.isPending &&
                        restoreMut.variables === snap.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => handleDelete(snap.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 ml-auto"
                      >
                        {deleteMut.isPending &&
                        deleteMut.variables === snap.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
