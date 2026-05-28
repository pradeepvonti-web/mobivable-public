import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  Sparkles,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-toggle";
import {
  issueMcpPat,
  listMcpPats,
  revokeMcpPat,
  type ListedPat,
} from "@/lib/mcp-pats.functions";
import {
  listSkills,
  upsertSkill,
  deleteSkill,
  type SkillRow,
} from "@/lib/skills.functions";
import {
  getStoreCredentialStatus,
  upsertStoreCredentials,
  type CredentialStatus,
} from "@/lib/store-credentials.functions";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — Mobivable" },
      { name: "description", content: "Profile, preferences, and API keys." },
    ],
  }),
});

type ThemePref = "light" | "dark";
type ApiKey = { id: string; name: string; value: string };
type McpPat = ListedPat;

// Loose typing wrapper so we can hit the new user_api_keys table before
// the generated types regenerate.
const sb = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        order: (c: string, o: { ascending: boolean }) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (row: Record<string, unknown>) => {
      select: (c: string) => {
        single: () => Promise<{ data: ApiKey | null; error: { message: string } | null }>;
      };
    };
    delete: () => {
      eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function SettingsPage() {
  const { session, status } = useRequiredSession();
  const { setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [themePref, setThemePref] = useState<ThemePref>("light");
  const [plan, setPlan] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [pats, setPats] = useState<McpPat[]>([]);
  const [patName, setPatName] = useState("");
  // ── Skills ──
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [editingSkill, setEditingSkill] = useState<
    { id: string | null; name: string; body: string } | null
  >(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const listSkillsFn = useServerFn(listSkills);
  const upsertSkillFn = useServerFn(upsertSkill);
  const deleteSkillFn = useServerFn(deleteSkill);
  // ── Store credentials ──
  const [credStatus, setCredStatus] = useState<CredentialStatus | null>(null);
  const [credEditing, setCredEditing] = useState<"apple" | "google" | null>(null);
  const [savingCreds, setSavingCreds] = useState(false);
  const [appleDraft, setAppleDraft] = useState({
    issuerId: "",
    keyId: "",
    p8Pem: "",
  });
  const [googleDraft, setGoogleDraft] = useState("");
  const credStatusFn = useServerFn(getStoreCredentialStatus);
  const credUpsertFn = useServerFn(upsertStoreCredentials);
  const [issuingPat, setIssuingPat] = useState(false);
  // The plaintext is returned exactly once. We hold it in memory until
  // the user dismisses the reveal card; refresh = gone forever.
  const [newPatPlaintext, setNewPatPlaintext] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const uid = session.user.id;
    (async () => {
      const [profRes, keysRes] = await Promise.all([
        sb
          .from("profiles")
          .select("display_name, theme_preference, plan")
          .eq("id", uid)
          .maybeSingle(),
        sb
          .from("user_api_keys")
          .select("id, name, value")
          .eq("user_id", uid)
          .order("created_at", { ascending: true }),
      ]);
      const prof = (profRes.data ?? null) as
        | { display_name: string | null; theme_preference: ThemePref; plan: string | null }
        | null;
      if (prof) {
        setDisplayName(prof.display_name ?? "");
        const pref: ThemePref = prof.theme_preference === "dark" ? "dark" : "light";
        setThemePref(pref);
        setPlan(prof.plan ?? null);
        setTheme(pref);
      }
      setKeys((keysRes.data as ApiKey[] | null) ?? []);
      // PATs come through a server fn rather than direct Supabase select
      // so the list always reflects post-RLS reality.
      try {
        const patRes = await listMcpPats();
        if (patRes.ok) setPats(patRes.tokens);
      } catch {
        // Non-fatal — the rest of settings still renders.
      }
      try {
        const skillsRes = await listSkillsFn({ data: undefined });
        if (skillsRes.ok) setSkills(skillsRes.skills);
      } catch {
        // Skills load is non-blocking too.
      }
      try {
        const credRes = await credStatusFn({ data: undefined });
        if (credRes.ok) setCredStatus(credRes.status);
      } catch {
        // Cred status load failures are non-blocking — the user sees an
        // empty card and can still re-enter their secrets.
      }
      setLoading(false);
    })();
  }, [status, session?.user?.id, setTheme]);

  async function saveAppleCreds() {
    const { issuerId, keyId, p8Pem } = appleDraft;
    const trimmedPem = p8Pem.trim();
    if (!issuerId.trim() || !keyId.trim() || !trimmedPem) {
      toast.error("Issuer id, key id, and the .p8 contents are all required.");
      return;
    }
    if (!/-----BEGIN PRIVATE KEY-----/.test(trimmedPem)) {
      toast.error("That doesn't look like a PEM. Paste the whole file including the BEGIN/END markers.");
      return;
    }
    setSavingCreds(true);
    try {
      const res = await credUpsertFn({
        data: {
          ascIssuerId: issuerId.trim(),
          ascKeyId: keyId.trim(),
          ascP8Pem: trimmedPem,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const refreshed = await credStatusFn({ data: undefined });
      if (refreshed.ok) setCredStatus(refreshed.status);
      setAppleDraft({ issuerId: "", keyId: "", p8Pem: "" });
      setCredEditing(null);
      toast.success("Apple credentials saved");
    } finally {
      setSavingCreds(false);
    }
  }

  async function saveGoogleCreds() {
    const trimmed = googleDraft.trim();
    if (!trimmed) {
      toast.error("Paste your Play service-account JSON.");
      return;
    }
    setSavingCreds(true);
    try {
      const res = await credUpsertFn({
        data: { playServiceAccountJson: trimmed },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const refreshed = await credStatusFn({ data: undefined });
      if (refreshed.ok) setCredStatus(refreshed.status);
      setGoogleDraft("");
      setCredEditing(null);
      toast.success("Google credentials saved");
    } finally {
      setSavingCreds(false);
    }
  }

  async function clearAppleCreds() {
    if (!window.confirm("Clear Apple credentials? You'll need them again to submit to TestFlight.")) return;
    const res = await credUpsertFn({
      data: { ascIssuerId: "", ascKeyId: "", ascP8Pem: "" },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const refreshed = await credStatusFn({ data: undefined });
    if (refreshed.ok) setCredStatus(refreshed.status);
    toast.success("Apple credentials cleared");
  }

  async function clearGoogleCreds() {
    if (!window.confirm("Clear Play credentials? You'll need them again to submit to Internal Track.")) return;
    const res = await credUpsertFn({ data: { playServiceAccountJson: "" } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const refreshed = await credStatusFn({ data: undefined });
    if (refreshed.ok) setCredStatus(refreshed.status);
    toast.success("Play credentials cleared");
  }

  async function saveSkill() {
    if (!editingSkill) return;
    const name = editingSkill.name.trim();
    const body = editingSkill.body.trim();
    if (!name || !body) {
      toast.error("Both name and body are required.");
      return;
    }
    setSavingSkill(true);
    try {
      const res = await upsertSkillFn({
        data: { id: editingSkill.id ?? undefined, name, body },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSkills((prev) => {
        const idx = prev.findIndex((s) => s.id === res.skill.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = res.skill;
          return next.sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );
        }
        return [res.skill, ...prev];
      });
      setEditingSkill(null);
      toast.success("Skill saved");
    } finally {
      setSavingSkill(false);
    }
  }

  async function removeSkill(id: string) {
    if (!window.confirm("Delete this skill? Chats that referenced it will see the literal @name token.")) return;
    const res = await deleteSkillFn({ data: { id } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSkills((prev) => prev.filter((s) => s.id !== id));
    if (editingSkill?.id === id) setEditingSkill(null);
  }

  async function saveProfile() {
    if (!session?.user) return;
    setSavingProfile(true);
    try {
      const { error } = await sb
        .from("profiles")
        .update({ display_name: displayName, theme_preference: themePref })
        .eq("id", session.user.id);
      if (error) throw new Error(error.message);
      setTheme(themePref);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  }

  async function addKey() {
    if (!session?.user) return;
    const name = newName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    setAddingKey(true);
    try {
      const { data, error } = await sb
        .from("user_api_keys")
        .insert({ user_id: session.user.id, name, value: newValue })
        .select("id, name, value")
        .single();
      if (error) throw new Error(error.message);
      if (data) setKeys((k) => [...k, data]);
      setNewName("");
      setNewValue("");
      toast.success("API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add key");
    } finally {
      setAddingKey(false);
    }
  }

  async function updateKeyValue(id: string, value: string) {
    setKeys((k) => k.map((row) => (row.id === id ? { ...row, value } : row)));
  }

  async function persistKey(id: string) {
    const row = keys.find((k) => k.id === id);
    if (!row) return;
    const { error } = await sb
      .from("user_api_keys")
      .update({ value: row.value })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Updated");
  }

  async function deleteKey(id: string) {
    if (!window.confirm("Delete this API key?")) return;
    const { error } = await sb.from("user_api_keys").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setKeys((k) => k.filter((row) => row.id !== id));
  }

  async function issuePat() {
    const name = patName.trim();
    if (!name) {
      toast.error("Give the token a name (e.g. “Cursor laptop”).");
      return;
    }
    setIssuingPat(true);
    try {
      const res = await issueMcpPat({ data: { name } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Surface the plaintext for one-time copy. Refresh = gone forever.
      setNewPatPlaintext(res.pat);
      setPats((p) => [
        {
          id: res.token.id,
          name: res.token.name,
          prefix: res.token.prefix,
          created_at: res.token.created_at,
          last_used_at: null,
          revoked_at: null,
        },
        ...p,
      ]);
      setPatName("");
      toast.success("Token created — copy it now, you won’t see it again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setIssuingPat(false);
    }
  }

  async function revokePat(id: string) {
    if (!window.confirm("Revoke this token? Clients using it will stop working.")) return;
    try {
      const res = await revokeMcpPat({ data: { id } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPats((p) =>
        p.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)),
      );
      toast.success("Token revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke");
    }
  }

  async function copyPlaintext() {
    if (!newPatPlaintext) return;
    try {
      await navigator.clipboard.writeText(newPatPlaintext);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard blocked — select and copy manually.");
    }
  }

  if (status === "loading" || loading) {
    return (
      <PageShell eyebrow="ACCOUNT" title="Settings" intro="Profile, preferences, and API keys.">
        <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="ACCOUNT" title="Settings" intro="Profile, preferences, and API keys.">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Your settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{session?.user?.email}</span>
              {plan && <> · plan <span className="text-foreground capitalize">{plan.replace("_", " ")}</span></>}
            </p>
          </div>
          <Link
            to="/admin/settings"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Admin settings →
          </Link>
        </header>

        <Card title="Profile" description="How you appear inside Mobivable.">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
              Display name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Your name"
            />
          </label>
        </Card>

        <Card title="Preferences" description="Synced to your account across devices.">
          <div>
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Theme
            </span>
            <div className="inline-flex rounded-lg border border-border p-1 bg-background">
              {(["light", "dark"] as ThemePref[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThemePref(t)}
                  className={
                    "px-3 py-1.5 text-xs rounded-md capitalize transition-colors " +
                    (themePref === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title="API keys"
          description="Stored privately and only accessible to your account."
        >
          <div className="space-y-2">
            {keys.length === 0 && (
              <p className="text-xs text-muted-foreground">No keys yet.</p>
            )}
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
              >
                <span className="text-xs font-mono w-40 truncate">{k.name}</span>
                <input
                  type={revealed[k.id] ? "text" : "password"}
                  value={k.value}
                  onChange={(e) => updateKeyValue(k.id, e.target.value)}
                  onBlur={() => persistKey(k.id)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRevealed((r) => ({ ...r, [k.id]: !r[k.id] }))
                  }
                  className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
                  aria-label="Toggle visibility"
                >
                  {revealed[k.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteKey(k.id)}
                  className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="KEY_NAME"
              className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
            <input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
            <button
              type="button"
              onClick={addKey}
              disabled={addingKey}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {addingKey ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
          </div>
        </Card>

        <Card
          title="MCP access tokens"
          description="Personal Access Tokens for the Mobivable MCP server. Paste one into Cursor, Claude Code, or Claude Desktop to let an agent drive your projects."
        >
          {newPatPlaintext && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Copy this now.</strong> Mobivable never stores the plaintext — once
                you leave this page it’s gone, and you’ll need to issue a new token.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono break-all">
                  {newPatPlaintext}
                </code>
                <button
                  type="button"
                  onClick={copyPlaintext}
                  className="h-8 px-2 inline-flex items-center gap-1 rounded-md border border-border hover:bg-muted text-xs"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  type="button"
                  onClick={() => setNewPatPlaintext(null)}
                  className="h-8 px-2 inline-flex items-center rounded-md hover:bg-muted text-xs text-muted-foreground"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {pats.length === 0 && (
              <p className="text-xs text-muted-foreground">No tokens yet.</p>
            )}
            {pats.map((t) => {
              const revoked = !!t.revoked_at;
              return (
                <div
                  key={t.id}
                  className={
                    "flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 " +
                    (revoked ? "opacity-60" : "")
                  }
                >
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium w-44 truncate">{t.name}</span>
                  <code className="text-[11px] font-mono text-muted-foreground">
                    {t.prefix}…
                  </code>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {revoked
                      ? `revoked ${new Date(t.revoked_at!).toLocaleDateString()}`
                      : t.last_used_at
                        ? `last used ${new Date(t.last_used_at).toLocaleDateString()}`
                        : "never used"}
                  </span>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => revokePat(t.id)}
                      className="h-7 px-2 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive text-xs"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            <input
              type="text"
              value={patName}
              onChange={(e) => setPatName(e.target.value)}
              placeholder="Token name (e.g. Cursor laptop)"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={issuePat}
              disabled={issuingPat}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {issuingPat ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Generate token
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Endpoint:{" "}
            <code className="font-mono">{`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/mcp`}</code>
          </p>
        </Card>

        <Card
          title="Skills"
          description="Reusable prompt snippets. Type `@skill-name` in the agent composer and we'll expand it on send."
        >
          <div className="space-y-2">
            {skills.length === 0 && !editingSkill && (
              <p className="text-xs text-muted-foreground">
                No skills yet. Save your house style, project-specific
                instructions, or recurring asks so the agent picks them up
                with one keystroke.
              </p>
            )}
            {skills.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2"
              >
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <code className="text-xs font-mono w-40 truncate">@{s.name}</code>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {s.body.replace(/\s+/g, " ").slice(0, 80)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingSkill({ id: s.id, name: s.name, body: s.body })
                  }
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeSkill(s.id)}
                  className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                  aria-label="Delete skill"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {editingSkill ? (
            <div className="mt-4 border-t border-border pt-4 space-y-2">
              <input
                type="text"
                value={editingSkill.name}
                onChange={(e) =>
                  setEditingSkill({ ...editingSkill, name: e.target.value })
                }
                placeholder="skill-name"
                pattern="^[a-z0-9][a-z0-9_-]{0,39}$"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
              />
              <textarea
                value={editingSkill.body}
                onChange={(e) =>
                  setEditingSkill({ ...editingSkill, body: e.target.value })
                }
                placeholder="The skill body — instructions, style guide, recurring asks. Up to 8 KB."
                rows={6}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono resize-y"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveSkill}
                  disabled={savingSkill}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingSkill ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSkill(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {editingSkill.body.length.toLocaleString()} / 8,192 chars
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={() =>
                  setEditingSkill({ id: null, name: "", body: "" })
                }
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> New skill
              </button>
            </div>
          )}
        </Card>

        <Card
          title="Store credentials"
          description="Apple App Store Connect API key + Google Play service account. Used only when you submit a build to TestFlight or Play Internal Track. Stored encrypted at rest."
        >
          {/* ─── Apple ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Apple ASC API key</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {credStatus?.hasAscKey
                    ? `Key ${credStatus.ascKeyId} · issuer …${credStatus.ascIssuerIdTail}`
                    : "Not configured."}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCredEditing(credEditing === "apple" ? null : "apple")}
                  className="h-7 px-2.5 text-xs rounded-md border border-border hover:bg-muted"
                >
                  {credStatus?.hasAscKey ? "Replace" : "Add"}
                </button>
                {credStatus?.hasAscKey && (
                  <button
                    type="button"
                    onClick={clearAppleCreds}
                    className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                    aria-label="Clear Apple credentials"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {credEditing === "apple" && (
              <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
                <input
                  type="text"
                  value={appleDraft.issuerId}
                  onChange={(e) =>
                    setAppleDraft({ ...appleDraft, issuerId: e.target.value })
                  }
                  placeholder="Issuer id (UUID-shaped)"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  value={appleDraft.keyId}
                  onChange={(e) =>
                    setAppleDraft({ ...appleDraft, keyId: e.target.value })
                  }
                  placeholder="Key id (10 chars)"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
                />
                <textarea
                  value={appleDraft.p8Pem}
                  onChange={(e) =>
                    setAppleDraft({ ...appleDraft, p8Pem: e.target.value })
                  }
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-mono resize-y"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveAppleCreds}
                    disabled={savingCreds}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {savingCreds ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Save Apple key
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredEditing(null);
                      setAppleDraft({ issuerId: "", keyId: "", p8Pem: "" });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Google ─── */}
          <div className="space-y-3 mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Play service account</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {credStatus?.hasPlayServiceAccount
                    ? "Configured."
                    : "Not configured."}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCredEditing(credEditing === "google" ? null : "google")
                  }
                  className="h-7 px-2.5 text-xs rounded-md border border-border hover:bg-muted"
                >
                  {credStatus?.hasPlayServiceAccount ? "Replace" : "Add"}
                </button>
                {credStatus?.hasPlayServiceAccount && (
                  <button
                    type="button"
                    onClick={clearGoogleCreds}
                    className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                    aria-label="Clear Play credentials"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {credEditing === "google" && (
              <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
                <textarea
                  value={googleDraft}
                  onChange={(e) => setGoogleDraft(e.target.value)}
                  placeholder="{ &quot;type&quot;: &quot;service_account&quot;, &quot;project_id&quot;: ... }"
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-mono resize-y"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveGoogleCreds}
                    disabled={savingCreds}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {savingCreds ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Save Play JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredEditing(null);
                      setGoogleDraft("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveProfile}
            disabled={savingProfile}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingProfile ? "Saving…" : "Save profile & preferences"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
