import { type AgentRole, AGENTS } from "@/lib/agents";
import { Loader2, Check, AlertTriangle, Clock } from "lucide-react";

type AgentTask = {
  id: string;
  agent_role: AgentRole;
  task_name: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at?: string | null;
  completed_at?: string | null;
  result?: string | null;
  error_text?: string | null;
};

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function StatusIcon({ status }: { status: AgentTask["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "completed":
      return <Check className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
  }
}

function StatusBadge({ status }: { status: AgentTask["status"] }) {
  const colors: Record<string, string> = {
    pending: "bg-muted-foreground/10 text-muted-foreground",
    running: "bg-primary/15 text-primary",
    completed: "bg-emerald-500/15 text-emerald-500",
    failed: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${colors[status] ?? colors.pending}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

export function AgentTimeline({ tasks }: { tasks: AgentTask[] }) {
  if (!tasks.length) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
        <p>No agent tasks yet. Start a build to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-4 py-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Build Timeline
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {tasks.filter(t => t.status === "completed").length}/{tasks.length} complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-border overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
          style={{ width: `${(tasks.filter(t => t.status === "completed").length / Math.max(tasks.length, 1)) * 100}%` }}
        />
      </div>

      {/* Timeline items */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

        {tasks.map((task, i) => {
          const agent = AGENTS[task.agent_role];
          const isLast = i === tasks.length - 1;
          return (
            <div key={task.id} className={`relative flex gap-3 ${isLast ? "" : "pb-3"}`}>
              {/* Timeline dot */}
              <div className={`relative z-10 flex-shrink-0 mt-1 h-[22px] w-[22px] rounded-full grid place-items-center ${
                task.status === "running"
                  ? "bg-primary/20 ring-2 ring-primary/40"
                  : task.status === "completed"
                    ? "bg-emerald-500/20"
                    : task.status === "failed"
                      ? "bg-destructive/20"
                      : "bg-muted/40"
              }`}>
                <StatusIcon status={task.status} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {agent?.name ?? task.agent_role}
                      </span>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {task.task_name}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">
                    {formatTime(task.started_at || task.completed_at)}
                  </span>
                </div>

                {/* Error display */}
                {task.status === "failed" && task.error_text && (
                  <div className="mt-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                    <p className="text-[10px] text-destructive">{task.error_text}</p>
                  </div>
                )}

                {/* Result preview */}
                {task.status === "completed" && task.result && (
                  <details className="mt-1.5 group">
                    <summary className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground">
                      View output
                    </summary>
                    <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-card/50 p-2">
                      <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap break-words">
                        {task.result.slice(0, 500)}
                        {task.result.length > 500 ? "…" : ""}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
