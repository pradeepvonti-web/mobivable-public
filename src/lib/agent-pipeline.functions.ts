/**
 * Agent Pipeline Server Functions
 * Real AI-powered agent orchestration for mobile app building.
 * Each agent calls the configured AI provider with its specialized system prompt.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";

/* ─── Agent Definitions (server-side, specialized for pipeline) ───── */
const PIPELINE_AGENTS = {
  architect: {
    name: "Product Architect",
    system: `You are the Product Architect agent in a mobile app development pipeline.
Given an app idea, generate a complete Product Requirements Document (PRD):
1. **App Name & Pitch** — 1-sentence description
2. **Target Users** — 2-3 personas with needs
3. **Core Screens** — List every screen with purpose and key elements
4. **Data Models** — Define entities, fields, and relationships
5. **User Flows** — Map the 3 most important user journeys
6. **MVP Scope** — What's in v1 vs later
Output structured markdown. Be thorough but concise (~400 words).`,
  },
  designer: {
    name: "UI Designer",
    system: `You are the UI Designer agent in a mobile app development pipeline.
Given the Product Architect's PRD, design the visual system:
1. **Component Hierarchy** — List every component per screen (cards, buttons, inputs, lists, charts, navs)
2. **Color Palette** — 6 colors as hex with roles (background, surface, primary, accent, text, muted)
3. **Typography** — Font family, sizes for H1/H2/Body/Caption
4. **Spacing System** — Base unit and scale
5. **Animations** — Describe micro-interactions and transitions
6. **Responsive Rules** — How the layout adapts
Output structured markdown with specific values. ~350 words.`,
  },
  backend: {
    name: "Backend Engineer",
    system: `You are the Backend Engineer agent in a mobile app development pipeline.
Given the PRD and UI design, architect the backend:
1. **Database Schema** — Tables, columns, types, constraints, relationships (SQL-ready)
2. **API Endpoints** — REST routes with methods, params, and response shapes
3. **Authentication** — Auth flow (signup, login, token refresh, password reset)
4. **Business Logic** — Key server-side rules and validations
5. **State Management** — Client-side state architecture
6. **Third-party Integrations** — What external services are needed
Output structured markdown with code snippets where helpful. ~400 words.`,
  },
  qa: {
    name: "QA Tester",
    system: `You are the QA Tester agent in a mobile app development pipeline.
Given the full app specification, generate a quality assurance report:
1. **Test Cases** — 10-15 critical test cases with steps and expected results
2. **Edge Cases** — 5-8 edge cases that could break the app
3. **Accessibility Audit** — WCAG compliance checklist (contrast, screen reader, touch targets)
4. **Cross-Platform Issues** — iOS vs Android differences to watch
5. **Performance Concerns** — Potential bottlenecks
6. **Security Risks** — Input validation, auth, data exposure risks
Output structured markdown. ~350 words.`,
  },
  perf: {
    name: "Performance Optimizer",
    system: `You are the Performance Optimizer agent in a mobile app development pipeline.
Given the app architecture, generate optimization recommendations:
1. **Bundle Size** — Code splitting, tree shaking, lazy loading strategy
2. **Image Optimization** — Format, compression, responsive images
3. **Rendering Performance** — Virtual lists, memoization, avoid re-renders
4. **Network** — Caching strategy, request batching, offline support
5. **Startup Time** — Splash screen, deferred loading, critical path
6. **Memory Management** — Cleanup, subscription handling, leak prevention
Output specific, actionable recommendations with code patterns. ~300 words.`,
  },
  security: {
    name: "Security Auditor",
    system: `You are the Security Auditor agent in a mobile app development pipeline.
Given the app architecture and backend design, generate a security audit:
1. **Input Validation** — All user inputs that need sanitization
2. **Authentication Hardening** — Token storage, session management, MFA recommendations
3. **Data Encryption** — At-rest and in-transit encryption needs
4. **API Security** — Rate limiting, CORS, CSRF protection
5. **Dependency Risks** — Known vulnerability patterns in the stack
6. **Compliance** — GDPR, CCPA data handling requirements
Output specific recommendations with severity levels (Critical/High/Medium/Low). ~300 words.`,
  },
  devops: {
    name: "DevOps & Deploy",
    system: `You are the DevOps & Deploy agent in a mobile app development pipeline.
Given the complete app, generate deployment configuration:
1. **Build Configuration** — iOS (Xcode) and Android (Gradle) settings
2. **App Store Metadata** — Title, subtitle, description, keywords, categories
3. **CI/CD Pipeline** — Build, test, deploy steps
4. **Code Signing** — Certificate and provisioning profile setup
5. **Environment Config** — Dev, staging, production environments
6. **Monitoring** — Crash reporting, performance monitoring, alerting setup
Output ready-to-use configuration snippets and checklists. ~300 words.`,
  },
  analytics: {
    name: "Analytics Agent",
    system: `You are the Analytics Agent in a mobile app development pipeline.
Given the complete app, configure analytics and tracking:
1. **Key Metrics** — Define 5-8 KPIs with measurement methods
2. **Event Tracking** — List every trackable user action with event names and properties
3. **Funnel Analysis** — Define 2-3 conversion funnels
4. **User Segmentation** — How to segment users for analysis
5. **A/B Test Proposals** — 3 experiments to run with hypothesis and metrics
6. **Dashboard Design** — What to show on the analytics dashboard
Output structured markdown with specific event names and property schemas. ~300 words.`,
  },
} as const;

