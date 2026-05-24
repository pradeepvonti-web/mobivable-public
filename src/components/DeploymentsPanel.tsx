import { useState } from "react";
import { Rocket, Smartphone, Info } from "lucide-react";

export function DeploymentsPanel({ projectId: _projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "ios" | "android" | "web">("all");

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
              EAS Build not yet connected
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Close</button>
      </div>

      <div className="p-4 border-b border-border">
        <div className="flex gap-2">
          {(["all", "ios", "android", "web"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPlatform(p)}
              className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium capitalize transition-all ${
                selectedPlatform === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-muted/30 grid place-items-center">
          <Smartphone className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5 max-w-[280px]">
          <h3 className="text-sm font-semibold">No builds yet</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            APK / IPA generation requires an Expo Application Services connection. We'll surface real builds and downloadable artifacts here once that integration is wired up.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-3 text-left max-w-[320px] w-full">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              For now, use <span className="text-foreground font-medium">Code Export</span> to download the React Native source and build locally with <span className="font-mono text-foreground">eas build</span>.
            </p>
          </div>
        </div>
      </div>

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
