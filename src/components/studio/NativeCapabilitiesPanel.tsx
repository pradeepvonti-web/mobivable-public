/**
 * Compact panel that lists the native capabilities wired onto a project.
 *
 * Read-only for v1 — mutations happen via the MCP tools
 * (add_push_notifications, add_stripe_iap, add_camera_capture,
 * add_biometrics, remove_native_capability). The /agent route is the
 * recommended path for users; external IDEs hit the same tools through
 * the public MCP endpoint.
 *
 * v2 will add an inline "Add capability" picker so users can wire
 * features without leaving the project page.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CreditCard, Camera, Fingerprint, Loader2, Sparkles } from "lucide-react";
import { listProjectNativeCapabilities } from "@/lib/native-capabilities.functions";
import {
  NATIVE_CAPABILITIES,
  type NativeCapabilityId,
  type NativeCapabilityRow,
} from "@/lib/native-capabilities";

const ICONS: Record<NativeCapabilityId, typeof Bell> = {
  push_notifications: Bell,
  stripe_payments: CreditCard,
  camera: Camera,
  biometrics: Fingerprint,
};

export function NativeCapabilitiesPanel({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<NativeCapabilityRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const listFn = useServerFn(listProjectNativeCapabilities);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await listFn({ data: { projectId } });
        if (cancelled) return;
        if (res.ok) setRows(res.capabilities);
        else setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, listFn]);

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading native capabilities…
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          No native capabilities wired yet
        </p>
        <p>
          Ask the agent (in <code>/agent</code>) or your MCP client to{" "}
          <code className="font-mono">add_push_notifications</code>,{" "}
          <code className="font-mono">add_stripe_iap</code>,{" "}
          <code className="font-mono">add_camera_capture</code>, or{" "}
          <code className="font-mono">add_biometrics</code> on this project.
          The next export will include all the right deps, app.json plugins,
          iOS Info.plist strings, and Android permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const spec = NATIVE_CAPABILITIES[row.id];
        if (!spec) return null;
        const Icon = ICONS[row.id] ?? Sparkles;
        return (
          <div
            key={row.id}
            className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
          >
            <div className="h-8 w-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{spec.label}</p>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  added by {row.added_by}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{spec.summary}</p>
              {Object.keys(row.config).length > 0 && (
                <p className="text-[10px] mt-1 text-muted-foreground font-mono">
                  configured: {Object.keys(row.config).join(", ")}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
