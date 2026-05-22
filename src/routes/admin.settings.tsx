import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { checkAdminAccess } from "@/lib/admin.functions";
import {
  DEFAULT_PREVIEW_CONFIG,
  fetchPreviewConfig,
  savePreviewConfig,
  type PreviewConfig,
} from "@/lib/preview-config";
import { getAgentsBible, saveAgentsBible } from "@/lib/agents-md.functions";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
  head: () => ({
    meta: [
      { title: "Admin Settings — Mobivable" },
      { name: "description", content: "Configure preview and list data sources." },
    ],
  }),
});

function AdminSettingsPage() {
  const { session, status } = useRequiredSession();
  const checkFn = useServerFn(checkAdminAccess);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [config, setConfig] = useState<PreviewConfig>(DEFAULT_PREVIEW_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    (async () => {
      try {
        const r = await checkFn();
        setIsAdmin(r.isAdmin);
        if (r.isAdmin) {
          const cfg = await fetchPreviewConfig();
          setConfig(cfg);
        }
      } catch {
        setIsAdmin(false);
      }
      setLoading(false);
    })();
  }, [status, session?.user?.id, checkFn]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await savePreviewConfig(config);
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig(DEFAULT_PREVIEW_CONFIG);
  }

  if (status === "loading" || loading) {
    return (
      <PageShell eyebrow="ADMIN" title="Settings" intro="Configure preview and list data sources.">
        <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">
          Loading…
        </div>
      </PageShell>
    );
  }
  if (status === "unauthenticated") {
    return (
      <PageShell eyebrow="ADMIN" title="Settings" intro="Configure preview and list data sources.">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-sm">
            Please <Link to="/login" className="underline">sign in</Link>.
          </p>
        </div>
      </PageShell>
    );
  }
  if (!isAdmin) {
    return (
      <PageShell eyebrow="ADMIN" title="Settings" intro="Configure preview and list data sources.">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="font-display text-3xl">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn’t have the <code>admin</code> role.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="ADMIN" title="Settings" intro="Configure preview and list data sources.">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <header>
          <h1 className="font-display text-4xl tracking-tight">Admin Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure which database tables and columns power the project list, the
            preview pane, and the chat thread. Toggle individual preview sections
            on or off.
          </p>
        </header>

        <Card title="Projects list" description="Used in the sidebar “Recent projects” list.">
          <Field
            label="Table"
            value={config.projectsTable}
            onChange={(v) => setConfig({ ...config, projectsTable: v })}
          />
          <Grid>
            {(Object.keys(config.projectsListFields) as Array<keyof PreviewConfig["projectsListFields"]>).map((k) => (
              <Field
                key={k}
                label={k}
                value={config.projectsListFields[k]}
                onChange={(v) =>
                  setConfig({
                    ...config,
                    projectsListFields: { ...config.projectsListFields, [k]: v },
                  })
                }
              />
            ))}
          </Grid>
        </Card>

        <Card title="Project detail" description="Row fetched for the preview pane.">
          <Field
            label="Table"
            value={config.projectsTable}
            disabled
            hint="Shared with the projects list table above."
            onChange={() => {}}
          />
          <Grid>
            {(Object.keys(config.projectDetailFields) as Array<keyof PreviewConfig["projectDetailFields"]>).map((k) => (
              <Field
                key={k}
                label={k}
                value={config.projectDetailFields[k]}
                onChange={(v) =>
                  setConfig({
                    ...config,
                    projectDetailFields: { ...config.projectDetailFields, [k]: v },
                  })
                }
              />
            ))}
          </Grid>
        </Card>

        <Card title="Chat thread" description="Messages shown under the preview.">
          <Field
            label="Table"
            value={config.messagesTable}
            onChange={(v) => setConfig({ ...config, messagesTable: v })}
          />
          <Grid>
            {(Object.keys(config.messagesFields) as Array<keyof PreviewConfig["messagesFields"]>).map((k) => (
              <Field
                key={k}
                label={k}
                value={config.messagesFields[k]}
                onChange={(v) =>
                  setConfig({
                    ...config,
                    messagesFields: { ...config.messagesFields, [k]: v },
                  })
                }
              />
            ))}
          </Grid>
        </Card>

        <Card title="Preview sections" description="Show or hide cards in the preview pane.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(Object.keys(config.visibility) as Array<keyof PreviewConfig["visibility"]>).map((k) => (
              <label
                key={k}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm capitalize"
              >
                <input
                  type="checkbox"
                  checked={config.visibility[k]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      visibility: { ...config.visibility, [k]: e.target.checked },
                    })
                  }
                />
                {k}
              </label>
            ))}
          </div>
        </Card>

        <AgentsBibleCard />


        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Reset to defaults
          </button>
          {msg && (
            <span
              className={
                "text-sm " +
                (msg.kind === "ok" ? "text-primary" : "text-destructive")
              }
            >
              {msg.text}
            </span>
          )}
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
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono disabled:opacity-60"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function AgentsBibleCard() {
  const getFn = useServerFn(getAgentsBible);
  const saveFn = useServerFn(saveAgentsBible);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getFn();
        if (r.ok) {
          setContent(r.content);
          setFileName(r.fileName);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [getFn]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) {
      setMsg({ kind: "err", text: "File too large (max 1MB). For PDFs, paste the text below." });
      return;
    }
    const text = await f.text();
    setContent(text);
    setFileName(f.name);
    setMsg(null);
  }

  async function handleSave() {
    if (!content.trim()) {
      setMsg({ kind: "err", text: "Bible content is empty." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await saveFn({ data: { content, fileName } });
      setMsg(
        r.ok
          ? { kind: "ok", text: "Bible saved. New projects will use it." }
          : { kind: "err", text: r.error },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-xl">Agents Bible</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The global guide used to generate <code>Agents.md</code> for every new project.
        Upload a <code>.txt</code> or <code>.md</code> file, or paste text directly. For
        PDFs, copy the text and paste below.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={handleFile}
            className="text-xs"
          />
          {fileName && (
            <span className="text-xs text-muted-foreground">
              Last file: <code>{fileName}</code>
            </span>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          placeholder={loading ? "Loading…" : "Paste the bible content here…"}
          disabled={loading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono leading-relaxed disabled:opacity-60"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Bible"}
          </button>
          <span className="text-xs text-muted-foreground">
            {content.length.toLocaleString()} characters
          </span>
          {msg && (
            <span
              className={
                "text-sm " + (msg.kind === "ok" ? "text-primary" : "text-destructive")
              }
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

