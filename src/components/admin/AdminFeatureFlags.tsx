import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Loader2, Check, X, Sparkles, Download, Camera, Users, Database, FolderKanban } from "lucide-react";
import { getFeatureFlags } from "@/lib/admin.functions";

type Flags = Awaited<ReturnType<typeof getFeatureFlags>>;

const FLAG_META: { key: keyof Flags; label: string; desc: string; icon: any }[] = [
  { key: "aiEnabled", label: "AI Generation", desc: "Code gen, chat, agents, and image generation", icon: Sparkles },
  { key: "exportEnabled", label: "Expo Export", desc: "Download ZIP of generated Expo/React Native project", icon: Download },
  { key: "screenshotsEnabled", label: "Screenshot Gallery", desc: "Capture and download device-framed screenshots", icon: Camera },
  { key: "agentWorkspaceEnabled", label: "Agent Workspace", desc: "Multi-agent pipeline for project planning", icon: Users },
  { key: "backendEnabled", label: "Backend (Pro)", desc: "Supabase backend integration for projects", icon: Database },
  { key: "signupEnabled", label: "User Signup", desc: "Allow new user registration", icon: FolderKanban },
];

export function AdminFeatureFlags() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getFeatureFlags);

  useEffect(() => {
    fn().then(setFlags).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!flags) return <p className="text-destructive text-sm">Failed to load flags.</p>;

  const activeCount = FLAG_META.filter((f) => flags[f.key]).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Feature Flags</h2>
        <p className="text-sm text-muted-foreground mt-1">{activeCount}/{FLAG_META.length} features enabled</p>
      </div>

      {/* Feature toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FLAG_META.map(({ key, label, desc, icon: Icon }) => {
          const enabled = !!flags[key];
          return (
            <div key={key} className={`rounded-2xl border p-5 transition-all ${
              enabled ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card/40"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl grid place-items-center ${
                  enabled ? "bg-emerald-500/15" : "bg-muted"
                }`}>
                  <Icon className={`h-5 w-5 ${enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <div className={`h-6 w-6 rounded-full grid place-items-center ${
                  enabled ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Limits */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="font-display text-lg">Platform Limits</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max Projects / User</p>
            <p className="text-2xl font-display mt-1">{flags.maxProjectsPerUser}</p>
            <p className="text-[9px] text-muted-foreground mt-1">Set via MAX_PROJECTS_PER_USER env var</p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max Messages / Project</p>
            <p className="text-2xl font-display mt-1">{flags.maxMessagesPerProject}</p>
            <p className="text-[9px] text-muted-foreground mt-1">Set via MAX_MESSAGES_PER_PROJECT env var</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Note:</strong> Feature flags are currently read from environment variables and server state. 
          AI Generation is automatically enabled when any AI provider API key is configured. 
          To toggle other features, modify the <code className="text-[10px] bg-card px-1 py-0.5 rounded font-mono">getFeatureFlags</code> function 
          in <code className="text-[10px] bg-card px-1 py-0.5 rounded font-mono">admin.functions.ts</code> or add a database-backed flag system.
        </p>
      </div>
    </div>
  );
}
