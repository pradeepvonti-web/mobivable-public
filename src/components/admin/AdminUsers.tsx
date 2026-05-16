import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Shield, Crown, Search, ChevronDown, Loader2 } from "lucide-react";
import { getAdminUsers, toggleUserRole, adminUpdatePlan } from "@/lib/admin.functions";

type UserRow = {
  id: string;
  display_name: string | null;
  plan: string;
  created_at: string;
  roles: string[];
  projectCount: number;
};

const PLANS = ["free_beta", "starter", "pro"] as const;

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const fn = useServerFn(getAdminUsers);
  const toggleRoleFn = useServerFn(toggleUserRole);
  const updatePlanFn = useServerFn(adminUpdatePlan);

  useEffect(() => {
    fn().then((d: any) => setUsers(d)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || (u.display_name ?? "").toLowerCase().includes(q) || u.id.includes(q) || u.plan.includes(q);
  });

  async function handleToggleAdmin(user: UserRow) {
    setActionLoading(user.id);
    try {
      const isAdmin = user.roles.includes("admin");
      await toggleRoleFn({ targetUserId: user.id, role: "admin", grant: !isAdmin } as any);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, roles: isAdmin ? u.roles.filter((r) => r !== "admin") : [...u.roles, "admin"] }
            : u,
        ),
      );
    } catch (e) {
      console.error(e);
    }
    setActionLoading(null);
  }

  async function handlePlanChange(userId: string, plan: string) {
    setActionLoading(userId);
    try {
      await updatePlanFn({ targetUserId: userId, plan } as any);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
    } catch (e) {
      console.error(e);
    }
    setActionLoading(null);
  }

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground text-sm"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display uppercase text-2xl tracking-tight">User Management</h2>
          <p className="text-sm text-muted-foreground mt-1">{users.length} registered users</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Plan</th>
                <th className="text-center px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Projects</th>
                <th className="text-center px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Roles</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Joined</th>
                <th className="text-right px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 grid place-items-center text-xs font-bold text-primary">
                        {(u.display_name ?? "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.display_name || "—"}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{u.id.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      onChange={(e) => handlePlanChange(u.id, e.target.value)}
                      className="text-xs rounded-lg border border-border bg-background px-2 py-1 capitalize cursor-pointer"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{u.projectCount}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {u.roles.length === 0 && <span className="text-[9px] text-muted-foreground">user</span>}
                      {u.roles.map((r) => (
                        <span key={r} className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full ${
                          r === "admin" ? "bg-muted/20 text-foreground" : "bg-primary/10 text-primary"
                        }`}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={actionLoading === u.id}
                      onClick={() => handleToggleAdmin(u)}
                      className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-colors ${
                        u.roles.includes("admin")
                          ? "border-border text-foreground hover:bg-muted/10"
                          : "border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {actionLoading === u.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : u.roles.includes("admin") ? "Remove Admin" : "Make Admin"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
