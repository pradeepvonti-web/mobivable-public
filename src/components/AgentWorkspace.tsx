import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  Loader2, Play, CheckCircle2, AlertCircle, Users, Sparkles,
  ChevronDown, ChevronRight, Bot, Clock, Check, AlertTriangle,
  Zap, Timer, RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AGENTS, ALL_ROLES, COMPLEXITY_PRESETS, type AgentRole } from "@/lib/agents";
import { recommendAgents, startAgentRun, runAgentTask, finalizeAgentRun } from "@/lib/agent-run.functions";
import { generateMockupImage } from "@/lib/generate-mockup.functions";
import { extractThemeFromDesigner } from "@/lib/extract-theme.functions";
import { SDLCProgressBar } from "./SDLCProgressBar";

type Run = { id: string; status: string; selected_roles: string[]; created_at: string };
type Task = { id: string; role: string; ordinal: number; status: "waiting" | "working" | "completed" | "failed"; output: string | null; error_text: string | null; created_at?: string; updated_at?: string };
type Message = { id: string; role: string; content: string; created_at: string };

/* ─── Elapsed Timer ─── */
function ElapsedTimer({ since }: { since: string }) {
  const [, rerender] = useState(0);
  useEffect(() => { const i = setInterval(() => rerender(n => n + 1), 1000); return () => clearInterval(i); }, []);
  const s = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
  const m = Math.floor(s / 60);
  return <span className="text-[9px] font-mono tabular-nums text-primary">{m > 0 ? `${m}m ${s % 60}s` : `${s}s`}</span>;
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: Task["status"] }) {
  const map: Record<string, { icon: typeof Check; cls: string }> = {
    waiting: { icon: Clock, cls: "bg-muted text-muted-foreground" },
    working: { icon: Loader2, cls: "bg-primary/15 text-primary" },
    completed: { icon: Check, cls: "bg-emerald-500/15 text-emerald-500" },
    failed: { icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
  };
  const { icon: Icon, cls } = map[status] ?? map.waiting;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${cls}`}>
      <Icon className={`h-2.5 w-2.5 ${status === "working" ? "animate-spin" : ""}`} />
      {status}
    </span>
  );
}

/* ─── Timeline Item ─── */
function TimelineItem({ task, isLast, projectId, projectPrompt, projectName }: { task: Task; isLast: boolean; projectId?: string; projectPrompt?: string; projectName?: string }) {
  const [open, setOpen] = useState(false);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [mockupLoading, setMockupLoading] = useState(false);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const generateMockupFn = useServerFn(generateMockupImage);
  const extractThemeFn = useServerFn(extractThemeFromDesigner);
  const themeAppliedRef = useRef(false);
  const def = AGENTS[task.role as AgentRole];
  const time = task.updated_at || task.created_at;
  const isDesigner = task.role === "ui_ux_designer";

  // Auto-generate mockup when UI/UX Designer completes
  useEffect(() => {
    if (isDesigner && task.status === "completed" && task.output && projectId && projectPrompt && !mockupUrl && !mockupLoading && !mockupError) {
      setMockupLoading(true);
      generateMockupFn({
        data: {
          projectId,
          designerOutput: task.output,
          projectPrompt,
          projectName,
        },
      }).then((r) => {
        if (r.ok && r.imageUrl) {
          setMockupUrl(r.imageUrl);
        } else {
          setMockupError(r.ok ? (r.error ?? "Image generation not available") : r.error);
        }
      }).catch((e) => {
        setMockupError(e instanceof Error ? e.message : "Mockup generation failed");
      }).finally(() => setMockupLoading(false));
    }
  }, [isDesigner, task.status, task.output, projectId]);

  // Extract a theme from the designer spec and broadcast to the live preview.
  useEffect(() => {
    if (!isDesigner || task.status !== "completed" || !task.output || themeAppliedRef.current) return;
    themeAppliedRef.current = true;
    extractThemeFn({ data: { designerOutput: task.output, projectName } })
      .then((r) => {
        if (r.ok && r.theme) {
          window.dispatchEvent(new CustomEvent("mobile-theme-extracted", { detail: r.theme }));
        }
      })
      .catch(() => { /* non-fatal: mockup still shows */ });
  }, [isDesigner, task.status, task.output, projectName]);

  const handleRegenerateMockup = () => {
    if (!projectId || !projectPrompt || !task.output) return;
    setMockupUrl(null);
    setMockupError(null);
    setMockupLoading(true);
    generateMockupFn({
      data: {
        projectId,
        designerOutput: task.output,
        projectPrompt,
        projectName,
      },
    }).then((r) => {
      if (r.ok && r.imageUrl) setMockupUrl(r.imageUrl);
      else setMockupError(r.ok ? (r.error ?? "Image generation not available") : r.error);
    }).catch((e) => {
      setMockupError(e instanceof Error ? e.message : "Failed");
    }).finally(() => setMockupLoading(false));
  };

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector */}
      {!isLast && <div className="absolute left-[13px] top-8 bottom-0 w-px bg-border" />}
      {/* Dot */}
      <div className={`relative z-10 mt-1.5 h-[26px] w-[26px] rounded-full grid place-items-center flex-shrink-0 transition-all ${
        task.status === "working" ? "bg-primary/20 ring-2 ring-primary/40 ring-offset-1 ring-offset-background" :
        task.status === "completed" ? "bg-emerald-500/15" :
        task.status === "failed" ? "bg-destructive/15" : "bg-muted/30"
      }`}>
        {task.status === "working" ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> :
         task.status === "completed" ? <Check className="h-3 w-3 text-emerald-500" /> :
         task.status === "failed" ? <AlertTriangle className="h-3 w-3 text-destructive" /> :
         <Clock className="h-3 w-3 text-muted-foreground/40" />}
      </div>
      {/* Content */}
      <div className={`flex-1 min-w-0 pb-4 ${task.status === "working" ? "animate-pulse-subtle" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">{def?.name ?? task.role}</span>
              <StatusBadge status={task.status} />
              {task.status === "working" && task.created_at && <ElapsedTimer since={task.created_at} />}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{def?.short ?? ""}</p>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0 mt-0.5 tabular-nums">
            {time ? new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : ""}
          </span>
        </div>

        {/* Error display */}
        {task.status === "failed" && task.error_text && (
          <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-destructive" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Error Detected</span>
            </div>
            <p className="text-[11px] text-destructive/90 leading-relaxed">{task.error_text}</p>
          </div>
        )}

        {/* ─── UI/UX Designer: Mockup Image ─── */}
        {isDesigner && task.status === "completed" && (
          <div className="mt-3 space-y-2">
            {/* Mockup Image */}
            {mockupLoading && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-foreground">Generating Design Mockup...</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Creating visual mockup from your design specs</p>
                </div>
              </div>
            )}
            {mockupUrl && (
              <div className="rounded-2xl border border-primary/20 bg-card/60 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Design Mockup</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateMockup}
                    className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
                <img
                  src={mockupUrl}
                  alt="App Design Mockup"
                  className="w-full object-contain max-h-[400px]"
                />
                <div className="px-3 py-2 border-t border-border">
                  <p className="text-[10px] text-muted-foreground italic">
                    Review the mockup. Continue to implementation, or request regeneration with feedback.
                  </p>
                </div>
              </div>
            )}
            {mockupError && !mockupUrl && !mockupLoading && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-semibold text-amber-500">Mockup Unavailable</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{mockupError}</p>
                <button
                  type="button"
                  onClick={handleRegenerateMockup}
                  className="mt-2 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-primary hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Completed output */}
        {task.status === "completed" && task.output && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="mt-1.5 flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? "Hide output" : "View output"}
          </button>
        )}
        {open && task.output && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-card/60 p-3 backdrop-blur">
            <div className="prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed">
              <ReactMarkdown>{task.output}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Build Summary ─── */
function BuildSummary({ tasks, run }: { tasks: Task[]; run: Run }) {
  const completed = tasks.filter(t => t.status === "completed").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const total = tasks.length;
  const startTime = new Date(run.created_at);
  const endTask = tasks.filter(t => t.updated_at).sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())[0];
  const elapsed = endTask?.updated_at ? Math.round((new Date(endTask.updated_at).getTime() - startTime.getTime()) / 1000) : 0;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      run.status === "completed" ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
    }`}>
      <div className="flex items-center gap-2">
        {run.status === "completed" ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        <h3 className="font-display text-sm uppercase tracking-wider">
          Build {run.status === "completed" ? "Complete" : "Failed"}
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Completed", value: `${completed}/${total}`, color: "text-emerald-500" },
          { label: "Errors", value: String(failed), color: failed > 0 ? "text-destructive" : "text-muted-foreground" },
          { label: "Duration", value: elapsed > 60 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s` : `${elapsed}s`, color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {failed > 0 && (
        <div className="text-[10px] text-destructive/80 border-t border-border pt-2">
          ⚠️ {failed} agent{failed > 1 ? "s" : ""} reported errors. Review the timeline above for details.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export function AgentWorkspace({ projectId }: { projectId: string }) {
  const recommendFn = useServerFn(recommendAgents);
  const startFn = useServerFn(startAgentRun);
  const runTaskFn = useServerFn(runAgentTask);
  const finalizeFn = useServerFn(finalizeAgentRun);

  const [recommending, setRecommending] = useState(false);
  const [selected, setSelected] = useState<Set<AgentRole>>(new Set(COMPLEXITY_PRESETS.standard));
  const [run, setRun] = useState<Run | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [orchestrating, setOrchestrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "feed">("timeline");
  const [projectInfo, setProjectInfo] = useState<{ prompt: string; name: string }>({ prompt: "", name: "" });
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load project info for mockup generation
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("prompt, name").eq("id", projectId).maybeSingle();
      if (data) setProjectInfo({ prompt: data.prompt ?? "", name: data.name ?? "" });
    })();
  }, [projectId]);

  // Auto-scroll to bottom when new tasks update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [tasks]);

  // Post an assistant message to the project chat when orchestration finishes.
  const chatNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!run) return;
    if (run.status !== "completed" && run.status !== "failed") return;
    const key = `${run.id}:${run.status}`;
    if (chatNotifiedRef.current === key) return;
    chatNotifiedRef.current = key;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const completed = tasks.filter(t => t.status === "completed").length;
      const failed = tasks.filter(t => t.status === "failed").length;
      const roleList = tasks.map(t => AGENTS[t.role as AgentRole]?.name ?? t.role).join(", ");
      const content = run.status === "completed"
        ? `**Agent orchestration complete.** ${completed} agent${completed === 1 ? "" : "s"} finished${failed ? `, ${failed} failed` : ""}.\n\n_Agents:_ ${roleList}`
        : `**Agent orchestration failed.** ${completed} completed, ${failed} failed.\n\n_Agents:_ ${roleList}`;
      await supabase.from("project_messages").insert({
        project_id: projectId,
        user_id: uid,
        role: "assistant",
        content,
      });
    })();
  }, [run?.id, run?.status, tasks, projectId]);


  // Load latest run
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: runs } = await supabase.from("agent_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1);
      if (!active) return;
      const r = (runs?.[0] as Run | undefined) ?? null;
      setRun(r);
      if (r) { await Promise.all([loadTasks(r.id), loadMessages(r.id)]); }
    })();
    return () => { active = false; };
  }, [projectId]);

  async function loadTasks(runId: string) {
    const { data } = await supabase.from("agent_tasks").select("id, role, ordinal, status, output, error_text, created_at, updated_at").eq("run_id", runId).order("ordinal", { ascending: true });
    setTasks((data ?? []) as Task[]);
  }
  async function loadMessages(runId: string) {
    const { data } = await supabase.from("agent_messages").select("id, role, content, created_at").eq("run_id", runId).order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }

  // Realtime
  useEffect(() => {
    if (!run) return;
    const ch = supabase.channel(`agent_run_${run.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_tasks", filter: `run_id=eq.${run.id}` }, () => loadTasks(run.id))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_messages", filter: `run_id=eq.${run.id}` }, () => loadMessages(run.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${run.id}` }, (p) => setRun(p.new as Run))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [run?.id]);

  async function handleRecommend() {
    setRecommending(true); setError(null);
    try { const res = await recommendFn({ data: { projectId } }); if (res.ok) setSelected(new Set(res.roles)); else setError(res.error); }
    finally { setRecommending(false); }
  }

  function toggle(role: AgentRole) {
    setSelected(s => { const n = new Set(s); n.has(role) ? n.delete(role) : n.add(role); return n; });
  }

  async function handleStart() {
    if (selected.size === 0) return;
    setError(null);
    const res = await startFn({ data: { projectId, roles: Array.from(selected) } });
    if (!res.ok) { setError(res.error); return; }
    const { data: r } = await supabase.from("agent_runs").select("*").eq("id", res.runId).single();
    setRun(r as Run);
    await loadTasks(res.runId);
    startedRef.current = false;
  }

  // Orchestrate
  useEffect(() => {
    if (!run || run.status !== "running" || orchestrating || startedRef.current) return;
    const next = tasks.find(t => t.status === "waiting");
    if (!next) {
      if (tasks.length > 0 && tasks.every(t => t.status === "completed" || t.status === "failed")) {
        startedRef.current = true;
        void finalizeFn({ data: { runId: run.id } });
      }
      return;
    }
    setOrchestrating(true);
    (async () => {
      for (const t of [...tasks]) {
        if (t.status !== "waiting") continue;
        const res = await runTaskFn({ data: { taskId: t.id } });
        if (!res.ok) { setError(res.error); break; }
      }
      await finalizeFn({ data: { runId: run.id } });
      setOrchestrating(false);
    })();
  }, [run?.id, run?.status, tasks.length]);

  const progress = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter(t => t.status === "completed" || t.status === "failed").length / tasks.length) * 100);
  }, [tasks]);

  // ═══════ NO RUN: Agent Selection ═══════
  if (!run) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-background/95 backdrop-blur flex flex-col">
        <SDLCProgressBar projectId={projectId} />
        <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              <span className="font-display text-[11px] uppercase tracking-widest">AI Agent Orchestrator</span>
            </div>
            <h2 className="font-display text-2xl">Assemble your agent team</h2>
            <p className="text-sm text-muted-foreground">Pick specialists to design, build, test, and ship this app.</p>
          </header>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleRecommend} disabled={recommending} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 h-9 text-sm hover:bg-primary/90 disabled:opacity-50">
              {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Recommend agents
            </button>
            {(["simple", "standard", "ai_powered", "enterprise"] as const).map(k => (
              <button key={k} onClick={() => setSelected(new Set(COMPLEXITY_PRESETS[k]))} className="rounded-full border border-border px-3 h-9 text-xs text-muted-foreground hover:border-primary hover:text-primary capitalize">
                {k.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {ALL_ROLES.map(role => {
              const def = AGENTS[role];
              const on = selected.has(role);
              return (
                <button key={role} onClick={() => toggle(role)} className={`text-left rounded-2xl border p-4 transition-all duration-200 ${on ? "border-primary bg-primary/5 shadow-sm shadow-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-8 w-8 rounded-full grid place-items-center transition-colors ${on ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{def.name}</div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {COMPLEXITY_PRESETS.standard.includes(role) ? "Recommended" : "Optional"}
                        </div>
                      </div>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 grid place-items-center transition-all ${on ? "border-primary bg-primary text-primary-foreground scale-110" : "border-border"}`}>
                      {on && <CheckCircle2 className="h-3 w-3" />}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{def.short}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {def.tasks.slice(0, 3).map(t => (
                      <span key={t} className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {error}</p>}

          <div className="sticky bottom-0 bg-background/95 backdrop-blur pt-3 -mx-6 px-6 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selected.size} agents selected</span>
            <button onClick={handleStart} disabled={selected.size === 0} className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 h-10 text-sm font-medium hover:bg-foreground/90 disabled:opacity-40 transition-all">
              <Zap className="h-4 w-4" /> Start Build
            </button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  // ═══════ ACTIVE RUN: Timeline View ═══════
  const isRunning = run.status === "running";
  const isDone = run.status === "completed" || run.status === "failed";

  return (
    <div className="absolute inset-0 overflow-hidden bg-background/95 backdrop-blur flex flex-col">
      {/* SDLC Phase Progress */}
      <SDLCProgressBar projectId={projectId} />
      {/* Header */}
      <header className="shrink-0 p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {isRunning && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>}
              <span className="font-display text-[11px] uppercase tracking-widest text-muted-foreground">
                {isRunning ? "Building…" : isDone ? "Build " + run.status : "Agent Run"}
              </span>
            </div>
            <h2 className="font-display text-lg mt-0.5">
              {run.status === "completed" ? "✓ Build Complete" : run.status === "failed" ? "⚠ Build Failed" : "Agents Working"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isDone && (
              <button onClick={() => setRun(null)} className="inline-flex items-center gap-1.5 text-xs rounded-full border border-border px-3 h-8 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <RotateCcw className="h-3 w-3" /> New Run
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${run.status === "failed" ? "bg-destructive" : "bg-gradient-to-r from-primary to-emerald-500"}`} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-8 text-right">{progress}%</span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-0.5 w-fit">
          {(["timeline", "feed"] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)} className={`rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors ${viewMode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "timeline" ? "Status" : "Team Chat"}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="shrink-0 text-sm text-destructive flex items-center gap-2 px-4 py-2 border-b border-destructive/20 bg-destructive/5"><AlertCircle className="h-4 w-4" /> {error}</p>}

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {viewMode === "timeline" ? (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Agent count badges */}
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { label: "Total", count: tasks.length, cls: "bg-muted text-muted-foreground" },
                { label: "Working", count: tasks.filter(t => t.status === "working").length, cls: "bg-primary/15 text-primary" },
                { label: "Done", count: tasks.filter(t => t.status === "completed").length, cls: "bg-emerald-500/15 text-emerald-500" },
                { label: "Errors", count: tasks.filter(t => t.status === "failed").length, cls: "bg-destructive/15 text-destructive" },
              ].filter(b => b.count > 0).map(b => (
                <span key={b.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${b.cls}`}>
                  {b.label}: {b.count}
                </span>
              ))}
            </div>

            {/* Timeline */}
            {tasks.map((t, i) => (
              <TimelineItem key={t.id} task={t} isLast={i === tasks.length - 1} projectId={projectId} projectPrompt={projectInfo.prompt} projectName={projectInfo.name} />
            ))}

            {/* Build Summary */}
            {isDone && <BuildSummary tasks={tasks} run={run} />}
          </div>
        ) : (
          /* Team Chat view */
          <div className="max-w-2xl mx-auto space-y-3">
            <h3 className="font-display text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Team Chat</h3>
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Agents will start chatting here as they finish their work…</p>
            ) : (
              messages.map(m => {
                const def = AGENTS[m.role as AgentRole];
                // Highlight @Mentions
                const parts = m.content.split(/(@[A-Z][A-Za-z/ ]+?(?=[.,!?\s]|$))/g);
                return (
                  <div key={m.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-3 hover:border-primary/30 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 grid place-items-center text-primary shrink-0 mt-0.5 ring-1 ring-primary/20">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{def?.name ?? m.role}</span>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{def?.short ? def.short.split(" ").slice(0, 4).join(" ") : "agent"}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                        {parts.map((p, i) =>
                          p.startsWith("@") ? (
                            <span key={i} className="inline-flex items-center rounded-md bg-primary/15 text-primary px-1.5 py-0.5 font-medium">
                              {p}
                            </span>
                          ) : (
                            <span key={i}>{p}</span>
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
