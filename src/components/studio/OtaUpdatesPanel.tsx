/**
 * OTA / EAS Update panel.
 *
 * Three vertical sections:
 *   1. Config — EAS project id + Expo owner. Once set, the next export
 *      embeds the expo-updates plugin + Update URL automatically.
 *   2. Publish — pick a channel (preview / production / custom), add a
 *      release note, hit Publish. The server records the intent and
 *      returns CLI instructions until the publish-runner worker ships.
 *   3. History — recent publishes per project, with status pills and a
 *      link to the EAS dashboard for the publish group.
 *
 * Channels are free-form strings — preview / production are the
 * conventional defaults but the panel doesn't lock the user in.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  getOtaStatus,
  upsertOtaConfig,
  recordOtaPublish,
  type OtaConfig,
  type OtaPublishRow,
  type OtaPublishInstructions,
} from "@/lib/ota-updates.functions";

const CHANNEL_DEFAULTS = ["preview", "production"];

export function OtaUpdatesPanel({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<OtaConfig | null>(null);
  const [publishes, setPublishes] = useState<OtaPublishRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Config form state
  const [editingConfig, setEditingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState({ easProjectId: "", owner: "" });
  const [savingConfig, setSavingConfig] = useState(false);

  // Publish form state
  const [channel, setChannel] = useState("preview");
  const [customChannel, setCustomChannel] = useState("");
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [latestInstructions, setLatestInstructions] = useState<
    OtaPublishInstructions | null
  >(null);

  const getFn = useServerFn(getOtaStatus);
  const upsertFn = useServerFn(upsertOtaConfig);
  const publishFn = useServerFn(recordOtaPublish);

  async function refresh() {
    const res = await getFn({ data: { projectId } });
    if (res.ok) {
      setConfig(res.config);
      setPublishes(res.publishes);
      if (res.config) {
        setConfigDraft({
          easProjectId: res.config.easProjectId,
          owner: res.config.owner,
        });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function saveConfig() {
    const easProjectId = configDraft.easProjectId.trim();
    const owner = configDraft.owner.trim();
    if (!easProjectId || !owner) {
      toast.error("Both EAS project id and Expo owner are required.");
      return;
    }
    setSavingConfig(true);
    try {
      const res = await upsertFn({
        data: { projectId, easProjectId, owner },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await refresh();
      setEditingConfig(false);
      toast.success("OTA config saved");
    } finally {
      setSavingConfig(false);
    }
  }

  async function doPublish() {
    if (publishing) return;
    const finalChannel = channel === "__custom" ? customChannel.trim() : channel;
    if (!finalChannel) {
      toast.error("Pick or type a channel name first.");
      return;
    }
    setPublishing(true);
    try {
      const res = await publishFn({
        data: {
          projectId,
          channel: finalChannel,
          message: message.trim() || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPublishes((prev) => [res.publish, ...prev]);
      setLatestInstructions(res.instructions);
      setMessage("");
      toast.success(`Recorded ${finalChannel} publish`);
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading OTA status…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Config ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
              EAS configuration
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {config
                ? `${config.owner} / ${config.easProjectId.slice(0, 8)}…`
                : "Not configured — exports won't include expo-updates."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingConfig((e) => !e)}
            className="h-7 px-2.5 text-xs rounded-md border border-border hover:bg-muted"
          >
            {config ? "Replace" : "Configure"}
          </button>
        </div>
        {editingConfig && (
          <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">
              Run <code>eas init</code> in any Expo project to get a project id,
              or copy it from the Expo dashboard. The owner is your Expo
              username.
            </p>
            <input
              type="text"
              value={configDraft.easProjectId}
              onChange={(e) =>
                setConfigDraft({ ...configDraft, easProjectId: e.target.value })
              }
              placeholder="EAS project id (UUID)"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
            <input
              type="text"
              value={configDraft.owner}
              onChange={(e) =>
                setConfigDraft({ ...configDraft, owner: e.target.value })
              }
              placeholder="Expo username (owner)"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveConfig}
                disabled={savingConfig}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {savingConfig ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Save config
              </button>
              <button
                type="button"
                onClick={() => setEditingConfig(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Publish ── */}
      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Publish update
        </h3>
        <p className="text-xs text-muted-foreground">
          Push a JS-only fix without a store rebuild. Apps with the matching
          <code className="mx-1">runtimeVersion</code>
          pick up the new bundle on next launch.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {CHANNEL_DEFAULTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            {channel === "__custom" && (
              <input
                type="text"
                value={customChannel}
                onChange={(e) => setCustomChannel(e.target.value)}
                placeholder="my-channel"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
              />
            )}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Release note (shown in the EAS dashboard)"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-y"
          />
          <button
            type="button"
            onClick={doPublish}
            disabled={publishing || !config}
            title={
              !config
                ? "Set the EAS project id + owner above first."
                : "Records the publish intent and shows the CLI command."
            }
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Publish
          </button>
        </div>

        {latestInstructions && (
          <InstructionsCard
            payload={latestInstructions}
            onDismiss={() => setLatestInstructions(null)}
          />
        )}
      </section>

      {/* ── History ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent publishes
          </h3>
          <button
            type="button"
            onClick={refresh}
            className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        {publishes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No publishes yet.</p>
        ) : (
          <div className="space-y-1.5">
            {publishes.slice(0, 12).map((p) => {
              const StatusIcon =
                p.status === "succeeded"
                  ? CheckCircle2
                  : p.status === "failed"
                    ? AlertTriangle
                    : Loader2;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs"
                >
                  <code className="font-mono text-[10px] uppercase tracking-wider w-24 truncate">
                    {p.channel}
                  </code>
                  <StatusIcon
                    className={
                      "h-3 w-3 " +
                      (p.status === "succeeded"
                        ? "text-emerald-500"
                        : p.status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground animate-spin")
                    }
                  />
                  <span className="flex-1 truncate text-muted-foreground">
                    {p.message ??
                      p.error_text ??
                      new Date(p.created_at).toLocaleString()}
                  </span>
                  {p.expo_update_group_id && (
                    <code className="font-mono text-[10px] text-muted-foreground">
                      {p.expo_update_group_id.slice(0, 7)}
                    </code>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function InstructionsCard({
  payload,
  onDismiss,
}: {
  payload: OtaPublishInstructions;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">Next steps</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <p className="text-muted-foreground">{payload.summary}</p>
      <pre className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-mono whitespace-pre-wrap break-all">
        {payload.command}
      </pre>
      <ol className="list-decimal pl-4 space-y-1 text-foreground">
        {payload.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
