import { useState, useEffect, useCallback } from "react";
import {
  Play,
  CheckCircle,
  XCircle,
  Code,
  Smartphone,
  Terminal,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  AlertTriangle,
  Github,
  ExternalLink,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { generateMaestroFlow, triggerEasTestRun, listEasTestRuns } from "@/lib/eas-testing.functions";
import { getMaestroWorkflowStatus } from "@/lib/maestro-cloud.functions";
import { listEasBuilds } from "@/lib/eas.functions";
import { supabase } from "@/integrations/supabase/client";

export function TestingPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [yamlFlow, setYamlFlow] = useState<string>("");
  const [builds, setBuilds] = useState<any[]>([]);
  const [selectedBuildId, setSelectedBuildId] = useState<string>("");
  const [testRuns, setTestRuns] = useState<any[]>([]);
  const [activeRun, setActiveRun] = useState<any | null>(null);

  const [generating, setGenerating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Prerequisite state — surfaced as a banner above the action bar.
  // Each state corresponds to exactly one missing piece of one-time setup;
  // `ready` is what unlocks the Run button.
  type Prereq =
    | { state: "loading" }
    | { state: "no_github" }
    | { state: "no_workflow_scope" }
    | { state: "no_repo" }
    | {
        state: "ready";
        workflowPresent: boolean;
        webhookTokenConfigured: boolean;
        repo: { owner: string; name: string; branch: string };
      };
  const [prereq, setPrereq] = useState<Prereq>({ state: "loading" });

  const generateFlowFn = useServerFn(generateMaestroFlow);
  const triggerTestFn = useServerFn(triggerEasTestRun);
  const listTestRunsFn = useServerFn(listEasTestRuns);
  const listBuildsFn = useServerFn(listEasBuilds);
  const workflowStatusFn = useServerFn(getMaestroWorkflowStatus);

  // Load history and builds on load
  const loadData = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const buildsRes = await listBuildsFn({ data: { projectId } });
      if (buildsRes.ok) {
        setBuilds(buildsRes.builds);
        // Default to the first finished build if available
        const firstFinished = buildsRes.builds.find((b: any) => b.status === "finished");
        if (firstFinished) setSelectedBuildId(firstFinished.id);
      }

      const runsRes = await listTestRunsFn({ data: { projectId } });
      if (runsRes.ok) {
        setTestRuns(runsRes.testRuns);
        if (runsRes.testRuns.length > 0) {
          // Default to showing the latest run details
          setActiveRun(runsRes.testRuns[0]);
          setYamlFlow(runsRes.testRuns[0].yaml_flow);
        }
      }

      // Maestro Cloud prerequisite checklist (GitHub linked, scope present,
      // repo linked, workflow installed). The Run button gates on the
      // `ready` state.
      const wfRes = await workflowStatusFn({ data: { projectId } });
      if (wfRes.ok) {
        if (!wfRes.githubConnected) setPrereq({ state: "no_github" });
        else if (!wfRes.hasWorkflowScope) setPrereq({ state: "no_workflow_scope" });
        else if (!wfRes.repoLinked) setPrereq({ state: "no_repo" });
        else
          setPrereq({
            state: "ready",
            workflowPresent: !!wfRes.workflowPresent,
            webhookTokenConfigured: !!wfRes.webhookTokenConfigured,
            repo: { owner: wfRes.repo.owner, name: wfRes.repo.name, branch: wfRes.repo.branch },
          });
      }
    } catch {
      toast.error("Failed to load testing dashboard data");
    } finally {
      setLoadingHistory(false);
    }
  }, [projectId, listBuildsFn, listTestRunsFn, workflowStatusFn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription — Maestro webhook writes status transitions to the
  // active run's row, so we live-refresh as queued → running → passed.
  useEffect(() => {
    if (!activeRun?.id) return;
    const channel = supabase
      .channel(`eas_test_runs:${activeRun.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "eas_test_runs",
          filter: `id=eq.${activeRun.id}`,
        },
        (payload) => {
          const fresh = payload.new as Record<string, unknown>;
          setActiveRun((cur: any) => (cur && cur.id === fresh.id ? { ...cur, ...fresh } : cur));
          setTestRuns((rs) => rs.map((r) => (r.id === fresh.id ? { ...r, ...fresh } : r)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRun?.id]);

  // Generate a new AI Maestro flow
  const handleGenerateFlow = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await generateFlowFn({ data: { projectId } });
      if (res.ok && res.yamlFlow) {
        setYamlFlow(res.yamlFlow);
        toast.success("AI generated a fresh Maestro test flow!");
      } else {
        toast.error(res.error || "Failed to generate test flow");
      }
    } catch (e) {
      toast.error("Error generating test flow");
    } finally {
      setGenerating(false);
    }
  }, [projectId, generateFlowFn]);

  // Trigger test execution
  const handleRunTest = useCallback(async () => {
    if (!yamlFlow.trim()) {
      toast.error("Maestro YAML flow is empty");
      return;
    }
    if (!selectedBuildId) {
      toast.error("Pick a finished EAS build first — Maestro tests run against a real artifact.");
      return;
    }
    if (prereq.state !== "ready") {
      toast.error("Resolve the prerequisites above before running a test.");
      return;
    }
    setTriggering(true);
    try {
      const res = await triggerTestFn({
        data: {
          projectId,
          buildId: selectedBuildId,
          yamlFlow: yamlFlow.trim(),
        },
      });
      if (res.ok) {
        toast.success("Workflow dispatched — watch the run below as Maestro picks it up.");
        // Refresh runs
        setTimeout(async () => {
          const runsRes = await listTestRunsFn({ data: { projectId } });
          if (runsRes.ok) {
            setTestRuns(runsRes.testRuns);
            const triggeredRun = runsRes.testRuns.find((r: any) => r.id === res.testRunId);
            if (triggeredRun) setActiveRun(triggeredRun);
          }
        }, 300);
      } else {
        toast.error(res.error || "Failed to start test execution");
      }
    } catch {
      toast.error("Error triggering test execution");
    } finally {
      setTriggering(false);
    }
  }, [projectId, selectedBuildId, yamlFlow, prereq.state, triggerTestFn, listTestRunsFn]);

  // We require webhookTokenConfigured to dispatch — otherwise the run would
  // succeed in Maestro but its webhook would 401 here and the row would sit
  // at "running" forever from the user's POV.
  const canRun =
    prereq.state === "ready" &&
    prereq.webhookTokenConfigured &&
    !triggering &&
    !generating &&
    !!yamlFlow &&
    !!selectedBuildId;

  // Per-state banner content. Single source of truth so the action bar +
  // disabled state stay in sync.
  const finishedBuilds = builds.filter((b) => b.status === "finished" && !!b.artifact_url);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Upper Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4 bg-card/20">
        <div>
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> Maestro Cloud Testing
          </h2>
          <p className="text-[10px] text-muted-foreground">
            Real device runs via GitHub Actions + Maestro Cloud — status streamed live as the run progresses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Build selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Target Build</span>
            <select
              value={selectedBuildId}
              onChange={(e) => setSelectedBuildId(e.target.value)}
              className="rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs outline-none focus:border-primary/40"
            >
              <option value="">
                {finishedBuilds.length === 0 ? "No finished EAS builds yet" : "Pick a finished build…"}
              </option>
              {finishedBuilds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.platform.toUpperCase()} ({b.git_ref?.slice(0, 7) || "main"})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="mt-3.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/40 hover:text-foreground transition-colors"
            title="Refresh history"
          >
            {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleRunTest}
            disabled={!canRun}
            className="mt-3.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 text-xs font-semibold hover:bg-primary/95 disabled:opacity-50 transition-all"
          >
            {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
            {triggering ? "Dispatching workflow…" : "Run Maestro Test"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-3.5 inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card/40 px-3 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            Close
          </button>
        </div>
      </div>

      {/* Prerequisite banner — only visible when something is missing or
          when the workflow file isn't yet committed. Each state explains the
          exact one-time setup the user needs to do. */}
      {prereq.state !== "ready" && prereq.state !== "loading" && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
          {prereq.state === "no_github" && (
            <>
              <Github className="inline h-3.5 w-3.5 mr-1.5" /> Maestro Cloud runs need a linked GitHub repo. Connect GitHub from Settings, then come back.
            </>
          )}
          {prereq.state === "no_workflow_scope" && (
            <>
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" /> Your existing GitHub connection is missing the <code className="font-mono">workflow</code> scope. Disconnect + reconnect — the studio will request the right scope this time.
            </>
          )}
          {prereq.state === "no_repo" && (
            <>
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" /> Push this project to a GitHub repo from the Deployments panel first — that's where the workflow file goes.
            </>
          )}
        </div>
      )}
      {prereq.state === "ready" && (!prereq.workflowPresent || !prereq.webhookTokenConfigured) && (
        <div className="border-b border-sky-500/30 bg-sky-500/5 px-4 py-3 text-xs text-sky-200 space-y-2">
          {!prereq.workflowPresent && (
            <div className="flex items-start gap-2">
              <Code className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                First run will commit <code className="font-mono">.github/workflows/maestro-cloud.yml</code> to <code className="font-mono">{prereq.repo.owner}/{prereq.repo.name}</code> ({prereq.repo.branch}). Add a repo secret named <code className="font-mono">MAESTRO_API_KEY</code> with your Maestro Cloud API key first.
              </span>
            </div>
          )}
          {!prereq.webhookTokenConfigured && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Pick a long random secret. Save it in the <strong>AI &amp; Env Keys</strong> panel as <code className="font-mono">MAESTRO_WEBHOOK_TOKEN</code>. Then paste the same value into your Maestro Cloud project under <em>Settings → Webhooks</em> as the Bearer token. Without this, Maestro can't post results back here.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Side - Editor & History */}
        <div className="lg:col-span-6 flex flex-col border-r border-border overflow-hidden h-full">
          {/* YAML editor panel */}
          <div className="flex-1 flex flex-col border-b border-border overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-card/30 px-4 py-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Code className="h-3.5 w-3.5" /> Maestro YAML Script
              </span>
              <button
                type="button"
                onClick={handleGenerateFlow}
                disabled={generating}
                className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
              >
                {generating ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                Generate AI Test Flow
              </button>
            </div>
            <textarea
              value={yamlFlow}
              onChange={(e) => setYamlFlow(e.target.value)}
              placeholder="# Auto-generated Maestro YAML flow goes here...&#10;appId: app.lovable.studio&#10;---&#10;- launchApp"
              className="flex-1 resize-none bg-card/10 font-mono text-[11px] leading-relaxed p-4 outline-none border-none text-foreground/90 selection:bg-primary/25"
            />
          </div>

          {/* Test history list */}
          <div className="h-56 flex flex-col bg-card/5 overflow-hidden">
            <div className="border-b border-border px-4 py-2 bg-card/30">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Execution History</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {testRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs py-8">
                  No previous QA sweeps found.
                </div>
              ) : (
                testRuns.map((run) => {
                  const isActive = activeRun?.id === run.id;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => {
                        setActiveRun(run);
                        setYamlFlow(run.yaml_flow);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all ${
                        isActive ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-card/30"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">QA Run #{run.id.slice(0, 5)}</span>
                          {(() => {
                            const cls =
                              run.status === "passed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : run.status === "failed" || run.status === "errored"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : run.status === "cancelled"
                                    ? "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse";
                            return (
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
                                {(run.status as string).toUpperCase()}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(run.created_at).toLocaleString()}
                        </p>
                      </div>
                      {run.status === "passed" ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 ml-3" />
                      ) : run.status === "failed" || run.status === "errored" ? (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0 ml-3" />
                      ) : run.status === "cancelled" ? (
                        <XCircle className="h-4 w-4 text-neutral-400 shrink-0 ml-3" />
                      ) : (
                        <Loader2 className="h-4 w-4 text-amber-400 shrink-0 animate-spin ml-3" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Logs & Screenshots */}
        <div className="lg:col-span-6 flex flex-col overflow-hidden h-full">
          {activeRun ? (
            <>
              {/* Screenshots Step timeline */}
              <div className="flex-1 flex flex-col border-b border-border overflow-hidden bg-card/10">
                <div className="border-b border-border bg-card/30 px-4 py-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5" /> Step-by-Step UI Verification
                  </span>
                </div>
                <div className="flex-1 overflow-x-auto p-4 flex items-center gap-4 bg-gradient-to-b from-card/3 to-card/15">
                  {activeRun.screenshots && activeRun.screenshots.length > 0 ? (
                    activeRun.screenshots.map((url: string, idx: number) => (
                      <div key={idx} className="flex flex-col items-center shrink-0 space-y-2.5">
                        <span className="text-[9px] font-mono bg-card/80 border border-border/80 px-2 py-0.5 rounded-full">
                          Step {idx + 1}
                        </span>
                        {/* Simulated Phone Frame */}
                        <div className="w-[145px] h-[280px] rounded-[24px] border-[5px] border-neutral-800 bg-neutral-950 overflow-hidden shadow-xl ring-2 ring-primary/10 relative">
                          <img
                            src={url}
                            alt={`Maestro step screenshot ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {/* Emulated phone details */}
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-14 h-3 bg-neutral-900 rounded-full" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full text-muted-foreground text-xs py-12 gap-2">
                      <Smartphone className="h-10 w-10 opacity-20" />
                      No screenshots recorded for this run.
                    </div>
                  )}
                </div>
              </div>

              {/* Console log console */}
              <div className="h-60 flex flex-col bg-neutral-950 font-mono text-[10px] leading-relaxed overflow-hidden text-neutral-300">
                <div className="border-b border-neutral-800 px-4 py-2 bg-neutral-900 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="text-[9px] uppercase tracking-widest text-neutral-400">Maestro Test Logs</span>
                  </div>
                  {/* GitHub Actions deep-link — only renders when we know the run id. */}
                  {activeRun.github_workflow_run_id && prereq.state === "ready" && (
                    <a
                      href={`https://github.com/${prereq.repo.owner}/${prereq.repo.name}/actions/runs/${activeRun.github_workflow_run_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-neutral-400 hover:text-primary transition-colors"
                    >
                      <Github className="h-3 w-3" /> View on GitHub <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <pre className="flex-1 overflow-y-auto p-4 select-text whitespace-pre-wrap font-mono text-neutral-300 selection:bg-neutral-800">
                  {activeRun.logs || "No logs available."}
                  {activeRun.error_text && `\n❌ RUN ERROR:\n${activeRun.error_text}`}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs p-12 gap-3">
              <Smartphone className="h-12 w-12 opacity-25 animate-pulse" />
              <p className="max-w-[320px] text-center leading-relaxed">
                Pick a finished EAS build, edit (or AI-generate) the Maestro YAML flow on the left, then click <strong>Run Maestro Test</strong>. The workflow dispatches in your GitHub repo and Maestro Cloud streams status back here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
