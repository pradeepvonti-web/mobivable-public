import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, FolderKanban, MessageSquare, Sparkles,
  TrendingUp, Activity, Cpu, Clock,
} from "lucide-react";
import { getAdminStats } from "@/lib/admin.functions";

type Stats = Awaited<ReturnType<typeof getAdminStats>>;

export function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getAdminStats);

  useEffect(() => {
    fn().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center h-64 text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 animate-pulse" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (!stats) return <p className="text-destructive text-sm">Failed to load stats.</p>;

  const cards = [
    { label: "Total Users", value: stats.userCount, icon: Users, color: "from-blue-500 to-blue-600", trend: `+${stats.recentUsers} this week` },
    { label: "Total Projects", value: stats.projectCount, icon: FolderKanban, color: "from-emerald-500 to-emerald-600", trend: `+${stats.recentProjects} this week` },
    { label: "Total Messages", value: stats.messageCount, icon: MessageSquare, color: "from-violet-500 to-violet-600", trend: null },
    { label: "AI Provider", value: stats.activeProvider, icon: Sparkles, color: "from-amber-500 to-orange-500", trend: `${stats.providers.filter((p) => p.configured).length}/5 configured` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Platform Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">Real-time platform analytics and health status.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5 space-y-3 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{c.label}</span>
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${c.color} grid place-items-center`}>
                <c.icon className="h-4 w-4 text-white" />
              </div>
            </div>
            <p className="font-display text-2xl tracking-tight">
              {typeof c.value === "number" ? c.value.toLocaleString() : c.value}
            </p>
            {c.trend && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                {c.trend}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Project Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg mb-4">Project Status Distribution</h3>
          <div className="space-y-3">
            {Object.entries(stats.statusCounts).map(([status, count]) => {
              const pct = stats.projectCount > 0 ? Math.round((count / stats.projectCount) * 100) : 0;
              const color = status === "ready" ? "bg-emerald-500" : status === "failed" ? "bg-destructive" : status === "generating" ? "bg-blue-500" : "bg-muted-foreground";
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{status}</span>
                    <span className="text-muted-foreground font-mono text-xs">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Provider Status */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg mb-4">AI Provider Health</h3>
          <div className="space-y-2">
            {stats.providers.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                p.isActive ? "border-primary/30 bg-primary/5" : p.configured ? "border-emerald-500/20 bg-card" : "border-border bg-muted/20"
              }`}>
                <div className={`h-2.5 w-2.5 rounded-full ${p.configured ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <span className="text-sm font-medium flex-1">{p.name}</span>
                {p.isActive && (
                  <span className="text-[8px] font-mono uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">active</span>
                )}
                {p.configured && !p.isActive && (
                  <span className="text-[8px] font-mono uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">ready</span>
                )}
                {!p.configured && (
                  <span className="text-[8px] font-mono uppercase text-muted-foreground">not set</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
