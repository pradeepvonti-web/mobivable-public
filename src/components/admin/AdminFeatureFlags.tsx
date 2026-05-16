import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Download, Camera, Users, Database, UserPlus, CreditCard } from "lucide-react";
import { getFeatureFlags, setFeatureFlag } from "@/lib/admin.functions";

type Flags = Awaited<ReturnType<typeof getFeatureFlags>>;

const FLAG_META: { key: keyof Flags; label: string; desc: string; icon: any }[] = [
  { key: "aiEnabled", label: "AI Generation", desc: "Code gen, chat, agents, and image generation", icon: Sparkles },
  { key: "exportEnabled", label: "Project Export", desc: "Download ZIP of generated projects", icon: Download },
  { key: "screenshotsEnabled", label: "Screenshot Gallery", desc: "Capture device-framed screenshots", icon: Camera },
  { key: "agentWorkspaceEnabled", label: "Agent Workspace", desc: "Multi-agent pipeline for planning", icon: Users },
  { key: "backendEnabled", label: "Backend Integration", desc: "Supabase backend for projects", icon: Database },
  { key: "signupEnabled", label: "User Signup", desc: "Allow new user registration", icon: UserPlus },
  { key: "paymentsEnabled", label: "Payments & Plans", desc: "Enable paid plans and checkout", icon: CreditCard },
];

export function AdminFeatureFlags() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const getFn = useServerFn(getFeatureFlags);
  const setFn = useServerFn(setFeatureFlag);

  useEffect(() => {
    getFn().then(setFlags).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Flags) {
    if (!flags) return;
    setSaving(key as string);
    const next = !flags[key];
    setFlags({ ...flags, [key]: next });
    try {
      await setFn({ data: { key: key as string, value: next } });
    } catch (e) {
      setFlags({ ...flags, [key]: !next });
      console.error(e);
    }
    setSaving(null);
  }

  async function updateLimit(key: "maxProjectsPerUser" | "maxMessagesPerProject", value: number) {
    if (!flags) return;
    setFlags({ ...flags, [key]: value });
    await setFn({ data: { key, value } }).catch(console.error);
  }

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!flags) return <p className="text-destructive text-sm">Failed to load flags.</p>;

  const activeCount = FLAG_META.filter((f) => flags[f.key]).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display uppercase text-2xl tracking-tight">Feature Control</h2>
        <p className="text-sm text-muted-foreground mt-1">{activeCount}/{FLAG_META.length} features enabled · changes apply instantly</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FLAG_META.map(({ key, label, desc, icon: Icon }) => {
          const enabled = !!flags[key];
          const isSaving = saving === key;
          return (
            <button
              key={key as string}
              type="button"
              onClick={() => toggle(key)}
              disabled={isSaving}
              className={`text-left rounded-lg border p-5 transition-all hover:shadow-md ${
                enabled ? "border-primary/40 bg-primary/5" : "border-border bg-card/40"
              } ${isSaving ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg grid place-items-center ${enabled ? "bg-primary/15" : "bg-muted"}`}>
                  <Icon className={`h-5 w-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <div className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}>
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h3 className="font-display text-lg">Platform Limits</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="rounded-lg border border-border bg-background/50 p-4 block">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max Projects / User</p>
            <input
              type="number"
              min={1}
              value={flags.maxProjectsPerUser}
              onChange={(e) => updateLimit("maxProjectsPerUser", parseInt(e.target.value, 10) || 1)}
              className="mt-1 w-full bg-transparent text-2xl font-display outline-none"
            />
          </label>
          <label className="rounded-lg border border-border bg-background/50 p-4 block">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max Messages / Project</p>
            <input
              type="number"
              min={1}
              value={flags.maxMessagesPerProject}
              onChange={(e) => updateLimit("maxMessagesPerProject", parseInt(e.target.value, 10) || 1)}
              className="mt-1 w-full bg-transparent text-2xl font-display outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
