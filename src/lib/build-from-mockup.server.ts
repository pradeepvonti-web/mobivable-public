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
import { callAI, callAIStrong, callAIVision } from "./ai-provider";
import { parseAppSchema } from "./code-gen";
import { validateAndFixSchema } from "./schema-validator";
import type { MobileAppSchema } from "./mobile-app-schema";

const ATTACHMENT_BUCKET = "project-attachments";

/**
 * Assembler candidate models. Tried in parallel; a vision-based judge picks
 * the one whose output best matches the mockup. Slugs target Lovable AI
 * Gateway — order is priority/quality. If a model errors or the workspace
 * lacks credits for it, that candidate is simply dropped (others still race).
 */
const ASSEMBLER_CANDIDATES = [
  "google/gemini-2.5-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
] as const;

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

// ─── Stage 3: Multi-provider schema assembler + vision judge ────────

interface AssembledCandidate {
  model: string;
  schema: MobileAppSchema;
  json: string;
}

function buildAssemblerUserPrompt(
  spec: ReconciledSpec,
  plans: ScreenPlan[],
  appPrompt: string,
  knowledgeBlock: string,
  figmaPromptSnippet: string,
  agentContextText: string,
): string {
  return (
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
    `Generate the COMPLETE app JSON now.`
  );
}

/**
 * Fan out the assembly across every candidate model in parallel. Each
 * candidate that returns parseable schema becomes an option for the judge.
 * Failures (rate-limit, credit exhaustion, parse failure on that model) are
 * dropped so the strongest models that DID respond still race.
 */
async function assembleSchemaCandidates(
  spec: ReconciledSpec,
  plans: ScreenPlan[],
  appPrompt: string,
  knowledgeBlock: string,
  figmaPromptSnippet: string,
  agentContextText: string,
  systemPrompt: string,
): Promise<{ candidates: AssembledCandidate[]; errors: { model: string; error: string }[] }> {
  const userPrompt = buildAssemblerUserPrompt(
    spec,
    plans,
    appPrompt,
    knowledgeBlock,
    figmaPromptSnippet,
    agentContextText,
  );

  const results = await Promise.all(
    ASSEMBLER_CANDIDATES.map(async (model) => {
      const r = await callAI(systemPrompt, userPrompt, model);
      if (!r.ok) return { model, error: r.error };
      if (r.text.length < 50) return { model, error: "empty output" };
      const parsed = parseAppSchema(r.text);
      if (!parsed) return { model, error: "schema parse failed" };
      const { schema: fixed } = validateAndFixSchema(parsed);
      const final = fixed ?? parsed;
      return {
        model,
        schema: final,
        json: JSON.stringify(final),
      } satisfies AssembledCandidate;
    }),
  );

  const candidates: AssembledCandidate[] = [];
  const errors: { model: string; error: string }[] = [];
  for (const r of results) {
    if ("schema" in r && r.schema) {
      candidates.push({ model: r.model, schema: r.schema, json: r.json });
    } else if ("error" in r && r.error) {
      errors.push({ model: r.model, error: r.error });
    }
  }
  return { candidates, errors };
}

/**
 * Compact, judge-friendly summary of a candidate schema. We DON'T send the
 * full schema to the vision model — too much text dilutes attention and
 * costs more. Instead, send only the visually-load-bearing fields.
 */
function summarizeCandidate(c: AssembledCandidate): string {
  const theme = (c.schema as unknown as { theme?: { palette?: Record<string, unknown>; typography?: Record<string, unknown> } }).theme;
  const screens = Array.isArray(c.schema.screens) ? c.schema.screens : [];
  const palette = theme?.palette ? JSON.stringify(theme.palette) : "(none)";
  const typography = theme?.typography ? JSON.stringify(theme.typography) : "(none)";
  const screenLines = screens.map((s, i) => {
    const elements = Array.isArray((s as { elements?: unknown[] }).elements) ? (s as { elements: unknown[] }).elements : [];
    const types = elements
      .map((e) => (e && typeof e === "object" ? String((e as { type?: unknown }).type ?? "?") : "?"))
      .slice(0, 12)
      .join(", ");
    return `  ${i + 1}. id=${(s as { id?: string }).id ?? "?"} title=${(s as { title?: string }).title ?? "?"} layout=${(s as { layout?: string }).layout ?? "?"} elements=[${types}]`;
  }).join("\n");
  return `palette: ${palette}\ntypography: ${typography}\nscreens (${screens.length}):\n${screenLines}`;
}

/**
 * Vision-based judge. Shows the mockup image + a compact summary of each
 * candidate and asks the model to pick the closest visual match. On any
 * failure we fall back to "first candidate wins" — the candidates are
 * already ordered by priority.
 */
async function judgeBestCandidate(
  candidates: AssembledCandidate[],
  mockupHttpsUrl: string,
): Promise<{ winnerIndex: number; rationale: string }> {
  if (candidates.length <= 1) {
    return { winnerIndex: 0, rationale: "single candidate" };
  }

  const labelled = candidates
    .map((c, i) => `### Candidate ${i} — model: ${c.model}\n${summarizeCandidate(c)}`)
    .join("\n\n");

  const system = `You are a strict visual QA judge. Pick the candidate whose schema best matches the attached mockup image.

Score each candidate on:
- palette fidelity (exact hex match to mockup colors): 0–40
- typography fit (heading/body fonts match mockup feel): 0–15
- screen list fidelity (titles, count, order match mockup): 0–25
- element richness (6+ real typed elements per screen, no "text" placeholders): 0–20

RESPOND WITH ONLY VALID JSON: { "winnerIndex": <int>, "scores": [<int>,...], "rationale": "one short sentence" }`;

  const user = `Pick the closest match to the attached mockup.\n\n${labelled}`;

  const r = await callAIVision(system, user, [mockupHttpsUrl]);
  if (!r.ok) return { winnerIndex: 0, rationale: `judge failed (${r.error}); priority order` };
  const parsed = safeParse<{ winnerIndex?: number; rationale?: string }>(r.text);
  const idx = typeof parsed?.winnerIndex === "number" ? parsed!.winnerIndex : 0;
  if (idx < 0 || idx >= candidates.length) {
    return { winnerIndex: 0, rationale: "judge returned out-of-range index; priority order" };
  }
  return { winnerIndex: idx, rationale: parsed?.rationale ?? "" };
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
