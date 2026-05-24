import { useState } from "react";
import { Rocket, CheckCircle2, Clock, AlertCircle, ExternalLink, RefreshCw, Smartphone, Globe, GitBranch, Download, Package } from "lucide-react";
import { toast } from "sonner";

type Build = { id: string; platform: "ios" | "android" | "web"; status: "success" | "building" | "failed" | "queued"; version: string; date: string; size: string; duration: string; artifact: string };

const BUILDS: Build[] = [
  { id: "b1", platform: "ios", status: "success", version: "1.0.3", date: "2 hours ago", size: "12.4 MB", duration: "4m 23s", artifact: "Mobivable-1.0.3.ipa" },
  { id: "b2", platform: "android", status: "success", version: "1.0.3", date: "2 hours ago", size: "8.7 MB", duration: "3m 51s", artifact: "Mobivable-1.0.3.apk" },
  { id: "b3", platform: "ios", status: "success", version: "1.0.2", date: "3 days ago", size: "12.1 MB", duration: "4m 12s", artifact: "Mobivable-1.0.2.ipa" },
  { id: "b4", platform: "android", status: "failed", version: "1.0.2", date: "3 days ago", size: "—", duration: "1m 04s", artifact: "Mobivable-1.0.2.apk" },
  { id: "b5", platform: "web", status: "success", version: "1.0.1", date: "1 week ago", size: "3.2 MB", duration: "45s", artifact: "Mobivable-1.0.1.zip" },
];

const statusConfig = {
  success: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Success" },
  building: { icon: RefreshCw, color: "text-blue-500", bg: "bg-blue-500/10", label: "Building" },
  failed: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
  queued: { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", label: "Queued" },
};

const platformConfig = {
  ios: { icon: "🍎", label: "iOS", color: "text-blue-400" },
  android: { icon: "🤖", label: "Android", color: "text-emerald-400" },
  web: { icon: "🌐", label: "Web", color: "text-violet-400" },
};

export function DeploymentsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [builds] = useState<Build[]>(BUILDS);
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "ios" | "android" | "web">("all");

  const filtered = selectedPlatform === "all" ? builds : builds.filter(b => b.platform === selectedPlatform);
  const successCount = builds.filter(b => b.status === "success").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Deployments</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{successCount} successful builds</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Close</button>
      </div>

      {/* New build */}
      <div className="p-4 border-b border-border">
        <button
          type="button"
          onClick={() => toast.info("EAS Build integration coming soon! Use Export to download the project for now.")}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <Rocket className="h-4 w-4" />
          New Build
        </button>
        <div className="flex gap-2 mt-3">
          {(["all", "ios", "android", "web"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPlatform(p)}
              className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium capitalize transition-all ${
                selectedPlatform === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {p === "all" ? "All" : platformConfig[p].icon + " " + platformConfig[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* Build history */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map(build => {
          const s = statusConfig[build.status];
          const p = platformConfig[build.platform];
          const StatusIcon = s.icon;
          return (
            <div key={build.id} className="rounded-xl border border-border p-4 hover:border-primary/20 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`h-8 w-8 rounded-lg ${s.bg} grid place-items-center`}>
                  <StatusIcon className={`h-4 w-4 ${s.color} ${build.status === "building" ? "animate-spin" : ""}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-xs font-semibold">{p.label} Build</span>
                    <span className={`text-[9px] font-mono uppercase tracking-widest ${s.color}`}>{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><GitBranch className="h-2.5 w-2.5" />v{build.version}</span>
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{build.duration}</span>
                    <span>{build.size}</span>
                  </div>
                </div>
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">{build.date}</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-xs">No builds for this platform yet.</div>
        )}
      </div>

      {/* Environment info */}
      <div className="p-4 border-t border-border">
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Build Environment</h4>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Expo SDK</span><span className="font-mono">51.0.0</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">React Native</span><span className="font-mono">0.74.5</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Node.js</span><span className="font-mono">20.11.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
