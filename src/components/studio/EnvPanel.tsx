import { useEffect, useState } from "react";
import { Check, Download, Eye, EyeOff, KeyRound, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AIProviderSettings } from "@/components/AIProviderSettings";

type EnvVar = {
  id: string;
  name: string;
  value: string;
  visible: boolean;
};

const RESERVED_ENV_NAMES = new Set([
  "NODE_ENV",
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "LANG",
  "TERM",
  "HOSTNAME",
  "EXPO_PUBLIC_PROJECT_ID",
  "EXPO_PUBLIC_API_URL",
]);

function validateEnvName(
  name: string,
  opts: { requirePublic?: boolean; existing?: string[] } = {},
): string | null {
  if (!name) return "Name is required";
  if (name.length < 2) return "Name must be at least 2 characters";
  if (name.length > 64) return "Name must be 64 characters or fewer";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    return "Use UPPER_SNAKE_CASE: A–Z, 0–9, _ (cannot start with a digit)";
  }
  if (/__/.test(name)) return "Name cannot contain consecutive underscores";
  if (name.endsWith("_")) return "Name cannot end with an underscore";
  if (RESERVED_ENV_NAMES.has(name)) return `"${name}" is reserved`;
  if (opts.requirePublic && !name.startsWith("EXPO_PUBLIC_")) {
    return "Public variables must start with EXPO_PUBLIC_";
  }
  if (name.startsWith("EXPO_PUBLIC_") && name.length <= "EXPO_PUBLIC_".length) {
    return "Add a name after the EXPO_PUBLIC_ prefix";
  }
  if (opts.existing?.includes(name)) return `"${name}" already exists`;
  return null;
}

function EnvPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newVisible, setNewVisible] = useState(true);
  const [newPublic, setNewPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editVisible, setEditVisible] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(v: EnvVar) {
    setEditId(v.id);
    setEditValue(v.value);
    setEditVisible(v.visible);
    setEditError(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditValue("");
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    if (editValue.length > 4000) {
      setEditError("Value too long");
      return;
    }
    setEditSaving(true);
    try {
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("project_env_vars")
        .update({ value: editValue, visible: editVisible })
        .eq("id", id);
      if (err) throw new Error(err.message);
      setVars((prev) =>
        prev.map((v) => (v.id === id ? { ...v, value: editValue, visible: editVisible } : v)),
      );
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  const systemVars = [
    { name: "EXPO_PUBLIC_PROJECT_ID", value: projectId },
    { name: "EXPO_PUBLIC_API_URL", value: import.meta.env.VITE_SUPABASE_URL ?? "" },
  ];

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: EnvVar[] | null }>;
            };
          };
        };
      };
    })
      .from("project_env_vars")
      .select("id,name,value,visible")
      .eq("project_id", projectId)
      .eq("user_id", uid)
      .order("name", { ascending: true });
    setVars(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addVar() {
    setError(null);
    let name = newName.trim().toUpperCase();
    if (newPublic && !name.startsWith("EXPO_PUBLIC_")) {
      name = `EXPO_PUBLIC_${name}`;
    }
    const validationError = validateEnvName(name, {
      requirePublic: newPublic,
      existing: vars.map((v) => v.name),
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (newValue.length > 4000) {
      setError("Value too long (max 4000 chars)");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("project_env_vars")
        .insert({
          project_id: projectId,
          user_id: uid,
          name,
          value: newValue,
          visible: newVisible,
        });
      if (err) throw new Error(err.message);
      setNewName("");
      setNewValue("");
      setNewVisible(true);
      setNewPublic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function exportEnv() {
    const lines = vars
      .filter((v) => v.visible)
      .map((v) => `${v.name}=${/[\s"'#$`\\]/.test(v.value) ? `"${v.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v.value}`);
    if (lines.length === 0) return;
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function removeVar(id: string) {
    await (supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("project_env_vars")
      .delete()
      .eq("id", id);
    setVars((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <header className="p-5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg truncate">Environment Variables</h2>
            <p className="text-xs text-muted-foreground truncate">
              Available in your Expo app via process.env
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* AI Provider Configuration */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> AI Providers
          </p>
          <AIProviderSettings />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="h-3 w-3" /> System variables (read-only)
          </p>
          {systemVars.map((sv) => (
            <div key={sv.name} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono">{sv.name}</span>
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  System
                </span>
              </div>
              <input
                readOnly
                value={sv.value}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono text-muted-foreground"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              User variables
            </p>
            <button
              type="button"
              onClick={exportEnv}
              disabled={vars.filter((v) => v.visible).length === 0}
              className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1"
              title="Download visible variables as .env"
            >
              <Download className="h-3 w-3" />
              Export .env
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : vars.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-1">
              <p className="text-sm text-muted-foreground">No user variables defined</p>
              <p className="text-xs text-muted-foreground/70">Add variables using the form below</p>
            </div>
          ) : (
            vars.map((v) => {
              const isEditing = editId === v.id;
              return (
                <div key={v.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono flex-1 truncate">{v.name}</span>
                    {!v.visible && !isEditing && (
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Hidden
                      </span>
                    )}
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditVisible((x) => !x)}
                          className="text-muted-foreground hover:text-foreground"
                          title={editVisible ? "Set hidden" : "Set visible"}
                        >
                          {editVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(v.id)}
                          disabled={editSaving}
                          className="text-primary hover:opacity-80 disabled:opacity-40"
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-muted-foreground hover:text-foreground"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setReveal((r) => ({ ...r, [v.id]: !r[v.id] }))}
                          className="text-muted-foreground hover:text-foreground"
                          title={reveal[v.id] ? "Hide value" : "Reveal value"}
                        >
                          {reveal[v.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(v)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVar(v.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <input
                        autoFocus
                        type={editVisible ? "text" : "password"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(v.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={4000}
                        className="w-full px-2 py-1.5 rounded border border-primary/50 bg-background text-xs font-mono focus:outline-none focus:border-primary"
                      />
                      {editError && <p className="text-[11px] text-destructive">{editError}</p>}
                    </>
                  ) : (
                    <input
                      readOnly
                      type={reveal[v.id] || v.visible ? "text" : "password"}
                      value={v.value}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm font-medium">Add new variable</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
            placeholder={newPublic ? "MY_VAR (EXPO_PUBLIC_ added)" : "MY_SECRET"}
            maxLength={64}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
          />
          {(() => {
            const previewName =
              newPublic && newName && !newName.startsWith("EXPO_PUBLIC_")
                ? `EXPO_PUBLIC_${newName}`
                : newName;
            const liveError =
              previewName
                ? validateEnvName(previewName, {
                    requirePublic: newPublic,
                    existing: vars.map((v) => v.name),
                  })
                : null;
            return (
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-muted-foreground truncate">
                  {previewName ? `→ ${previewName}` : "UPPER_SNAKE_CASE, A–Z 0–9 _"}
                </span>
                {liveError && newName && (
                  <span className="text-destructive truncate">{liveError}</span>
                )}
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => setNewPublic((p) => !p)}
            className={`w-full px-3 py-2 rounded-md border text-xs flex items-center justify-between gap-1.5 transition-colors ${
              newPublic
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border hover:bg-muted/50 text-muted-foreground"
            }`}
            title="Expose this variable to the client app (Expo requires the EXPO_PUBLIC_ prefix)"
          >
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Public (EXPO_PUBLIC_ prefix)
            </span>
            <span className="text-[10px] uppercase tracking-widest">{newPublic ? "On" : "Off"}</span>
          </button>
          <div className="flex gap-2">
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value…"
              maxLength={4000}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setNewVisible((v) => !v)}
              className="px-3 py-2 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted/50"
              title="Toggle whether value is shown in plain text"
            >
              {newVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {newVisible ? "Visible" : "Hidden"}
            </button>
            <button
              type="button"
              onClick={addVar}
              disabled={saving || !newName.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}


export { EnvPanel };
