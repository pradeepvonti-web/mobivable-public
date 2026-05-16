import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  Users,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Bot,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AGENTS,
  ALL_ROLES,
  COMPLEXITY_PRESETS,
  type AgentRole,
} from "@/lib/agents";
import {
  recommendAgents,
  startAgentRun,
  runAgentTask,
  finalizeAgentRun,
} from "@/lib/agent-run.functions";

type Run = {
  id: string;
  status: string;
  selected_roles: string[];
  created_at: string;
};
type Task = {
  id: string;
  role: string;
  ordinal: number;
  status: "waiting" | "working" | "completed" | "failed";
  output: string | null;
  error_text: string | null;
};
type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

const STATUS_STYLES: Record<Task["status"], string> = {
  waiting: "bg-muted text-muted-foreground",
  working: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-destructive/15 text-destructive",
};

export function AgentWorkspace({ projectId }: { projectId: string }) {
  const recommendFn = useServerFn(recommendAgents);
  const startFn = useServerFn(startAgentRun);
  const runTaskFn = useServerFn(runAgentTask);
  const finalizeFn = useServerFn(finalizeAgentRun);

  const [recommending, setRecommending] = useState(false);
  const [selected, setSelected] = useState<Set<AgentRole>>(
    new Set(COMPLEXITY_PRESETS.standard),
  );
  const [run, setRun] = useState<Run | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [orchestrating, setOrchestrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Load latest run for this project.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: runs } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!active) return;
      const r = (runs?.[0] as Run | undefined) ?? null;
      setRun(r);
      if (r) {
        await Promise.all([loadTasks(r.id), loadMessages(r.id)]);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  async function loadTasks(runId: string) {
    const { data } = await supabase
      .from("agent_tasks")
      .select("id, role, ordinal, status, output, error_text")
      .eq("run_id", runId)
      .order("ordinal", { ascending: true });
    setTasks((data ?? []) as Task[]);
  }
  async function loadMessages(runId: string) {
    const { data } = await supabase
      .from("agent_messages")
      .select("id, role, content, created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }

  // Realtime subscribe to current run.
  useEffect(() => {
    if (!run) return;
    const ch = supabase
      .channel(`agent_run_${run.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_tasks", filter: `run_id=eq.${run.id}` },
        () => loadTasks(run.id),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_messages", filter: `run_id=eq.${run.id}` },
        () => loadMessages(run.id),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${run.id}` },
        (p) => setRun(p.new as Run),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [run?.id]);

  async function handleRecommend() {
    setRecommending(true);
    setError(null);
    try {
      const res = await recommendFn({ data: { projectId } });
      if (res.ok) setSelected(new Set(res.roles));
      else setError(res.error);
    } finally {
      setRecommending(false);
    }
  }

  function toggle(role: AgentRole) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(role) ? n.delete(role) : n.add(role);
      return n;
    });
  }

  async function handleStart() {
    if (selected.size === 0) return;
    setError(null);
    const res = await startFn({
      data: { projectId, roles: Array.from(selected) },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { data: r } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", res.runId)
      .single();
    setRun(r as Run);
    await loadTasks(res.runId);
    startedRef.current = false;
  }

  // Orchestrate: when there's a running run with waiting tasks, walk them in order.
  useEffect(() => {
    if (!run || run.status !== "running") return;
    if (orchestrating || startedRef.current) return;
    const next = tasks.find((t) => t.status === "waiting");
    if (!next) {
      // All done — finalize.
      if (
        tasks.length > 0 &&
        tasks.every((t) => t.status === "completed" || t.status === "failed")
      ) {
        startedRef.current = true;
        void finalizeFn({ data: { runId: run.id } });
      }
      return;
    }
    setOrchestrating(true);
    (async () => {
      const taskList = [...tasks];
      for (const t of taskList) {
        if (t.status !== "waiting") continue;
        const res = await runTaskFn({ data: { taskId: t.id } });
        if (!res.ok) {
          setError(res.error);
          break;
        }
      }
      await finalizeFn({ data: { runId: run.id } });
      setOrchestrating(false);
    })();
  }, [run?.id, run?.status, tasks.length]);

  const progress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const done = tasks.filter((t) => t.status === "completed" || t.status === "failed").length;
    return Math.round((done / tasks.length) * 100);
  }, [tasks]);

  // ============== RENDER ==============

  if (!run) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-background/95 backdrop-blur p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              <span className="font-display text-[11px] uppercase tracking-widest">
                AI Development Protocol v4.0
              </span>
            </div>
            <h2 className="font-display text-2xl">Assemble your agent team</h2>
            <p className="text-sm text-muted-foreground">
              Pick the specialists who'll design, build, test and ship this app.
              Or let Mobivable recommend a team based on your idea.
            </p>
          </header>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRecommend}
              disabled={recommending}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 h-9 text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {recommending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Recommend agents
            </button>
            {(["simple", "standard", "ai_powered", "enterprise"] as const).map(
              (k) => (
                <button
                  key={k}
                  onClick={() => setSelected(new Set(COMPLEXITY_PRESETS[k]))}
                  className="rounded-full border border-border px-3 h-9 text-xs text-muted-foreground hover:border-primary hover:text-primary capitalize"
                >
                  {k.replace("_", " ")}
                </button>
              ),
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {ALL_ROLES.map((role) => {
              const def = AGENTS[role];
              const on = selected.has(role);
              return (
                <button
                  key={role}
                  onClick={() => toggle(role)}
                  className={`text-left rounded-2xl border p-4 transition-colors ${
                    on
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/15 grid place-items-center text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{def.name}</div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {COMPLEXITY_PRESETS.standard.includes(role)
                            ? "Recommended"
                            : "Optional"}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`h-5 w-5 rounded-full border-2 grid place-items-center ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {on && <CheckCircle2 className="h-3 w-3" />}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{def.short}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {def.tasks.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}

          <div className="sticky bottom-0 bg-background/95 pt-3 -mx-6 px-6 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selected.size} agents selected
            </span>
            <button
              onClick={handleStart}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 h-10 text-sm font-medium hover:bg-foreground/90 disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Start Build
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background/95 backdrop-blur">
      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                <span className="font-display text-[11px] uppercase tracking-widest">
                  Agent Run
                </span>
              </div>
              <h2 className="font-display text-xl mt-1">
                {run.status === "completed"
                  ? "Build complete"
                  : run.status === "failed"
                    ? "Build failed"
                    : "Agents at work"}
              </h2>
            </div>
            <button
              onClick={() => setRun(null)}
              className="text-xs rounded-full border border-border px-3 h-8 text-muted-foreground hover:border-primary hover:text-primary"
            >
              New run
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {progress}%
            </span>
          </div>
        </header>

        {error && (
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <div className="space-y-2">
          {tasks.map((t) => {
            const def = AGENTS[t.role as AgentRole];
            const open = expanded.has(t.id);
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                      return n;
                    })
                  }
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center text-primary shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {def?.name ?? t.role}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {def?.short}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_STYLES[t.status]}`}
                  >
                    {t.status === "working" && (
                      <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />
                    )}
                    {t.status}
                  </span>
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-3 text-sm">
                    {t.status === "waiting" && (
                      <p className="text-muted-foreground italic">
                        Waiting for previous agents…
                      </p>
                    )}
                    {t.status === "working" && (
                      <p className="text-primary flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Generating output…
                      </p>
                    )}
                    {t.status === "failed" && (
                      <p className="text-destructive">{t.error_text ?? "Failed"}</p>
                    )}
                    {t.status === "completed" && t.output && (
                      <div className="prose prose-sm prose-invert max-w-none dark:prose-invert">
                        <ReactMarkdown>{t.output}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {messages.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display text-[11px] uppercase tracking-widest text-muted-foreground">
              Collaboration feed
            </h3>
            <div className="space-y-1.5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <span className="text-primary font-medium">
                    {AGENTS[m.role as AgentRole]?.name ?? m.role}:
                  </span>
                  <span>{m.content}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
