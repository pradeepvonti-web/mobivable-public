/**
 * 3-stage vision-grounded build pipeline.
 *
 * When the user has both an approved design brief AND a saved mockup image,
 * we re-read the mockup with a vision model and use the reconciled spec to
 * drive a per-screen planner and a final schema assembler. Three smaller
 * calls beat one giant call: each stage has one job and one output to
 * validate, so a weak model can't quietly drift on visual fidelity.
 *
 *   Stage 1 — VISION RE-READ   (callAIVision) → ReconciledSpec
 *   Stage 2 — SCREEN PLANNER   (callAIStrong) → ScreenPlan[]
 *   Stage 3 — SCHEMA ASSEMBLER (callAIStrong) → MobileAppSchema JSON
 *
 * Public entry: `buildFromMockup` — returns the final schema JSON on success,
 * or an error string the caller can use to fall back to the single-call path.
 *
 * No createServerFn here on purpose: this is a server-only helper imported
 * from the existing `agent-run.functions.ts` server function.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAIStrong, callAIVision } from "./ai-provider";
import { parseAppSchema } from "./code-gen";
import { validateAndFixSchema } from "./schema-validator";

const ATTACHMENT_BUCKET = "project-attachments";

// ─── Types ──────────────────────────────────────────────────────────

export interface ReconciledSpec {
  appName: string;
  domain: string;
  mood: string;
  palette: {
    mode: "dark" | "light";
    primary: string;
    accent: string;
    background: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    danger: string;
    success: string;
    gradient: [string, string];
  };
  typography: { headingFont: string; bodyFont: string; displayFont?: string; scale: string };
  radius: string;
  spacing: string;
  motion: string;
  screens: {
    id: string;
    title: string;
    icon: string;
    layout: string;
    purpose: string;
    keyPrimitives: string[];
  }[];
  navigation: string[];
}

export interface ScreenPlan {
  id: string;
  title: string;
  icon: string;
  layout: string;
  elements: { type: string; copy?: string; data?: unknown; notes?: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Vision models can only consume https image URLs. If the saved mockup is a
 * `data:` URL (the common case — `generateMockupImage` returns one), upload
 * it to project-attachments and return the public URL. Best-effort: if the
 * upload fails, return null and the caller will fall back.
 */
async function ensureHttpsImageUrl(
  rawUrl: string,
  projectId: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(rawUrl);
  if (!m) return null;
  const contentType = m[1];
  const b64 = m[2];
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = contentType.split("/")[1]?.split("+")[0] ?? "png";
    const path = `${projectId}/mockups/mockup-${Date.now()}.${ext}`;
    const up = await supabaseAdmin.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (up.error) return null;
    const { data: pub } = supabaseAdmin.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch {
    return null;
  }
}

function extractJson(text: string): string | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const s = stripped.indexOf("{");
  const e = stripped.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  return stripped.slice(s, e + 1);
}

function safeParse<T>(text: string): T | null {
  const j = extractJson(text);
  if (!j) return null;
  try { return JSON.parse(j) as T; } catch { return null; }
}

// ─── Stage 1: Vision re-read ────────────────────────────────────────

