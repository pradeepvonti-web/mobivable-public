import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, COMPLEXITY_PRESETS, type AgentRole } from "./agents";

const MODEL = "google/gemini-3-flash-preview";

async function callLovableAI(
  system: string,
  user: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "AI gateway not configured" };
  try {
    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      const msg =
        res.status === 429
          ? "Rate limit reached. Try again shortly."
          : res.status === 402
            ? "AI credits exhausted. Add credits in workspace settings."
            : `AI error (${res.status}): ${body.slice(0, 200)}`;
      return { ok: false, error: msg };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true, text: json.choices?.[0]?.message?.content?.trim() ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI call failed",
    };
  }
}

/** Recommend a set of agent roles based on the project's prompt. */
export const recommendAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, prompt, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Project not found" };

    const sys =
      'You are a senior software studio lead. Given a mobile app idea, choose which specialist agents are required. Reply with ONLY a JSON object: {"complexity":"simple|standard|ai_powered|enterprise","roles":["product_manager", ...]}. Allowed roles: ' +
      ALL_ROLES.join(", ") +
      '. No prose, no code fences.';
    const r = await callLovableAI(sys, project.prompt);

    let complexity: keyof typeof COMPLEXITY_PRESETS = "standard";
    let roles: AgentRole[] = COMPLEXITY_PRESETS.standard;
    if (r.ok) {
      try {
        const cleaned = r.text.replace(/^```json|```$/g, "").trim();
        const parsed = JSON.parse(cleaned) as {
          complexity?: string;
          roles?: string[];
        };
        const filtered = (parsed.roles ?? []).filter((x): x is AgentRole =>
          ALL_ROLES.includes(x as AgentRole),
        );
        if (filtered.length > 0) roles = filtered;
        if (parsed.complexity && parsed.complexity in COMPLEXITY_PRESETS) {
          complexity = parsed.complexity as keyof typeof COMPLEXITY_PRESETS;
        }
      } catch {
        // fall back to preset
      }
    }
    return { ok: true as const, complexity, roles };
  });

/** Create an agent run with the chosen roles, plus a waiting task per role. */
export const startAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        roles: z.array(z.string()).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = data.roles.filter((r): r is AgentRole =>
      ALL_ROLES.includes(r as AgentRole),
    );
    if (roles.length === 0)
      return { ok: false as const, error: "No valid roles" };

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Project not found" };

    const { data: run, error: runErr } = await supabase
      .from("agent_runs")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        status: "running",
        selected_roles: roles,
      })
      .select("id")
      .single();
    if (runErr || !run)
      return { ok: false as const, error: runErr?.message ?? "Run failed" };

    const tasks = roles.map((role, i) => ({
      run_id: run.id,
      project_id: data.projectId,
      user_id: userId,
      role,
      ordinal: i,
      status: "waiting" as const,
    }));
    const { error: tErr } = await supabase.from("agent_tasks").insert(tasks);
    if (tErr) return { ok: false as const, error: tErr.message };

    return { ok: true as const, runId: run.id };
  });

/** Execute one agent task; uses the project prompt + earlier completed tasks as context. */
export const runAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: task } = await supabase
      .from("agent_tasks")
      .select("id, run_id, project_id, role, ordinal, status, user_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task || task.user_id !== userId)
      return { ok: false as const, error: "Task not found" };
    if (task.status === "completed")
      return { ok: true as const, cached: true };

    const role = task.role as AgentRole;
    const def = AGENTS[role];
    if (!def) return { ok: false as const, error: "Unknown role" };

    await supabase
      .from("agent_tasks")
      .update({ status: "working" })
      .eq("id", task.id);

    const { data: project } = await supabase
      .from("projects")
      .select("prompt, name")
      .eq("id", task.project_id)
      .single();

    const { data: prior } = await supabase
      .from("agent_tasks")
      .select("role, output")
      .eq("run_id", task.run_id)
      .lt("ordinal", task.ordinal)
      .eq("status", "completed")
      .order("ordinal", { ascending: true });

    const priorBlock =
      (prior ?? [])
        .filter((p) => p.output)
        .map(
          (p) =>
            `### From ${AGENTS[p.role as AgentRole]?.name ?? p.role}\n${p.output}`,
        )
        .join("\n\n") || "(no prior agent output)";

    const userPrompt =
      `App idea: ${project?.prompt ?? ""}\n\n` +
      `Project name: ${project?.name ?? ""}\n\n` +
      `Previous agents' outputs:\n${priorBlock}\n\n` +
      `Now produce your output for this app.`;

    const r = await callLovableAI(def.system, userPrompt);

    if (!r.ok) {
      await supabase
        .from("agent_tasks")
        .update({ status: "failed", error_text: r.error })
        .eq("id", task.id);
      return { ok: false as const, error: r.error };
    }

    await supabase
      .from("agent_tasks")
      .update({ status: "completed", output: r.text, error_text: null })
      .eq("id", task.id);

    await supabase.from("agent_messages").insert({
      run_id: task.run_id,
      project_id: task.project_id,
      user_id: userId,
      role,
      content: `${def.name} completed: ${def.tasks[0] ?? "task"}.`,
    });

    return { ok: true as const, output: r.text };
  });

/** Mark a run completed when all its tasks are done (or failed). */
export const finalizeAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ runId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tasks } = await supabase
      .from("agent_tasks")
      .select("status, user_id")
      .eq("run_id", data.runId);
    if (!tasks || tasks.length === 0 || tasks[0].user_id !== userId)
      return { ok: false as const, error: "Run not found" };
    const anyFailed = tasks.some((t) => t.status === "failed");
    const allDone = tasks.every(
      (t) => t.status === "completed" || t.status === "failed",
    );
    if (!allDone) return { ok: true as const, status: "running" };
    const next = anyFailed ? "failed" : "completed";
    await supabase
      .from("agent_runs")
      .update({ status: next })
      .eq("id", data.runId);
    return { ok: true as const, status: next };
  });
