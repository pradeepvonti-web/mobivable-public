import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-toggle";

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
      setLoading(false);
    })();
  }, [status, session?.user?.id, setTheme]);

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
