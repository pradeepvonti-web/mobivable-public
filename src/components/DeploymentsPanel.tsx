import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Smartphone, Loader2, RefreshCw, ExternalLink, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { getExpoAccount, startEasBuild, refreshEasBuild, listEasBuilds } from "@/lib/eas.functions";

type Platform = "android" | "ios";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s === "finished" || s === "success"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : s === "errored" || s === "canceled"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return (
    <span className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded border ${tone}`}>
      {s}
    </span>
  );
}

export function DeploymentsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fetchAccount = useServerFn(getExpoAccount);
  const fetchBuilds = useServerFn(listEasBuilds);
  const trigger = useServerFn(startEasBuild);
  const refresh = useServerFn(refreshEasBuild);

  const [platform, setPlatform] = useState<Platform>("android");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const accountQ = useQuery({
    queryKey: ["expoAccount"],
    queryFn: () => fetchAccount(),
    staleTime: 60_000,
    retry: false,
  });

  const buildsQ = useQuery({
    queryKey: ["easBuilds", projectId],
    queryFn: () => fetchBuilds({ data: { projectId } }),
    refetchInterval: 15_000,
  });

  const startMut = useMutation({
    mutationFn: () => trigger({ data: { projectId, platform } }),
    onSuccess: (res) => {
      if (!res.ok) {
        setErrMsg(res.error);
        setHint((res as any).hint || null);
      } else {
        setErrMsg(null);
        setHint(null);
      }
      qc.invalidateQueries({ queryKey: ["easBuilds", projectId] });
    },
    onError: (e: any) => setErrMsg(e?.message || "Build request failed."),
  });

  const refreshMut = useMutation({
    mutationFn: (buildRowId: string) => refresh({ data: { buildRowId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["easBuilds", projectId] }),
  });

  // Auto-refresh any non-terminal build once on mount
  useEffect(() => {
    const rows = buildsQ.data?.ok ? buildsQ.data.builds : [];
    rows.filter((b) => !["finished", "errored", "canceled"].includes((b.status || "").toLowerCase()))
      .slice(0, 3)
      .forEach((b) => refreshMut.mutate(b.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildsQ.data?.ok]);

  const account = accountQ.data?.ok ? accountQ.data : null;
  const builds = buildsQ.data?.ok ? buildsQ.data.builds : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Deployments</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {accountQ.isLoading
                ? "Checking Expo connection…"
                : account
                  ? `Connected as @${account.username}`
                  : "Expo not connected"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>

      {/* Connection status */}
      <div className="p-4 border-b border-border space-y-3">
        {accountQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying Expo token…
          </div>
        ) : account ? (
          <div className="flex items-center gap-2 text-[11px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-foreground">@{account.username}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {account.accounts.length} account{account.accounts.length === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-red-400 leading-relaxed">
              {accountQ.data?.ok === false ? accountQ.data.error : "Expo connection failed."}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {(["android", "ios"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex-1 rounded-lg py-2 text-[11px] font-medium capitalize transition-all ${
                platform === p ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted/30 border border-transparent"
              }`}
            >
              {p === "android" ? "Android APK" : "iOS Simulator"}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!account || startMut.isPending}
          onClick={() => startMut.mutate()}
          className="w-full rounded-lg py-2.5 text-[11px] font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {startMut.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting to EAS…
            </>
          ) : (
            <>
              <Smartphone className="h-3.5 w-3.5" />
              Build {platform === "android" ? "APK" : "iOS Sim"} on EAS
            </>
          )}
        </button>

        {errMsg && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-red-400 leading-relaxed">{errMsg}</div>
            </div>
            {hint && <div className="text-[10px] text-muted-foreground leading-relaxed pl-5">{hint}</div>}
          </div>
        )}
      </div>

      {/* Build history */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Builds</h3>
        {buildsQ.isLoading ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : builds.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No builds yet. Click the button above to start one.</p>
        ) : (
          builds.map((b) => (
            <div key={b.id} className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium capitalize">{b.platform}</span>
                  <StatusBadge status={b.status} />
                </div>
                <button
                  type="button"
                  onClick={() => refreshMut.mutate(b.id)}
                  disabled={refreshMut.isPending}
                  className="text-muted-foreground hover:text-foreground"
                  title="Refresh status"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshMut.isPending ? "animate-spin" : ""}`} />
                </button>
              </div>

              {b.error_text && (
                <p className="text-[10px] text-red-400 leading-relaxed line-clamp-3">{b.error_text}</p>
              )}

              <div className="flex flex-wrap gap-2 text-[10px]">
                {b.artifact_url && (
                  <a
                    href={b.artifact_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                  >
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
                {b.logs_url && (
                  <a
                    href={b.logs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" /> Logs
                  </a>
                )}
                <span className="text-muted-foreground ml-auto">
                  {new Date(b.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
