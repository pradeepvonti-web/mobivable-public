import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, KeyRound, MailCheck } from "lucide-react";
import { AdminIcons, AdminActionButton, AdminEmptyState } from "./admin-ui";
import { getAdminLoginAudit, getPasswordResetAudit } from "@/lib/admin.functions";

type Entry = {
  id: string;
  user_id: string | null;
  email: string;
  success: boolean;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export function AdminActivity() {
  const fetchFn = useServerFn(getAdminLoginAudit);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn();
      setEntries(res.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const successCount = entries?.filter((e) => e.success).length ?? 0;
  const failCount = entries?.filter((e) => !e.success).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display uppercase text-2xl font-semibold tracking-tight">Admin Activity</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sign-in attempts targeting admin accounts (latest 100).
          </p>
        </div>
        <AdminActionButton icon={AdminIcons.refresh} onClick={load} disabled={loading} loading={loading}>
          Refresh
        </AdminActionButton>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total" value={entries?.length ?? 0} />
        <Kpi label="Successful" value={successCount} tone="ok" />
        <Kpi label="Failed" value={failCount} tone="bad" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Result</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">User ID</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && !entries ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : !entries || entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <AdminEmptyState title="No admin login attempts recorded yet" />
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {e.success ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[11px] font-medium">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{e.email}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {e.user_id ? e.user_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[280px] truncate" title={e.reason ?? ""}>
                      {e.reason ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PasswordResetSection />
    </div>
  );
}

type ResetEntry = {
  id: string;
  user_id: string | null;
  email: string;
  event: "request" | "complete";
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

function PasswordResetSection() {
  const fetchFn = useServerFn(getPasswordResetAudit);
  const [entries, setEntries] = useState<ResetEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn();
      setEntries(res.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load password resets");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requests = entries?.filter((e) => e.event === "request").length ?? 0;
  const completes = entries?.filter((e) => e.event === "complete").length ?? 0;

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display uppercase text-2xl font-semibold tracking-tight">Password Resets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reset link requests and successful completions (latest 100).
          </p>
        </div>
        <AdminActionButton icon={AdminIcons.refresh} onClick={load} disabled={loading} loading={loading}>
          Refresh
        </AdminActionButton>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total" value={entries?.length ?? 0} />
        <Kpi label="Requested" value={requests} />
        <Kpi label="Completed" value={completes} tone="ok" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Event</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">User ID</th>
                <th className="text-left px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && !entries ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-destructive">{error}</td></tr>
              ) : !entries || entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No password reset events recorded yet.</td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {e.event === "complete" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                          <MailCheck className="h-3 w-3" /> Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/10 text-foreground px-2 py-0.5 text-[11px] font-medium">
                          <KeyRound className="h-3 w-3" /> Requested
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{e.email}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {e.user_id ? e.user_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  const color =
    tone === "ok" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
