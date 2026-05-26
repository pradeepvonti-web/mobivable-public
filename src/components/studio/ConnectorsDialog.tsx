import { useEffect, useState } from "react";
import { Eye, EyeOff, Github, Loader2, Pencil, Plus, RefreshCw, Trash2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ConnectorRow = {
  id: string;
  provider: string;
  label: string;
  token: string;
  account: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

const PROVIDERS: { id: string; name: string; help: string; tokenLabel: string }[] = [
  {
    id: "github",
    name: "GitHub",
    help: "Create a fine-grained PAT with repo:read at github.com/settings/tokens.",
    tokenLabel: "Personal access token",
  },
  {
    id: "gitlab",
    name: "GitLab",
    help: "Create a token with read_api scope at gitlab.com/-/profile/personal_access_tokens.",
    tokenLabel: "Personal access token",
  },
  {
    id: "custom",
    name: "Custom",
    help: "Store any API key for later use by the AI.",
    tokenLabel: "API key / token",
  },
];

function ConnectorsDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ConnectorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConnectorRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<string>("github");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [reposByConn, setReposByConn] = useState<Record<string, { name: string; full_name: string; html_url: string; private: boolean }[]>>({});
  const [reposLoading, setReposLoading] = useState<string | null>(null);
  const [reposErr, setReposErr] = useState<Record<string, string>>({});

  const db = supabase as unknown as { from: (t: string) => any };

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await db
      .from("user_connectors")
      .select("id, provider, label, token, account, metadata, updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as ConnectorRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setDraftProvider("github");
    setDraftLabel("");
    setDraftToken("");
    setShowToken(false);
  }
  function startEdit(r: ConnectorRow) {
    setCreating(false);
    setEditing(r);
    setDraftProvider(r.provider);
    setDraftLabel(r.label);
    setDraftToken(r.token);
    setShowToken(false);
  }
  function cancelDraft() {
    setEditing(null);
    setCreating(false);
  }

  async function handleSave() {
    if (!uid) return;
    if (!draftLabel.trim() || !draftToken.trim()) {
      toast.error("Label and token are required");
      return;
    }
    setSavingId(editing?.id ?? "new");
    let account: string | null = null;
    if (draftProvider === "github") {
      try {
        const r = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${draftToken.trim()}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (r.ok) {
          const j = (await r.json()) as { login?: string };
          account = j.login ?? null;
        } else if (r.status === 401) {
          toast.error("GitHub rejected this token");
          setSavingId(null);
          return;
        }
      } catch {
        // Ignore network errors and still save
      }
    }
    try {
      if (editing) {
        const { error } = await db
          .from("user_connectors")
          .update({
            provider: draftProvider,
            label: draftLabel.trim(),
            token: draftToken.trim(),
            account,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast("Connector updated");
      } else {
        const { error } = await db.from("user_connectors").insert({
          user_id: uid,
          provider: draftProvider,
          label: draftLabel.trim(),
          token: draftToken.trim(),
          account,
        });
        if (error) throw error;
        toast("Connector added");
      }
      cancelDraft();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Disconnect and remove this connector?")) return;
    setSavingId(id);
    try {
      const { error } = await db.from("user_connectors").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      setReposByConn((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      toast("Connector removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setSavingId(null);
    }
  }

  async function fetchRepos(r: ConnectorRow) {
    if (r.provider !== "github") return;
    setReposLoading(r.id);
    setReposErr((e) => ({ ...e, [r.id]: "" }));
    try {
      const res = await fetch(
        "https://api.github.com/user/repos?per_page=30&sort=updated",
        {
          headers: {
            Authorization: `Bearer ${r.token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const list = (await res.json()) as ConnectorRow["metadata"] as any;
      setReposByConn((m) => ({ ...m, [r.id]: list }));
    } catch (e) {
      setReposErr((m) => ({
        ...m,
        [r.id]: e instanceof Error ? e.message : "Failed to load repos",
      }));
    } finally {
      setReposLoading(null);
    }
  }

  const isDrafting = creating || !!editing;
  const providerMeta = PROVIDERS.find((p) => p.id === draftProvider) ?? PROVIDERS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Connectors</h2>
            <span className="text-xs text-muted-foreground">
              Connect accounts so the AI can fetch their data
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isDrafting ? (
            <div className="rounded-xl border border-border p-3 space-y-3 bg-background/40">
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDraftProvider(p.id)}
                    className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                      draftProvider === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Label (e.g. Personal GitHub)"
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="relative">
                <input
                  value={draftToken}
                  onChange={(e) => setDraftToken(e.target.value)}
                  placeholder={providerMeta.tokenLabel}
                  type={showToken ? "text" : "password"}
                  className="w-full bg-transparent border border-border rounded-md pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-1 top-1 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:bg-background"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{providerMeta.help}</p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDraft}
                  className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium hover:bg-muted/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={savingId !== null}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingId !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editing ? "Save changes" : "Connect"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add connector
            </button>
          )}

          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No connectors yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const repos = reposByConn[r.id];
                const rerr = reposErr[r.id];
                const Icon = r.provider === "github" ? Github : Workflow;
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-border/60 bg-background/30"
                  >
                    <div className="flex items-start gap-3 px-3 py-2.5">
                      <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{r.label}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.provider}
                          </span>
                        </div>
                        {r.account && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            @{r.account}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          Updated {new Date(r.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.provider === "github" && (
                          <button
                            type="button"
                            onClick={() => fetchRepos(r)}
                            disabled={reposLoading === r.id}
                            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium border border-border hover:bg-background disabled:opacity-50"
                          >
                            {reposLoading === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Fetch repos
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={savingId === r.id}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                          aria-label="Disconnect"
                        >
                          {savingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    {rerr && (
                      <div className="px-3 pb-2 text-xs text-destructive">{rerr}</div>
                    )}
                    {repos && (
                      <div className="px-3 pb-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          {repos.length} repositories
                        </div>
                        <ul className="max-h-48 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                          {repos.map((repo) => (
                            <li
                              key={repo.full_name}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/30"
                            >
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate underline-offset-2 hover:underline"
                              >
                                {repo.full_name}
                              </a>
                              {repo.private && (
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  private
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export { ConnectorsDialog };
