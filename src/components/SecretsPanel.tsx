import { useState, useEffect, useCallback } from "react";
import {
  KeyRound, Plus, Trash2, Copy, Shield, Eye, EyeOff, Loader2, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { listSecrets, setSecret, deleteSecret } from "@/lib/secrets.functions";

/* ─── Types ─── */

type SecretRow = {
  id: string;
  key_name: string;
  category: string;
  masked_value: string;
  updated_at: string;
};

const CATEGORIES = [
  { value: "api_key", label: "API Key" },
  { value: "database", label: "Database" },
  { value: "oauth", label: "OAuth" },
  { value: "custom", label: "Custom" },
] as const;

/* ─── SecretsPanel Component ─── */

export function SecretsPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState<string>("api_key");
  const [showNewValue, setShowNewValue] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showEditValue, setShowEditValue] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /* ─── Data loading ─── */
  const fetchSecrets = useCallback(async () => {
    try {
      const result = await listSecrets({ data: { projectId } });
      setSecrets(result.secrets);
    } catch (e) {
      toast.error("Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  /* ─── Add Secret ─── */
  async function handleAdd() {
    if (!newKeyName.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await setSecret({
        data: {
          projectId,
          keyName: newKeyName.trim().toUpperCase().replace(/\s+/g, "_"),
          value: newValue,
          category: newCategory,
        },
      });
      toast.success("Secret saved");
      setNewKeyName("");
      setNewValue("");
      setNewCategory("api_key");
      setShowAddForm(false);
      setShowNewValue(false);
      await fetchSecrets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save secret");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Edit Secret ─── */
  async function handleEdit(secret: SecretRow) {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      await setSecret({
        data: {
          projectId,
          keyName: secret.key_name,
          value: editValue,
          category: secret.category,
        },
      });
      toast.success("Secret updated");
      setEditingId(null);
      setEditValue("");
      setShowEditValue(false);
      await fetchSecrets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update secret");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Delete Secret ─── */
  async function handleDelete(secretId: string) {
    setSaving(true);
    try {
      await deleteSecret({ data: { projectId, secretId } });
      toast.success("Secret deleted");
      setConfirmDeleteId(null);
      await fetchSecrets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete secret");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Copy .env ─── */
  function handleCopyEnv() {
    if (secrets.length === 0) {
      toast.error("No secrets to copy");
      return;
    }
    const envContent = secrets
      .map((s) => `${s.key_name}=${s.masked_value}`)
      .join("\n");
    navigator.clipboard.writeText(envContent);
    toast.success("Copied .env to clipboard (values masked)");
  }

  /* ─── Category badge ─── */
  function categoryBadge(cat: string) {
    const colors: Record<string, string> = {
      api_key: "bg-blue-500/15 text-blue-500",
      database: "bg-emerald-500/15 text-emerald-500",
      oauth: "bg-violet-500/15 text-violet-500",
      custom: "bg-amber-500/15 text-amber-500",
    };
    const label = CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
    return (
      <span
        className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full ${colors[cat] ?? "bg-muted text-muted-foreground"}`}
      >
        {label}
      </span>
    );
  }

  /* ─── Render ─── */
  if (loading) {
    return (
      <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      {/* Header */}
      <header className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-amber-500/15 grid place-items-center shrink-0">
            <KeyRound className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base truncate">Secrets</h2>
            <p className="text-[10px] text-muted-foreground truncate">
              Environment variables &amp; API keys
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Warning callout */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Secrets are stored securely. Never share them in chat.
          </p>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Secret
          </button>
          <button
            type="button"
            onClick={handleCopyEnv}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card/60 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy .env
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                New Secret
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewKeyName("");
                  setNewValue("");
                  setShowNewValue(false);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. STRIPE_API_KEY"
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                Value
              </label>
              <div className="relative">
                <input
                  type={showNewValue ? "text" : "password"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Secret value..."
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewValue(!showNewValue)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewValue ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newKeyName.trim() || !newValue.trim()}
              className="w-full h-9 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving..." : "Save Secret"}
            </button>
          </div>
        )}

        {/* Secrets list */}
        {secrets.length === 0 && !showAddForm ? (
          <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted/30 grid place-items-center">
              <KeyRound className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No secrets yet
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-[260px]">
                Add API keys, database credentials, and other secrets your app needs at build time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors mt-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Your First Secret
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {secrets.map((secret) => (
              <div
                key={secret.id}
                className="rounded-xl border border-border bg-card/60 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-foreground truncate">
                        {secret.key_name}
                      </span>
                      {categoryBadge(secret.category)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {secret.masked_value}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 mt-1 block">
                      Updated{" "}
                      {new Date(secret.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingId === secret.id) {
                          setEditingId(null);
                          setEditValue("");
                          setShowEditValue(false);
                        } else {
                          setEditingId(secret.id);
                          setEditValue("");
                          setShowEditValue(false);
                        }
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                      title="Edit value"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {confirmDeleteId === secret.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(secret.id)}
                          disabled={saving}
                          className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-[10px] font-medium hover:bg-destructive/90 transition-colors"
                        >
                          {saving ? "..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(secret.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete secret"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {editingId === secret.id && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="relative flex-1">
                      <input
                        type={showEditValue ? "text" : "password"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="New value..."
                        className="w-full h-8 rounded-lg border border-border bg-background px-2.5 pr-8 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditValue(!showEditValue)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showEditValue ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEdit(secret)}
                      disabled={saving || !editValue.trim()}
                      className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Update"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