async function reconcileFromMockup(
  brief: Record<string, unknown>,
  mockupHttpsUrl: string,
): Promise<{ ok: true; spec: ReconciledSpec } | { ok: false; error: string }> {
  const system = `You are a senior product designer reverse-engineering a mobile app from its mockup image. The user has ALREADY APPROVED this mockup; your job is to produce a faithful structured spec another model will build from.

RESPOND WITH ONLY VALID JSON — no fences, no prose.

Schema (all fields required):
{
  "appName": "...",
  "domain": "...",
  "mood": "2-4 adjectives matching the mockup",
  "palette": { "mode":"dark"|"light", "primary":"#hex","accent":"#hex","background":"#hex","card":"#hex","text":"#hex","muted":"#hex","border":"#hex","danger":"#hex","success":"#hex","gradient":["#hex","#hex"] },
  "typography": { "headingFont":"...", "bodyFont":"...", "displayFont":"...", "scale":"compact|comfortable|editorial" },
  "radius": "tight|rounded|pillowy",
  "spacing": "compact|comfortable|airy",
  "motion": "subtle|medium|bold",
  "screens": [ { "id":"...", "title":"...", "icon":"...", "layout":"bento-grid|stack|magazine|split-hero|full-bleed", "purpose":"one line", "keyPrimitives":["element-type-1","element-type-2","..."] } ],
  "navigation": ["home","..."]
}

RULES:
- The MOCKUP IMAGE is the source of truth for palette, typography, radius, spacing, screen titles, and screen layout. Read colors off the image, not the brief.
- The BRIEF is a tie-breaker only for things you cannot see (domain, mood adjectives, navigation order).
- One "screens" entry per distinct phone frame in the mockup. Use the screen names shown beneath each phone (e.g. "Culina Modern", "The Pass", "Flavor Atlas", "Technical Sheet").
- For each screen, list 6-10 REAL element TYPES (e.g. "parallax-hero","stat-card-xl","glass-card","line-chart","timeline","bento-grid","split-hero","feature-showcase","testimonial","pricing-card","marquee","onboarding-slide","sparkline","progress-bar","gauge-chart","radar-chart","bank-card","calendar-strip","chat-bubble","map-card","video-player","accordion") — never include "text" as a placeholder for another type.`;

  const user = `## Approved Brief (use only as a tie-breaker; the image wins on visuals)
${JSON.stringify(brief, null, 2)}

The attached image is the user-approved mockup. Produce the reconciled JSON spec.`;

  const r = await callAIVision(system, user, [mockupHttpsUrl]);
  if (!r.ok) return { ok: false, error: `vision: ${r.error}` };
  const spec = safeParse<ReconciledSpec>(r.text);
  if (!spec || !spec.palette?.primary || !Array.isArray(spec.screens) || spec.screens.length === 0) {
    return { ok: false, error: "vision: spec missing required fields" };
  }
  return { ok: true, spec };
}

// ─── Stage 2: Per-screen planner ────────────────────────────────────

async function planScreens(
  spec: ReconciledSpec,
  appPrompt: string,
): Promise<{ ok: true; plans: ScreenPlan[] } | { ok: false; error: string }> {
  const system = `You are a mobile UI architect. Given a reconciled design spec, produce a per-screen build plan another model will turn into JSON.

RESPOND WITH ONLY VALID JSON — no fences, no prose.

Schema:
{
  "plans": [
    {
      "id": "<screen id from spec>",
      "title": "<screen title from spec>",
      "icon": "<icon from spec>",
      "layout": "<layout from spec>",
      "elements": [
        { "type": "<real element type, e.g. parallax-hero>", "copy": "real human-written copy for this element", "data": { /* optional realistic data for charts, lists, cards */ }, "notes": "optional one-line composition hint" }
      ]
    }
  ]
}

RULES:
- One "plans" entry per spec.screens entry, in the same order.
- Each plan must have 6-10 elements.
- elements[].type MUST be a real element type, NEVER the string "text" used as a placeholder for another primitive.
- Use the screen's keyPrimitives as the backbone; you may add complementary primitives so the screen feels complete.
- Copy must be domain-specific and on-brand for the app — never lorem ipsum, never generic "Welcome" filler.
- For chart/data elements, supply realistic sample data inline.`;

  const user = `## App Idea
${appPrompt}

## Reconciled Spec
${JSON.stringify(spec, null, 2)}

Produce the JSON plans now.`;

  const r = await callAIStrong(system, user);
  if (!r.ok) return { ok: false, error: `planner: ${r.error}` };
  const parsed = safeParse<{ plans: ScreenPlan[] }>(r.text);
  if (!parsed || !Array.isArray(parsed.plans) || parsed.plans.length === 0) {
    return { ok: false, error: "planner: plans missing or empty" };
  }
  return { ok: true, plans: parsed.plans };
}

// ─── Stage 3: Schema assembler ──────────────────────────────────────

