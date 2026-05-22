import { useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot, Cpu, Palette, Database, TestTube, Zap, Shield, Rocket, BarChart3,
  Play, Pause, RotateCcw, CheckCircle2, Clock, AlertTriangle, Loader2,
  ChevronRight, ChevronDown, X, Layers, ArrowRight, FileText,
} from "lucide-react";
import { runAgentStage, type PipelineStageId } from "@/lib/agent-pipeline.functions";
import ReactMarkdown from "react-markdown";

/* ─── Types ──────────────────────────────────────────── */
type AgentStatus = "idle" | "working" | "done" | "error";

interface AgentDef {
  id: PipelineStageId;
  name: string;
  role: string;
  icon: typeof Bot;
  color: string;
}

interface StageResult {
  output: string;
  tokens: number;
  cost: number;
  elapsed: number;
  provider?: string;
  model?: string;
  error?: string;
}

interface ActivityEvent {
  id: string;
  agentId: PipelineStageId;
  action: string;
  detail: string;
  ts: number;
}

/* ─── Agent Roster ───────────────────────────────────── */
const AGENTS: AgentDef[] = [
  { id: "architect", name: "Product Architect", role: "Requirements → PRD", icon: Cpu, color: "#818cf8" },
  { id: "designer", name: "UI Designer", role: "Visual Design", icon: Palette, color: "#f472b6" },
  { id: "backend", name: "Backend Engineer", role: "Data & Logic", icon: Database, color: "#34d399" },
  { id: "qa", name: "QA Tester", role: "Quality Assurance", icon: TestTube, color: "#fbbf24" },
  { id: "perf", name: "Performance", role: "Speed & Size", icon: Zap, color: "#fb923c" },
  { id: "security", name: "Security Auditor", role: "Security", icon: Shield, color: "#f87171" },
  { id: "devops", name: "DevOps & Deploy", role: "Build & Ship", icon: Rocket, color: "#60a5fa" },
  { id: "analytics", name: "Analytics Agent", role: "Insights", icon: BarChart3, color: "#a78bfa" },
];

const PIPELINE_ORDER: PipelineStageId[] = ["architect", "designer", "backend", "qa", "perf", "security", "devops", "analytics"];

function genId() { return Math.random().toString(36).slice(2, 9); }

