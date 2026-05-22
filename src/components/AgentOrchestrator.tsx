import { useState, useEffect, useCallback } from "react";
import {
  Bot, Cpu, Palette, Database, TestTube, Zap, Shield, Rocket, BarChart3,
  Play, Pause, RotateCcw, CheckCircle2, Clock, AlertTriangle, Loader2,
  ChevronRight, ChevronDown, Eye, X, Layers, ArrowRight,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
type AgentStatus = "idle" | "working" | "blocked" | "done" | "error";
type TaskStatus = "queued" | "in_progress" | "review" | "done" | "error";
type PipelineStage = "architect" | "designer" | "backend" | "qa" | "perf" | "security" | "devops" | "analytics";

interface AgentDef {
  id: PipelineStage;
  name: string;
  role: string;
  icon: typeof Bot;
  color: string;
  capabilities: string[];
}

interface AgentTask {
  id: string;
  agentId: PipelineStage;
  title: string;
  status: TaskStatus;
  output?: string;
  tokens: number;
  cost: number;
  startedAt?: number;
  completedAt?: number;
}

interface ActivityEvent {
  id: string;
  agentId: PipelineStage;
  action: string;
  detail: string;
  ts: number;
}

/* ─── Agent Roster ───────────────────────────────────── */
const AGENTS: AgentDef[] = [
  { id: "architect", name: "Product Architect", role: "Requirements → PRD", icon: Cpu, color: "#818cf8", capabilities: ["Parse prompts", "Generate PRD", "Define screens & flows", "Data model design"] },
  { id: "designer", name: "UI Designer", role: "Visual Design", icon: Palette, color: "#f472b6", capabilities: ["Component hierarchy", "Color systems", "Typography", "Animations & layouts"] },
  { id: "backend", name: "Backend Engineer", role: "Data & Logic", icon: Database, color: "#34d399", capabilities: ["API design", "Database schema", "Auth flows", "State management"] },
  { id: "qa", name: "QA Tester", role: "Quality Assurance", icon: TestTube, color: "#fbbf24", capabilities: ["Test generation", "Accessibility audit", "Edge cases", "Cross-platform"] },
  { id: "perf", name: "Performance", role: "Speed & Size", icon: Zap, color: "#fb923c", capabilities: ["Bundle analysis", "Lazy loading", "Image optimization", "Memory profiling"] },
  { id: "security", name: "Security Auditor", role: "Security", icon: Shield, color: "#f87171", capabilities: ["Input validation", "Auth hardening", "Encryption", "Vulnerability scan"] },
  { id: "devops", name: "DevOps & Deploy", role: "Build & Ship", icon: Rocket, color: "#60a5fa", capabilities: ["Native builds", "App Store metadata", "CI/CD config", "Code signing"] },
  { id: "analytics", name: "Analytics Agent", role: "Insights", icon: BarChart3, color: "#a78bfa", capabilities: ["Event tracking", "Crash reporting", "User flow analytics", "A/B tests"] },
];

const PIPELINE_ORDER: PipelineStage[] = ["architect", "designer", "backend", "qa", "perf", "security", "devops", "analytics"];

/* ─── Simulated orchestration ────────────────────────── */
function genId() { return Math.random().toString(36).slice(2, 9); }

function useOrchestrator() {
  const [agentStates, setAgentStates] = useState<Record<PipelineStage, AgentStatus>>(
    () => Object.fromEntries(AGENTS.map(a => [a.id, "idle" as AgentStatus])) as Record<PipelineStage, AgentStatus>
  );
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const addActivity = useCallback((agentId: PipelineStage, action: string, detail: string) => {
    setActivity(prev => [{ id: genId(), agentId, action, detail, ts: Date.now() }, ...prev].slice(0, 50));
  }, []);

  const runPipeline = useCallback(() => {
    setRunning(true); setPaused(false); setCurrentStage(0);
    setAgentStates(Object.fromEntries(AGENTS.map(a => [a.id, "idle"])) as any);
    setTasks([]); setActivity([]);
    addActivity("architect", "Pipeline Started", "Agent swarm initialized for app build");
  }, [addActivity]);

  useEffect(() => {
    if (!running || paused || currentStage < 0 || currentStage >= PIPELINE_ORDER.length) return;
    const stage = PIPELINE_ORDER[currentStage];
    const agent = AGENTS.find(a => a.id === stage)!;
    const taskId = genId();

    // Mark working
    setAgentStates(prev => ({ ...prev, [stage]: "working" }));
    const taskTitles: Record<PipelineStage, string> = {
      architect: "Generating Product Requirements", designer: "Creating UI Components & Styles",
      backend: "Building Data Models & APIs", qa: "Running Quality & Accessibility Tests",
      perf: "Optimizing Performance & Bundle Size", security: "Security Audit & Vulnerability Scan",
      devops: "Preparing Native Builds", analytics: "Configuring Analytics & Tracking",
    };
    const task: AgentTask = { id: taskId, agentId: stage, title: taskTitles[stage], status: "in_progress", tokens: 0, cost: 0, startedAt: Date.now() };
    setTasks(prev => [...prev, task]);
    addActivity(stage, "Started", `${agent.name} is working on: ${taskTitles[stage]}`);

    // Simulate work (1.5-3s)
    const dur = 1500 + Math.random() * 1500;
    const interval = setInterval(() => {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, tokens: t.tokens + Math.floor(Math.random() * 800 + 200), cost: +(t.cost + Math.random() * 0.02).toFixed(4) } : t));
    }, 400);

    const timer = setTimeout(() => {
      clearInterval(interval);
      const tokens = Math.floor(Math.random() * 3000 + 1500);
      const cost = +(Math.random() * 0.08 + 0.02).toFixed(4);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "done", tokens, cost, completedAt: Date.now() } : t));
      setAgentStates(prev => ({ ...prev, [stage]: "done" }));
      addActivity(stage, "Completed", `${agent.name} finished with ${tokens.toLocaleString()} tokens ($${cost})`);
      setCurrentStage(prev => prev + 1);
    }, dur);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [running, paused, currentStage, addActivity]);

  // Pipeline complete
  useEffect(() => {
    if (running && currentStage >= PIPELINE_ORDER.length) {
      setRunning(false);
      addActivity("architect", "Pipeline Complete", "All 8 agents finished. App ready for review.");
    }
  }, [currentStage, running, addActivity]);

  const totalCost = tasks.reduce((s, t) => s + t.cost, 0);
  const totalTokens = tasks.reduce((s, t) => s + t.tokens, 0);

  return { agentStates, tasks, activity, currentStage, running, paused, runPipeline, setPaused, setRunning, totalCost, totalTokens };
}

