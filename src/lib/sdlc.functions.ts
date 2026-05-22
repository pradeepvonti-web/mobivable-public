import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AGENTS, type AgentRole } from "./agents";

// ---------------------------------------------------------------------------
// SDLC Phase definitions
// ---------------------------------------------------------------------------
export const SDLC_PHASES = {
  requirements: {
    label: "Requirements",
    agents: ["product_manager", "business_analyst", "scrum_master"] as AgentRole[],
    description: "Define what to build — features, personas, user stories",
    icon: "clipboard-list",
    order: 0,
  },
  design: {
    label: "Design",
    agents: ["ux_researcher", "ui_ux_designer"] as AgentRole[],
    description: "Design the user experience and visual identity",
    icon: "palette",
    order: 1,
  },
  development: {
    label: "Development",
    agents: ["frontend_developer", "backend_developer", "database_architect", "ai_ml"] as AgentRole[],
    description: "Build the application architecture",
    icon: "code",
    order: 2,
  },
  testing: {
    label: "Testing & QA",
    agents: ["qa_testing", "security", "error_detector"] as AgentRole[],
    description: "Test, validate, and secure the application",
    icon: "shield-check",
    order: 3,
  },
  deployment: {
    label: "Deployment",
    agents: ["devops", "performance", "documentation", "summary_agent"] as AgentRole[],
    description: "Prepare for production release",
    icon: "rocket",
    order: 4,
  },
} as const;

export type SDLCPhase = keyof typeof SDLC_PHASES;
export const PHASE_ORDER: SDLCPhase[] = [
  "requirements",
  "design",
  "development",
  "testing",
  "deployment",
];

// ---------------------------------------------------------------------------
// initProjectPhases – create 5 phase rows for a project (idempotent)
// ---------------------------------------------------------------------------
export const initProjectPhases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, current_phase")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Not found" };

    // Check if phases already exist
    const { data: existing } = await supabase
      .from("project_phases")
      .select("id")
      .eq("project_id", data.projectId)
      .limit(1);
    if (existing && existing.length > 0)
      return { ok: true as const, alreadyInitialized: true };

    // Create all 5 phases – first one is immediately active
    const phases = PHASE_ORDER.map((phase, i) => ({
      project_id: data.projectId,
      phase,
      status: i === 0 ? "active" : "pending",
      started_at: i === 0 ? new Date().toISOString() : null,
    }));
    const { error } = await supabase.from("project_phases").insert(phases);
    if (error) return { ok: false as const, error: error.message };

    // Set current_phase on project
    await supabase
      .from("projects")
      .update({ current_phase: "requirements" })
      .eq("id", data.projectId);

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// advancePhase – complete current phase and activate the next one
// ---------------------------------------------------------------------------
export const advancePhase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, current_phase")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Not found" };

    const currentIdx = PHASE_ORDER.indexOf(project.current_phase as SDLCPhase);

    if (currentIdx === -1 || currentIdx >= PHASE_ORDER.length - 1) {
      // Already on the last phase (or unknown) — mark as completed
      await supabase
        .from("project_phases")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("project_id", data.projectId)
        .eq("phase", project.current_phase!);
      await supabase
        .from("projects")
        .update({ current_phase: "completed" })
        .eq("id", data.projectId);
      return { ok: true as const, phase: "completed" as const, isLast: true };
    }

    const nextPhase = PHASE_ORDER[currentIdx + 1];

    // Complete current phase
    await supabase
      .from("project_phases")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("project_id", data.projectId)
      .eq("phase", project.current_phase!);

    // Activate next phase
    await supabase
      .from("project_phases")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("project_id", data.projectId)
      .eq("phase", nextPhase);

    // Update project
    await supabase
      .from("projects")
      .update({ current_phase: nextPhase })
      .eq("id", data.projectId);

    return {
      ok: true as const,
      phase: nextPhase,
      isLast: currentIdx + 1 >= PHASE_ORDER.length - 1,
    };
  });