/* ─── Pipeline Viz ───────────────────────────────────── */
function PipelineViz({ agentStates }: { agentStates: Record<PipelineStageId, AgentStatus> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "12px 0", overflowX: "auto" }}>
      {PIPELINE_ORDER.map((id, i) => {
        const a = AGENTS.find(x => x.id === id)!;
        const st = agentStates[id];
        const bg = st === "done" ? a.color + "33" : st === "working" ? a.color + "55" : st === "error" ? "#f8717133" : "rgba(255,255,255,0.04)";
        const border = st === "working" ? a.color : st === "error" ? "#f87171" : "rgba(255,255,255,0.08)";
        return (
          <div key={id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              padding: "6px 10px", borderRadius: 8, background: bg, border: `1px solid ${border}`,
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.3s",
              boxShadow: st === "working" ? `0 0 12px ${a.color}44` : "none",
            }}>
              <a.icon style={{ width: 14, height: 14, color: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: st === "idle" ? "#888" : "#ddd", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {a.name.split(" ")[0]}
              </span>
              {st === "working" && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
              {st === "done" && <CheckCircle2 style={{ width: 12, height: 12, color: "#34d399" }} />}
              {st === "error" && <X style={{ width: 12, height: 12, color: "#f87171" }} />}
              {st === "idle" && <Clock style={{ width: 12, height: 12, color: "#555" }} />}
            </div>
            {i < PIPELINE_ORDER.length - 1 && <ArrowRight style={{ width: 12, height: 12, color: "#444", margin: "0 2px", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */
export function AgentOrchestrator({ projectId }: { projectId: string }) {
  const runStage = useServerFn(runAgentStage);

  const [agentStates, setAgentStates] = useState<Record<PipelineStageId, AgentStatus>>(
    () => Object.fromEntries(AGENTS.map(a => [a.id, "idle" as AgentStatus])) as Record<PipelineStageId, AgentStatus>
  );
  const [results, setResults] = useState<Record<string, StageResult>>({});
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"agents" | "activity">("agents");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const addActivity = useCallback((agentId: PipelineStageId, action: string, detail: string) => {
    setActivity(prev => [{ id: genId(), agentId, action, detail, ts: Date.now() }, ...prev].slice(0, 100));
  }, []);

  const runPipeline = useCallback(async () => {
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    setAgentStates(Object.fromEntries(AGENTS.map(a => [a.id, "idle"])) as any);
    setResults({});
    setActivity([]);
    addActivity("architect", "🚀 Pipeline Started", "Agent swarm initialized — calling real AI for each stage");

    const outputs: Record<string, string> = {};

    for (const stage of PIPELINE_ORDER) {
      // Check for pause
      while (pauseRef.current) {
        await new Promise(r => setTimeout(r, 300));
      }

      const agent = AGENTS.find(a => a.id === stage)!;
      setAgentStates(prev => ({ ...prev, [stage]: "working" }));
      addActivity(stage, "⏳ Working", `${agent.name} is analyzing the project...`);

      try {
        const result = await runStage({
          data: { projectId, stage, previousOutputs: outputs },
        });

        if (result.ok) {
          outputs[stage] = result.output;
          setResults(prev => ({
            ...prev,
            [stage]: {
              output: result.output,
              tokens: result.tokens,
              cost: result.cost,
              elapsed: result.elapsed,
              provider: result.provider,
              model: result.model,
            },
          }));
          setAgentStates(prev => ({ ...prev, [stage]: "done" }));
          addActivity(stage, "✅ Complete", `${agent.name} finished in ${(result.elapsed / 1000).toFixed(1)}s — ${result.tokens.toLocaleString()} tokens ($${result.cost.toFixed(4)}) via ${result.model}`);
        } else {
          setResults(prev => ({ ...prev, [stage]: { output: "", tokens: 0, cost: 0, elapsed: 0, error: result.error } }));
          setAgentStates(prev => ({ ...prev, [stage]: "error" }));
          addActivity(stage, "❌ Error", `${agent.name}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setResults(prev => ({ ...prev, [stage]: { output: "", tokens: 0, cost: 0, elapsed: 0, error: msg } }));
        setAgentStates(prev => ({ ...prev, [stage]: "error" }));
        addActivity(stage, "❌ Error", `${agent.name}: ${msg}`);
      }
    }

    setRunning(false);
    addActivity("architect", "🏁 Pipeline Complete", "All agents finished. Check each agent's output below.");
  }, [projectId, runStage, addActivity]);

  const togglePause = useCallback(() => {
    pauseRef.current = !pauseRef.current;
    setPaused(p => !p);
  }, []);

  const doneCount = Object.values(agentStates).filter(s => s === "done").length;
  const errorCount = Object.values(agentStates).filter(s => s === "error").length;
  const totalTokens = Object.values(results).reduce((s, r) => s + r.tokens, 0);
  const totalCost = Object.values(results).reduce((s, r) => s + r.cost, 0);
  const pipelineComplete = !running && doneCount + errorCount === 8;

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
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Agent Orchestrator</h3>
              <p style={{ fontSize: 9, color: "#888", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {running ? (paused ? "⏸ Paused" : "🔄 Running AI calls...") : pipelineComplete ? "✅ Complete" : "Ready — Real AI"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {!running && !pipelineComplete && (
              <button onClick={runPipeline} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
                <Play style={{ width: 12, height: 12 }} /> Run Agents
              </button>
            )}
            {running && (
              <button onClick={togglePause} style={{ padding: "6px 10px", borderRadius: 6, background: paused ? "#22c55e33" : "#fbbf2433", color: paused ? "#22c55e" : "#fbbf24", border: `1px solid ${paused ? "#22c55e44" : "#fbbf2444"}`, cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
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
            { label: "Est. Cost", value: totalCost > 0 ? `$${totalCost.toFixed(4)}` : "—", color: "#fbbf24" },
          ].map(s => (
            <div key={s.label} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "#777", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <PipelineViz agentStates={agentStates} />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
          {(["agents", "activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", fontSize: 10, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.06em", cursor: "pointer", border: "none",
              borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
              background: "transparent", color: tab === t ? "#e4e4e7" : "#666",
            }}>{t === "agents" ? "Agents & Output" : "Activity Log"}</button>
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
              const r = results[a.id];
              return (
                <div key={a.id} style={{ borderRadius: 10, border: `1px solid ${st === "working" ? a.color + "55" : st === "error" ? "#f8717155" : "rgba(255,255,255,0.06)"}`, background: st === "working" ? a.color + "08" : "rgba(255,255,255,0.02)", overflow: "hidden", transition: "all 0.3s" }}>
                  <button onClick={() => setExpandedAgent(expanded ? null : a.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", color: "#e4e4e7", textAlign: "left" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: a.color + "22", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <a.icon style={{ width: 14, height: 14, color: a.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {a.name}
                        {st === "working" && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                        {st === "done" && <CheckCircle2 style={{ width: 12, height: 12, color: "#34d399" }} />}
                        {st === "error" && <AlertTriangle style={{ width: 12, height: 12, color: "#f87171" }} />}
                        {st === "idle" && <Clock style={{ width: 12, height: 12, color: "#555" }} />}
                      </div>
                      <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.role}</div>
                    </div>
                    {r && r.tokens > 0 && (
                      <span style={{ fontSize: 9, color: a.color, fontWeight: 600, whiteSpace: "nowrap" }}>{r.tokens.toLocaleString()} tok · {(r.elapsed / 1000).toFixed(1)}s</span>
                    )}
                    {expanded ? <ChevronDown style={{ width: 14, height: 14, color: "#666" }} /> : <ChevronRight style={{ width: 14, height: 14, color: "#666" }} />}
                  </button>
                  {expanded && (
                    <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      {r?.error && (
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: "#f8717115", border: "1px solid #f8717133", marginTop: 8, fontSize: 11, color: "#f87171" }}>
                          ❌ {r.error}
                        </div>
                      )}
                      {r?.output && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 9, color: a.color, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                              <FileText style={{ width: 10, height: 10 }} /> Agent Output
                            </span>
                            <span style={{ fontSize: 8, color: "#666" }}>{r.provider}/{r.model}</span>
                          </div>
                          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", fontSize: 11, lineHeight: 1.6, maxHeight: 400, overflow: "auto" }}
                            className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{r.output}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                      {st === "idle" && !r && (
                        <p style={{ fontSize: 10, color: "#666", margin: "8px 0 0" }}>Waiting for pipeline to reach this stage</p>
                      )}
                      {st === "working" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: a.color, fontSize: 11 }}>
                          <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                          Calling AI... this may take 10-30 seconds
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {activity.length === 0 ? (
              <p style={{ fontSize: 11, color: "#666", textAlign: "center", padding: 32 }}>Click "Run Agents" to start the real AI pipeline</p>
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
