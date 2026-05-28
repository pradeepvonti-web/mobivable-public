import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Cloud, Database, FunctionSquare, HardDrive, Loader2, Lock, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inferBackendSpec, applyBackendSchema, getBackendSpec } from "@/lib/backend-provision.functions";
import { deployEdgeFunctions } from "@/lib/edge-functions.functions";
import type { MEdgeFunction, MPgFunction, MStorageBucket } from "@/lib/mobile-app-schema";

function BackendPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [connected, setConnected] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  async function testConnection() {
    setTestResult(null);
    setTesting(true);
    try {
      const url = supabaseUrl.trim().replace(/\/+$/, "");
      const key = anonKey.trim();
      if (!url || !key) throw new Error("Enter both Project URL and anon key");
      if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
        throw new Error("URL must look like https://xxxxx.supabase.co");
      }
      const started = performance.now();
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const ms = Math.round(performance.now() - started);
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid anon key (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`Unexpected response: HTTP ${res.status}`);
      setTestResult({ ok: true, message: `Connection OK · ${ms}ms` });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    (async () => {
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
                maybeSingle: () => Promise<{ data: {
                  supabase_url: string | null;
                  supabase_anon_key: string | null;
                  supabase_project_ref: string | null;
                  connected_at: string | null;
                } | null }>;
              };
            };
          };
        };
      })
        .from("project_integrations")
        .select("supabase_url,supabase_anon_key,supabase_project_ref,connected_at")
        .eq("project_id", projectId)
        .eq("user_id", uid)
        .maybeSingle();
      if (data) {
        setSupabaseUrl(data.supabase_url ?? "");
        setAnonKey(data.supabase_anon_key ?? "");
        setProjectRef(data.supabase_project_ref ?? "");
        setSavedAt(data.connected_at);
        setConnected(!!data.connected_at);
      }
      setLoading(false);
    })();
  }, [projectId]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const now = new Date().toISOString();
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("project_integrations")
        .upsert(
          {
            project_id: projectId,
            user_id: uid,
            supabase_url: supabaseUrl.trim() || null,
            supabase_anon_key: anonKey.trim() || null,
            supabase_project_ref: projectRef.trim() || null,
            connected_at: supabaseUrl.trim() && anonKey.trim() ? now : null,
          },
          { onConflict: "project_id,user_id" },
        );
      if (err) throw new Error(err.message);
      setConnected(!!(supabaseUrl.trim() && anonKey.trim()));
      setSavedAt(now);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      await (supabase as unknown as {
        from: (t: string) => {
          delete: () => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      })
        .from("project_integrations")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", uid);
      setSupabaseUrl("");
      setAnonKey("");
      setProjectRef("");
      setConnected(false);
      setSavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <div className="flex-1 overflow-y-auto">
        <header className="p-5 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg truncate">Supabase Backend</h2>
              <p className="text-xs text-muted-foreground truncate">
                Connect a Supabase project to power this mobile app
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

        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  {connected ? "Connected" : "Not connected"}
                </span>
                {savedAt && (
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    Saved {new Date(savedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project URL
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Anon / Publishable Key
                </label>
                <input
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOi…"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  The publishable/anon key is safe to embed in client apps. Never paste your
                  service role key here.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project Ref <span className="text-muted-foreground/60 normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={projectRef}
                  onChange={(e) => setProjectRef(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              {testResult && (
                <p
                  className={`text-xs font-mono ${
                    testResult.ok ? "text-emerald-500" : "text-destructive"
                  }`}
                >
                  {testResult.ok ? "✓ " : "✗ "}
                  {testResult.message}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !supabaseUrl.trim() || !anonKey.trim()}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {saving ? "Saving…" : connected ? "Update connection" : "Connect"}
                </button>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !supabaseUrl.trim() || !anonKey.trim()}
                  className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 disabled:opacity-40 transition-colors"
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
                {connected && (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={saving}
                    className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Open Supabase →
                </a>
              </div>
            </>
          )}
        </div>

        <BackendDataModelSection projectId={projectId} projectRef={projectRef} />
      </div>
    </section>
  );
}

function BackendDataModelSection({
  projectId,
  projectRef,
}: {
  projectId: string;
  projectRef: string;
}) {
  type Col = {
    name: string;
    type: string;
    nullable?: boolean;
    references?: { table: string; column?: string };
  };
  type Tbl = { name: string; columns: Col[]; rls?: string };
  const [tables, setTables] = useState<Tbl[]>([]);
  const [storage, setStorage] = useState<MStorageBucket[]>([]);
  const [pgFns, setPgFns] = useState<MPgFunction[]>([]);
  const [edgeFns, setEdgeFns] = useState<MEdgeFunction[]>([]);
  const [loading, setLoading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deployingEdge, setDeployingEdge] = useState(false);
  const [pat, setPat] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const inferFn = useServerFn(inferBackendSpec);
  const applyFn = useServerFn(applyBackendSchema);
  const getFn = useServerFn(getBackendSpec);
  const deployFn = useServerFn(deployEdgeFunctions);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await getFn({ data: { projectId } });
        if (r.ok && r.backend) {
          if (r.backend.tables) setTables(r.backend.tables as Tbl[]);
          if (r.backend.storage) setStorage(r.backend.storage);
          if (r.backend.functions) setPgFns(r.backend.functions);
          if (r.backend.edge_functions) setEdgeFns(r.backend.edge_functions);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, getFn]);

  const hasSpec =
    tables.length > 0 || storage.length > 0 || pgFns.length > 0 || edgeFns.length > 0;

  async function handleDeployEdge() {
    if (!pat.trim() || !projectRef.trim()) {
      toast.error("Need Management PAT and Project Ref");
      return;
    }
    setDeployingEdge(true);
    setResult(null);
    try {
      const r = await deployFn({
        data: {
          projectId,
          managementToken: pat.trim(),
          projectRef: projectRef.trim(),
        },
      });
      if (r.ok) {
        setResult({ ok: true, text: r.summary });
        toast.success(r.summary);
      } else {
        const errSummary = "summary" in r ? r.summary : ("error" in r ? r.error : "Deploy failed");
        setResult({ ok: false, text: errSummary });
        toast.error(errSummary);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, text: msg });
      toast.error(msg);
    } finally {
      setDeployingEdge(false);
    }
  }

  async function handleInfer() {
    setInferring(true);
    setResult(null);
    try {
      const r = await inferFn({ data: { projectId } });
      if (r.ok) {
        setTables((r.backend.tables ?? []) as Tbl[]);
        toast.success(`Inferred ${r.backend.tables?.length ?? 0} tables`);
        // inferBackendSpec only updates tables — re-fetch the full spec so any
        // architect/developer-emitted sections from agent runs stay rendered.
        const fresh = await getFn({ data: { projectId } });
        if (fresh.ok && fresh.backend) {
          if (fresh.backend.storage) setStorage(fresh.backend.storage);
          if (fresh.backend.functions) setPgFns(fresh.backend.functions);
          if (fresh.backend.edge_functions) setEdgeFns(fresh.backend.edge_functions);
        }
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInferring(false);
    }
  }

  async function handleApply() {
    if (!pat.trim() || !projectRef.trim()) {
      toast.error("Need Management PAT and Project Ref");
      return;
    }
    setApplying(true);
    setResult(null);
    try {
      const r = await applyFn({
        data: {
          projectId,
          managementToken: pat.trim(),
          projectRef: projectRef.trim(),
        },
      });
      if (r.ok) {
        setResult({ ok: true, text: "Schema applied successfully" });
        toast.success("Schema applied to your Supabase");
      } else {
        setResult({ ok: false, text: r.error });
        toast.error(r.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, text: msg });
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="p-5 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm">Data Model</h3>
          <p className="text-[11px] text-muted-foreground">
            AI-inferred tables for this app
          </p>
        </div>
        <button
          type="button"
          onClick={handleInfer}
          disabled={inferring}
          className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted/50 disabled:opacity-40 flex items-center gap-1.5"
        >
          {inferring ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {tables.length > 0 ? "Re-infer" : "Generate"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !hasSpec ? (
        <p className="text-xs text-muted-foreground italic">
          No backend spec yet. Click Generate, or run an agent crew that includes
          the Database Architect + Backend Developer roles.
        </p>
      ) : (
        <>
          {tables.length > 0 && (
            <div className="space-y-2">
              {tables.map((t) => (
                <div
                  key={t.name}
                  className="rounded-lg border border-border bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-semibold">{t.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      RLS: {t.rls ?? "owner"}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {t.columns.map((c) => (
                      <div
                        key={c.name}
                        className="flex items-center justify-between text-[10px] font-mono text-muted-foreground"
                      >
                        <span className="flex items-center gap-1">
                          {c.name}
                          {c.references && (
                            <span
                              title={`FK → ${c.references.table}.${c.references.column ?? "id"}`}
                              className="text-primary/70"
                            >
                              ↗
                            </span>
                          )}
                        </span>
                        <span>
                          {c.type}
                          {c.nullable === false ? " NOT NULL" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {storage.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                Storage buckets
              </div>
              {storage.map((b) => (
                <div
                  key={b.bucket}
                  className="rounded-lg border border-border bg-background/60 p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {b.public ? (
                      <Cloud className="h-3 w-3 text-emerald-500" aria-label="Public" />
                    ) : (
                      <Lock className="h-3 w-3 text-muted-foreground" aria-label="Private" />
                    )}
                    <span className="text-xs font-mono font-semibold">{b.bucket}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {b.public ? "public" : "owner"}
                    {b.fileSizeLimit ? ` · ≤${Math.round(b.fileSizeLimit / 1024 / 1024)} MiB` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {pgFns.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <FunctionSquare className="h-3 w-3" />
                Postgres functions
              </div>
              {pgFns.map((f) => (
                <div
                  key={f.name}
                  className="rounded-lg border border-border bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold">
                      {f.name}({f.args ?? ""}) → {f.returns}
                    </span>
                    {f.securityDefiner && (
                      <span
                        className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500"
                        title="Runs with the function owner's privileges — review before exposing."
                      >
                        DEFINER
                      </span>
                    )}
                  </div>
                  {f.description && (
                    <p className="text-[10px] text-muted-foreground">{f.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {edgeFns.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Zap className="h-3 w-3" />
                Edge functions (Deno)
              </div>
              {edgeFns.map((f) => (
                <div
                  key={f.name}
                  className="rounded-lg border border-border bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold">{f.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {f.verifyJwt === false ? "no auth" : "JWT required"}
                    </span>
                  </div>
                  {f.description && (
                    <p className="text-[10px] text-muted-foreground">{f.description}</p>
                  )}
                  {f.envVars && f.envVars.length > 0 && (
                    <p className="mt-1 text-[9px] font-mono text-muted-foreground">
                      env: {f.envVars.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {hasSpec && (
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Supabase Management PAT
          </label>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="sbp_…"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
          />
          <p className="text-[10px] text-muted-foreground">
            Create at{" "}
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              supabase.com/dashboard/account/tokens
            </a>
            . Not stored — used only for this operation.
          </p>
          {(tables.length > 0 || storage.length > 0 || pgFns.length > 0) && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !pat.trim() || !projectRef.trim()}
              className="w-full px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying schema…
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5" />
                  Apply tables + storage + functions
                </>
              )}
            </button>
          )}
          {edgeFns.length > 0 && (
            <button
              type="button"
              onClick={handleDeployEdge}
              disabled={deployingEdge || !pat.trim() || !projectRef.trim()}
              className="w-full px-4 py-2 rounded-full border border-primary text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {deployingEdge ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deploying edge functions…
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Deploy {edgeFns.length} edge function{edgeFns.length === 1 ? "" : "s"}
                </>
              )}
            </button>
          )}
          {!projectRef.trim() && (
            <p className="text-[10px] text-amber-500">
              Set Project Ref above first.
            </p>
          )}
          {result && (
            <div
              className={`rounded-md p-2 text-[11px] font-mono ${
                result.ok
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {result.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { BackendPanel };
