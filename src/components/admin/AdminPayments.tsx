import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, TrendingUp, Users, XCircle, CheckCircle2, FlaskConical, Radio } from "lucide-react";
import { getAdminPayments, adminCancelSubscription } from "@/lib/admin.functions";

type Data = Awaited<ReturnType<typeof getAdminPayments>>;

export function AdminPayments() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const getFn = useServerFn(getAdminPayments);
  const cancelFn = useServerFn(adminCancelSubscription);

  async function refresh() {
    const d = await getFn();
    setData(d);
  }

  useEffect(() => {
    getFn().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this subscription?")) return;
    setBusy(id);
    try {
      await cancelFn({ data: { subscriptionId: id } });
      await refresh();
    } catch (e) {
      console.error(e);
    }
    setBusy(null);
  }

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!data) return <p className="text-destructive text-sm">Failed to load payments.</p>;

  const kpis = [
    { label: "Active Subscriptions", value: data.activeCount, icon: CheckCircle2, color: "from-emerald-500 to-emerald-600" },
    { label: "Live Subscriptions", value: data.liveCount, icon: Radio, color: "from-blue-500 to-blue-600" },
    { label: "Test Subscriptions", value: data.sandboxCount, icon: FlaskConical, color: "from-amber-500 to-amber-600" },
    { label: "Canceled", value: data.canceledCount, icon: XCircle, color: "from-rose-500 to-rose-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Payments & Subscriptions</h2>
          <p className="text-sm text-muted-foreground mt-1">Monitor revenue, manage subscriptions, and view plan distribution.</p>
        </div>
        <button onClick={refresh} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40">Refresh</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{c.label}</span>
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${c.color} grid place-items-center`}>
                <c.icon className="h-4 w-4 text-white" />
              </div>
            </div>
            <p className="font-display text-2xl tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg mb-4 flex items-center gap-2"><Users className="h-4 w-4" /> Plan Distribution</h3>
          <div className="space-y-3">
            {Object.entries(data.planCounts).length === 0 && <p className="text-xs text-muted-foreground">No users yet.</p>}
            {Object.entries(data.planCounts).map(([plan, count]) => {
              const total = Object.values(data.planCounts).reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((count / total) * 100) : 0;
              const color = plan === "pro" ? "bg-violet-500" : plan === "starter" ? "bg-blue-500" : "bg-muted-foreground";
              return (
                <div key={plan} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{plan.replace("_", " ")}</span>
                    <span className="text-muted-foreground font-mono text-xs">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active by Price</h3>
          <div className="space-y-2">
            {Object.entries(data.byPlan).length === 0 && <p className="text-xs text-muted-foreground">No active subscriptions.</p>}
            {Object.entries(data.byPlan).map(([price, count]) => (
              <div key={price} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <code className="text-xs">{price}</code>
                <span className="font-mono text-xs">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-display text-lg flex items-center gap-2"><CreditCard className="h-4 w-4" /> Subscriptions</h3>
          <span className="text-xs text-muted-foreground">{data.subscriptions.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
              <tr>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Plan</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Env</th>
                <th className="text-left px-4 py-2.5">Period End</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.subscriptions.length === 0 && (
                <tr><td colSpan={6} className="text-center px-4 py-8 text-muted-foreground text-xs">No subscriptions yet.</td></tr>
              )}
              {data.subscriptions.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-[11px] truncate max-w-[160px]">{s.user_id}</td>
                  <td className="px-4 py-3"><code className="text-xs">{s.price_id}</code></td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                      s.status === "active" || s.status === "trialing" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                      s.status === "canceled" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" :
                      "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                      s.environment === "live" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}>{s.environment === "sandbox" ? "test" : s.environment}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status !== "canceled" && (
                      <button
                        onClick={() => handleCancel(s.id)}
                        disabled={busy === s.id}
                        className="text-xs px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        {busy === s.id ? "…" : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
