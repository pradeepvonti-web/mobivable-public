import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, ALL_ROLES, COMPLEXITY_PRESETS, type AgentRole } from "./agents";
import { callAI } from "./ai-provider";

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
    const r = await callAI(sys, project.prompt);

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

    // ─── SPECIAL: error_detector — validate schema locally ───
    if (role === "error_detector") {
      const { validateAndFixSchema, formatIssuesSummary } = await import("./schema-validator");
      const { parseAppSchema } = await import("./code-gen");
      const { data: proj } = await supabase
        .from("projects")
        .select("result")
        .eq("id", task.project_id)
        .single();

      let output = "";
      if (!proj?.result) {
        output = "⚠️ No app schema found in project result. Nothing to validate.\n\nWaiting for code generation to complete before error detection can run.";
      } else {
        const parsed = parseAppSchema(proj.result);
        if (!parsed) {
          output = "❌ **Critical**: Failed to parse app schema from project result.\n\nThe generated JSON is malformed or empty. A full regeneration is recommended.";
        } else {
          const { schema: fixed, issues } = validateAndFixSchema(parsed);
          const summary = formatIssuesSummary(issues);
          const errors = issues.filter(i => i.severity === "error");
          const warnings = issues.filter(i => i.severity === "warning");
          const autoFixed = issues.filter(i => i.autoFixed);

          output = `## Schema Validation Report\n\n${summary}\n\n`;
          if (issues.length === 0) {
            output += "✅ All elements are valid. No issues detected.\n";
          } else {
            if (errors.length > 0) {
              output += `### ❌ Errors (${errors.length})\n${errors.map(e => `- \`${e.path}\`: ${e.message}`).join("\n")}\n\n`;
            }
            if (warnings.length > 0) {
              output += `### ⚠️ Warnings (${warnings.length})\n${warnings.map(w => `- \`${w.path}\`: ${w.message}${w.autoFixed ? " *(auto-fixed)*" : ""}`).join("\n")}\n\n`;
            }
            if (autoFixed.length > 0) {
              output += `### 🔧 Auto-Fixed (${autoFixed.length})\nThe following issues were automatically repaired and the schema was updated:\n${autoFixed.map(f => `- \`${f.path}\`: ${f.message}`).join("\n")}\n`;

              // Persist the fixed schema back
              if (fixed) {
                await supabase.from("projects").update({ result: JSON.stringify(fixed) }).eq("id", task.project_id);
                output += "\n\n✅ Fixed schema has been saved to the project.";
              }
            }
          }
        }
      }

      await supabase
        .from("agent_tasks")
        .update({ status: "completed", output, error_text: null })
        .eq("id", task.id);
      await supabase.from("agent_messages").insert({
        run_id: task.run_id, project_id: task.project_id, user_id: userId,
        role, content: `${def.name} completed schema validation.`,
      });
      return { ok: true as const, output };
    }

    // ─── SPECIAL: summary_agent — summarize prior outputs locally ───
    if (role === "summary_agent") {
      const completedTasks = (prior ?? []).filter(p => p.output);
      let output = `## Build Summary\n\n`;
      output += `**${completedTasks.length} agents** completed their tasks.\n\n`;
      for (const p of completedTasks) {
        const name = AGENTS[p.role as AgentRole]?.name ?? p.role;
        const preview = (p.output ?? "").slice(0, 150).replace(/\n/g, " ");
        output += `- **${name}**: ${preview}${(p.output?.length ?? 0) > 150 ? "…" : ""}\n`;
      }
      output += `\n---\n\n✅ All agent outputs have been compiled. The app is ready for preview.`;

      await supabase
        .from("agent_tasks")
        .update({ status: "completed", output, error_text: null })
        .eq("id", task.id);
      await supabase.from("agent_messages").insert({
        run_id: task.run_id, project_id: task.project_id, user_id: userId,
        role, content: `${def.name} compiled the build summary.`,
      });
      return { ok: true as const, output };
    }

    // ─── DEFAULT: Call AI gateway ───
    const userPrompt =
      `App idea: ${project?.prompt ?? ""}\n\n` +
      `Project name: ${project?.name ?? ""}\n\n` +
      `Previous agents' outputs:\n${priorBlock}\n\n` +
      `Now produce your output for this app.`;

    const r = await callAI(def.system, userPrompt);

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

    // Find the next agent in this run so this one can @mention them.
    const { data: nextRows } = await supabase
      .from("agent_tasks")
      .select("role")
      .eq("run_id", task.run_id)
      .gt("ordinal", task.ordinal)
      .order("ordinal", { ascending: true })
      .limit(1);
    const nextRole = (nextRows?.[0]?.role as AgentRole | undefined) ?? null;
    const nextName = nextRole ? AGENTS[nextRole]?.name ?? nextRole : null;

    // Generate a substantive team-chat message that feels like a real teammate.
    const teamSys =
      `You are ${def.name} on a mobile-app build team chat. Write a short message (3-5 sentences, first person, plain prose) that: ` +
      `(1) summarizes the concrete decisions you just made, ` +
      `(2) calls out 1-2 key tradeoffs or assumptions, ` +
      (nextName
        ? `(3) ends with "@${nextName}" plus one specific, actionable ask for them. `
        : `(3) wraps the build with a quick green-light. `) +
      `Be concrete. No headings, bullets, or code fences.`;
    const teamUser = `App: ${project?.name ?? ""}\n\nMy output just now:\n${r.text.slice(0, 2500)}`;
    const chat = await callAI(teamSys, teamUser);
    const chatContent = chat.ok && chat.text.trim()
      ? chat.text.trim()
      : `${def.name} finished${nextName ? `. @${nextName} — you're up.` : "."}`;

    await supabase.from("agent_messages").insert({
      run_id: task.run_id,
      project_id: task.project_id,
      user_id: userId,
      role,
      content: chatContent,
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