/* ─── Sub-components ─────────────────────────────────── */
const statusIcon = (s: AgentStatus) => {
  switch (s) {
    case "working": return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
    case "done": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "blocked": return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
    case "error": return <X className="h-3.5 w-3.5 text-red-400" />;
    default: return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
  }
};

function PipelineViz({ currentStage, agentStates }: { currentStage: number; agentStates: Record<PipelineStage, AgentStatus> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "12px 0", overflowX: "auto" }}>
      {PIPELINE_ORDER.map((id, i) => {
        const a = AGENTS.find(x => x.id === id)!;
        const st = agentStates[id];
        const bg = st === "done" ? a.color + "33" : st === "working" ? a.color + "55" : "rgba(255,255,255,0.04)";
        const border = st === "working" ? a.color : "rgba(255,255,255,0.08)";
        return (
          <div key={id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              padding: "6px 10px", borderRadius: 8, background: bg, border: `1px solid ${border}`,
              display: "flex", alignItems: "center", gap: 6, minWidth: 0, transition: "all 0.3s",
              boxShadow: st === "working" ? `0 0 12px ${a.color}44` : "none",
            }}>
              <a.icon style={{ width: 14, height: 14, color: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: st === "idle" ? "#888" : "#ddd", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {a.name.split(" ")[0]}
              </span>
              {statusIcon(st)}
            </div>
            {i < PIPELINE_ORDER.length - 1 && <ArrowRight style={{ width: 12, height: 12, color: "#444", margin: "0 2px", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */
export function AgentOrchestrator() {
  const { agentStates, tasks, activity, currentStage, running, paused, runPipeline, setPaused, setRunning, totalCost, totalTokens } = useOrchestrator();
  const [tab, setTab] = useState<"agents" | "tasks" | "activity">("agents");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const pipelineComplete = currentStage >= PIPELINE_ORDER.length;
  const doneCount = Object.values(agentStates).filter(s => s === "done").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0a0f", color: "#e4e4e7" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #818cf8, #6366f1)", display: "grid", placeItems: "center" }}>
              <Layers style={{ width: 14, height: 14, color: "#fff" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Agent Orchestrator</h3>
              <p style={{ fontSize: 9, color: "#888", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {running ? (paused ? "Paused" : `Stage ${currentStage + 1}/8`) : pipelineComplete ? "Complete" : "Ready"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {!running && !pipelineComplete && (
              <button onClick={runPipeline} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
                <Play style={{ width: 12, height: 12 }} /> Run Swarm
              </button>
            )}
            {running && (
              <button onClick={() => setPaused(p => !p)} style={{ padding: "6px 10px", borderRadius: 6, background: paused ? "#22c55e33" : "#fbbf2433", color: paused ? "#22c55e" : "#fbbf24", border: `1px solid ${paused ? "#22c55e44" : "#fbbf2444"}`, cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                {paused ? <><Play style={{ width: 12, height: 12 }} /> Resume</> : <><Pause style={{ width: 12, height: 12 }} /> Pause</>}
              </button>
            )}
            {pipelineComplete && (
              <button onClick={runPipeline} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, background: "#818cf833", color: "#818cf8", border: "1px solid #818cf844", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                <RotateCcw style={{ width: 12, height: 12 }} /> Re-run
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { label: "Agents Done", value: `${doneCount}/8`, color: "#34d399" },
            { label: "Tokens Used", value: totalTokens > 0 ? totalTokens.toLocaleString() : "—", color: "#60a5fa" },
            { label: "Cost", value: totalCost > 0 ? `$${totalCost.toFixed(3)}` : "—", color: "#fbbf24" },
          ].map(s => (
            <div key={s.label} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "#777", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pipeline visualization */}
        <PipelineViz currentStage={currentStage} agentStates={agentStates} />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
          {(["agents", "tasks", "activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", cursor: "pointer", border: "none",
              borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
              background: "transparent", color: tab === t ? "#e4e4e7" : "#666",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {tab === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {AGENTS.map(a => {
              const st = agentStates[a.id];
              const expanded = expandedAgent === a.id;
              const agentTasks = tasks.filter(t => t.agentId === a.id);
              return (
                <div key={a.id} style={{ borderRadius: 10, border: `1px solid ${st === "working" ? a.color + "55" : "rgba(255,255,255,0.06)"}`, background: st === "working" ? a.color + "08" : "rgba(255,255,255,0.02)", overflow: "hidden", transition: "all 0.3s" }}>
                  <button onClick={() => setExpandedAgent(expanded ? null : a.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", color: "#e4e4e7", textAlign: "left" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: a.color + "22", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <a.icon style={{ width: 14, height: 14, color: a.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {a.name} {statusIcon(st)}
                      </div>
                      <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.role}</div>
                    </div>
                    {agentTasks.length > 0 && (
                      <span style={{ fontSize: 9, color: a.color, fontWeight: 600 }}>{agentTasks.reduce((s, t) => s + t.tokens, 0).toLocaleString()} tok</span>
                    )}
                    {expanded ? <ChevronDown style={{ width: 14, height: 14, color: "#666" }} /> : <ChevronRight style={{ width: 14, height: 14, color: "#666" }} />}
                  </button>
                  {expanded && (
                    <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "8px 0" }}>
                        {a.capabilities.map(c => (
                          <span key={c} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 12, background: a.color + "15", color: a.color, fontWeight: 500 }}>{c}</span>
                        ))}
                      </div>
                      {agentTasks.map(t => (
                        <div key={t.id} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", marginTop: 6, fontSize: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 600 }}>{t.title}</span>
                            <span style={{ fontSize: 9, color: t.status === "done" ? "#34d399" : t.status === "in_progress" ? "#60a5fa" : "#888", textTransform: "uppercase" }}>{t.status.replace("_", " ")}</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, marginTop: 4, color: "#888", fontSize: 9 }}>
                            <span>{t.tokens.toLocaleString()} tokens</span>
                            <span>${t.cost.toFixed(4)}</span>
                            {t.completedAt && t.startedAt && <span>{((t.completedAt - t.startedAt) / 1000).toFixed(1)}s</span>}
                          </div>
                        </div>
                      ))}
                      {agentTasks.length === 0 && <p style={{ fontSize: 10, color: "#666", margin: "8px 0 0" }}>No tasks yet</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tasks.length === 0 ? (
              <p style={{ fontSize: 11, color: "#666", textAlign: "center", padding: 32 }}>Run the swarm to generate tasks</p>
            ) : (
              <>
                {(["in_progress", "done", "queued", "error"] as TaskStatus[]).map(status => {
                  const group = tasks.filter(t => t.status === status);
                  if (group.length === 0) return null;
                  const colors: Record<TaskStatus, string> = { in_progress: "#60a5fa", done: "#34d399", queued: "#888", review: "#fbbf24", error: "#f87171" };
                  return (
                    <div key={status}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: colors[status], padding: "8px 0 4px" }}>
                        {status.replace("_", " ")} ({group.length})
                      </div>
                      {group.map(t => {
                        const agent = AGENTS.find(a => a.id === t.agentId)!;
                        return (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
                            <agent.icon style={{ width: 14, height: 14, color: agent.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                              <div style={{ fontSize: 9, color: "#888" }}>{agent.name} · {t.tokens.toLocaleString()} tok · ${t.cost.toFixed(4)}</div>
                            </div>
                            {t.status === "in_progress" && <Loader2 style={{ width: 14, height: 14, color: "#60a5fa" }} className="animate-spin" />}
                            {t.status === "done" && <CheckCircle2 style={{ width: 14, height: 14, color: "#34d399" }} />}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {activity.length === 0 ? (
              <p style={{ fontSize: 11, color: "#666", textAlign: "center", padding: 32 }}>No activity yet</p>
            ) : activity.map(ev => {
              const agent = AGENTS.find(a => a.id === ev.agentId)!;
              return (
                <div key={ev.id} style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: agent.color + "22", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                    <agent.icon style={{ width: 10, height: 10, color: agent.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>{ev.action}</div>
                    <div style={{ fontSize: 9, color: "#888", marginTop: 1 }}>{ev.detail}</div>
                    <div style={{ fontSize: 8, color: "#555", marginTop: 2 }}>{new Date(ev.ts).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