export type PipelineStageId = keyof typeof PIPELINE_AGENTS;

const STAGE_ORDER: PipelineStageId[] = ["architect", "designer", "backend", "qa", "perf", "security", "devops", "analytics"];

/* ─── Server Function: Run a single pipeline stage ─── */
export const runAgentStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      stage: z.enum(STAGE_ORDER as [PipelineStageId, ...PipelineStageId[]]),
      previousOutputs: z.record(z.string()).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch project
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, prompt, model, user_id, result")
      .eq("id", data.projectId)
      .maybeSingle();

    if (pErr || !project) return { ok: false as const, error: pErr?.message ?? "Project not found" };
    if (project.user_id !== userId) return { ok: false as const, error: "Forbidden" };

    const agent = PIPELINE_AGENTS[data.stage];
    const prev = data.previousOutputs ?? {};

    // Build context from previous agent outputs
    let contextBlock = `## App Idea\n${project.prompt}\n`;
    if (project.result) contextBlock += `\n## Current App State\n${project.result}\n`;

    const stageIdx = STAGE_ORDER.indexOf(data.stage);
    for (let i = 0; i < stageIdx; i++) {
      const prevStage = STAGE_ORDER[i];
      if (prev[prevStage]) {
        contextBlock += `\n## ${PIPELINE_AGENTS[prevStage].name} Output\n${prev[prevStage]}\n`;
      }
    }

    const userPrompt = `${contextBlock}\n\nNow perform your analysis and generate your deliverables for this app.`;

    const startTime = Date.now();
    const result = await callAI(agent.system, userPrompt, project.model);
    const elapsed = Date.now() - startTime;

    if (!result.ok) {
      return { ok: false as const, error: result.error, elapsed };
    }

    // Estimate tokens (rough: 1 token ≈ 4 chars)
    const inputTokens = Math.ceil((agent.system.length + userPrompt.length) / 4);
    const outputTokens = Math.ceil(result.text.length / 4);
    const totalTokens = inputTokens + outputTokens;
    // Rough cost estimate ($0.01 per 1K tokens avg)
    const cost = +(totalTokens * 0.00001).toFixed(6);

    // Store the agent output as a project message for audit trail
    await supabase.from("project_messages").insert({
      project_id: project.id,
      user_id: userId,
      role: "assistant",
      content: `**[${agent.name} Agent]**\n\n${result.text}`,
    });

    return {
      ok: true as const,
      output: result.text,
      tokens: totalTokens,
      cost,
      elapsed,
      provider: result.provider,
      model: result.model,
    };
  });

/* ─── Get pipeline agent info (client-safe) ─── */
export function getPipelineAgents() {
  return STAGE_ORDER.map(id => ({
    id,
    name: PIPELINE_AGENTS[id].name,
  }));
}
