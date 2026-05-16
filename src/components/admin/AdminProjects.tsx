import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Trash2, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { AdminEmptyState } from "./admin-ui";
import { getAdminProjects, adminDeleteProject } from "@/lib/admin.functions";

type ProjectRow = {
  id: string;
  name: string;
  prompt: string;
  status: string;
  model: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  error_text: string | null;
};

export function AdminProjects() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fn = useServerFn(getAdminProjects);
  const deleteFn = useServerFn(adminDeleteProject);

  useEffect(() => {
    fn().then((d: any) => setProjects(d)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const statuses = [...new Set(projects.map((p) => p.status))];
  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q) || p.id.includes(q);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleDelete(projectId: string) {
    setDeleting(projectId);
    try {
      await deleteFn({ projectId } as any);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setConfirmDelete(null);
    } catch (e) {
      console.error(e);
    }
    setDeleting(null);
  }

  const statusColor = (s: string) =>
    s === "ready" ? "bg-primary" : s === "failed" ? "bg-destructive" : s === "generating" ? "bg-muted-foreground" : "bg-muted-foreground";

  if (loading) {
    return <div className="grid place-items-center h-64 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display uppercase text-2xl tracking-tight">Project Management</h2>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} total projects</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-border bg-card px-3 py-2 capitalize"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Project</th>
                <th className="text-center px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Model</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Created</th>
                <th className="text-right px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-sm truncate">{p.name || "Untitled"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.prompt.slice(0, 80)}</p>
                    {p.error_text && (
                      <p className="text-[9px] text-destructive flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {p.error_text.slice(0, 60)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase">
                      <span className={`h-2 w-2 rounded-full ${statusColor(p.status)}`} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{p.model}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/projects/${p.id}`}
                        className="text-[10px] font-mono uppercase text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        Open <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {confirmDelete === p.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            disabled={deleting === p.id}
                            className="text-[10px] font-mono uppercase text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                          >
                            {deleting === p.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="text-[10px] font-mono uppercase text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(p.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No projects found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