// ---------------------------------------------------------------------------
// getProjectProgress – return phase list + current phase for a project
// ---------------------------------------------------------------------------
export const getProjectProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, current_phase")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Not found" };

    const { data: phases } = await supabase
      .from("project_phases")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });

    return {
      ok: true as const,
      currentPhase: project.current_phase as SDLCPhase | "completed",
      phases: (phases ?? []).map((p) => ({
        phase: p.phase as SDLCPhase,
        status: p.status as "pending" | "active" | "completed" | "skipped",
        startedAt: p.started_at,
        completedAt: p.completed_at,
        agents: SDLC_PHASES[p.phase as SDLCPhase]?.agents ?? [],
      })),
    };
  });

// ---------------------------------------------------------------------------
// routeMessageToAgents – pick agents based on message content + current phase
// ---------------------------------------------------------------------------
export function routeMessageToAgents(
  message: string,
  currentPhase: SDLCPhase | "completed",
): { agents: AgentRole[]; shouldAdvance: boolean } {
  const lower = message.toLowerCase();

  // ── Explicit phase advance requests ────────────────────────────────────
  if (
    /\b(next phase|advance|move (on|forward)|proceed|approve|looks? good|ship it|lgtm)\b/i.test(
      message,
    )
  ) {
    return { agents: [], shouldAdvance: true };
  }

  // ── Direct agent mentions ──────────────────────────────────────────────
  const mentionedAgents: AgentRole[] = [];
  for (const [role, def] of Object.entries(AGENTS)) {
    if (
      lower.includes(def.name.toLowerCase()) ||
      lower.includes(role.replace(/_/g, " "))
    ) {
      mentionedAgents.push(role as AgentRole);
    }
  }
  if (mentionedAgents.length > 0)
    return { agents: mentionedAgents, shouldAdvance: false };

  // ── Keyword-based routing ──────────────────────────────────────────────
  const keywordMap: Record<string, AgentRole[]> = {
    // Design keywords
    "color|palette|theme|dark mode|light mode|font|typography|brand|visual|aesthetic|gradient|icon|illustration":
      ["ui_ux_designer"],
    "screen|layout|wireframe|mockup|prototype|navigation|tab|drawer|modal": [
      "ui_ux_designer",
      "ux_researcher",
    ],
    "user experience|ux|accessibility|onboarding|user flow|journey": [
      "ux_researcher",
    ],
    // Development keywords
    "api|endpoint|backend|server|database|schema|table|sql|auth|login|signup": [
      "backend_developer",
      "database_architect",
    ],
    "component|react|flutter|swiftui|state|hook|animation|transition": [
      "frontend_developer",
    ],
    "ai|machine learning|model|gpt|llm|prompt|chatbot|recommendation": [
      "ai_ml",
    ],
    // Testing keywords
    "test|bug|error|crash|fix|debug|edge case|validation": [
      "qa_testing",
      "error_detector",
    ],
    "security|vulnerability|xss|csrf|injection|encrypt|token|oauth": [
      "security",
    ],
    // PM keywords
    "feature|requirement|user story|mvp|roadmap|priority|sprint|backlog|timeline":
      ["product_manager", "scrum_master"],
    "business|revenue|monetization|pricing|subscription|market|competitor": [
      "business_analyst",
    ],
    // DevOps keywords
    "deploy|hosting|ci|cd|docker|kubernetes|cloud|aws|gcp|azure|release": [
      "devops",
    ],
    "performance|speed|optimize|cache|bundle|lazy|preload|metric": [
      "performance",
    ],
    "doc|documentation|readme|changelog|guide|tutorial": ["documentation"],
  };

  const matched: Set<AgentRole> = new Set();
  for (const [keywords, agents] of Object.entries(keywordMap)) {
    const regex = new RegExp(`\\b(${keywords})\\b`, "i");
    if (regex.test(message)) {
      agents.forEach((a) => matched.add(a));
    }
  }

  if (matched.size > 0)
    return { agents: Array.from(matched).slice(0, 3), shouldAdvance: false };

  // ── Default: lead agent(s) of the current phase ────────────────────────
  if (currentPhase !== "completed" && currentPhase in SDLC_PHASES) {
    const phaseAgents = SDLC_PHASES[currentPhase].agents;
    return { agents: [phaseAgents[0]], shouldAdvance: false };
  }

  return { agents: [], shouldAdvance: false };
}