async function assembleSchema(
  spec: ReconciledSpec,
  plans: ScreenPlan[],
  appPrompt: string,
  knowledgeBlock: string,
  figmaPromptSnippet: string,
  agentContextText: string,
  systemPrompt: string,
): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const userPrompt =
    `Compose the final mobile app JSON. All design decisions are LOCKED — copy palette, typography, radius, spacing, motion, screen ids, screen titles, icons, layouts VERBATIM from the spec. Compose each screen exactly from the matching plan's elements, in order.\n\n` +
    `## App Idea\n${appPrompt}\n\n` +
    (figmaPromptSnippet ? `${figmaPromptSnippet}\n` : "") +
    (knowledgeBlock ? `## Knowledge Base\n${knowledgeBlock}\n\n` : "") +
    `## LOCKED Reconciled Spec (palette/typography/screens — copy verbatim)\n${JSON.stringify(spec, null, 2)}\n\n` +
    `## LOCKED Per-Screen Plan (each plan -> one screen; emit each element as a real typed element, NEVER as a "text" element containing the type name)\n${JSON.stringify(plans, null, 2)}\n\n` +
    (agentContextText
      ? `## Supporting Specialist Outputs (data/backend hints only — do NOT override design)\n${agentContextText}\n\n`
      : "") +
    `## CRITICAL ASSEMBLY RULES\n` +
    `1. theme.palette MUST equal spec.palette VERBATIM (every hex). No invented colors.\n` +
    `2. typography.headingFont / bodyFont / displayFont / scale MUST equal spec.typography VERBATIM.\n` +
    `3. radius, spacing, motion MUST equal spec values.\n` +
    `4. appName MUST equal spec.appName.\n` +
    `5. One screen per plan, in order, with id/title/icon/layout from spec.\n` +
    `6. Each screen's elements[] MUST mirror the plan's elements[] in order, with element type emitted as the JSON "type" — never as "text" content.\n` +
    `7. Use the plan's copy and data verbatim where supplied; you may add small realistic detail but never replace it with filler.\n` +
    `8. Add navigate actions on buttons/tabs to connect screens; use spec.navigation order.\n` +
    `9. Include at least 1 chart element and 1 hero element with an image "prompt" string for media auto-fill.\n` +
    `10. Add entrance animations (pop, fade-up, scale-in, blur-in), gesture hints (tap-scale, press-glow), and a page transition per screen.\n\n` +
    `Generate the COMPLETE app JSON now.`;

  const r = await callAIStrong(systemPrompt, userPrompt);
  if (!r.ok) return { ok: false, error: `assembler: ${r.error}` };
  if (r.text.length < 50) return { ok: false, error: "assembler: empty output" };
  return { ok: true, json: r.text };
}

// ─── Public entry ───────────────────────────────────────────────────

export interface BuildFromMockupInput {
  projectId: string;
  projectPrompt: string;
  savedBrief: Record<string, unknown>;
  mockupUrl: string;
  agentContextText: string;
  knowledgeBlock: string;
  figmaPromptSnippet: string;
  codeGenSystemPrompt: string;
}

export interface BuildFromMockupResult {
  ok: boolean;
  schemaJson?: string;
  error?: string;
  stages?: { vision?: boolean; planner?: boolean; assembler?: boolean };
}

export async function buildFromMockup(
  input: BuildFromMockupInput,
): Promise<BuildFromMockupResult> {
  const stages: BuildFromMockupResult["stages"] = {};

  // Mockup must be reachable by the vision provider as an https URL.
  const httpsUrl = await ensureHttpsImageUrl(input.mockupUrl, input.projectId);
  if (!httpsUrl) {
    return { ok: false, error: "Could not resolve mockup to an https URL.", stages };
  }

  // Stage 1
  const s1 = await reconcileFromMockup(input.savedBrief, httpsUrl);
  if (!s1.ok) return { ok: false, error: s1.error, stages };
  stages.vision = true;

  // Stage 2
  const s2 = await planScreens(s1.spec, input.projectPrompt);
  if (!s2.ok) return { ok: false, error: s2.error, stages };
  stages.planner = true;

  // Stage 3
  const s3 = await assembleSchema(
    s1.spec,
    s2.plans,
    input.projectPrompt,
    input.knowledgeBlock,
    input.figmaPromptSnippet,
    input.agentContextText,
    input.codeGenSystemPrompt,
  );
  if (!s3.ok) return { ok: false, error: s3.error, stages };

  const parsed = parseAppSchema(s3.json);
  if (!parsed) return { ok: false, error: "assembler: schema failed to parse", stages };
  const { schema: fixed } = validateAndFixSchema(parsed);
  stages.assembler = true;

  return {
    ok: true,
    schemaJson: JSON.stringify(fixed ?? parsed),
    stages,
  };
}
