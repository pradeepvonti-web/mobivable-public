/**
 * Vision pass for the "clone an app from its store listing" flow.
 *
 * Takes the marketing screenshots + description scraped by
 * ingest-app-store.functions.ts and asks a vision model to produce a
 * structured CloneSpec. The spec is a SUPERSET of the DESIGN BRIEF that
 * generate-project's pass 2 already consumes (see DESIGN_BRIEF_SYSTEM_PROMPT
 * in code-gen.ts) — so the design half can be fed straight into the existing
 * generator with no changes — PLUS three "functional" sections the model
 * *infers* rather than observes:
 *
 *   - features      — what the app appears to do
 *   - dataEntities  — the data model behind those features
 *   - userFlows     — the key task flows
 *
 * Those three are guesses. A store listing shows ~5–10 polished screens and a
 * marketing blurb; it reveals nothing about real backend behavior. So every
 * inferred item carries a `confidence` flag, and the downstream user-confirm
 * gate surfaces low-confidence items for the user to correct before any code
 * is generated. We never silently treat an inference as fact.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAIVision } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";
import { FONT_ALLOWLIST } from "./mobile-theme";

export type Confidence = "high" | "medium" | "low";

export interface CloneSpec {
  appName: string;
  domain: string;
  mood: string;
  audience: string;
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
  typography: { headingFont: string; bodyFont: string; displayFont?: string; scale: "compact" | "comfortable" | "editorial" };
  radius: "tight" | "rounded" | "pillowy";
  spacing: "compact" | "comfortable" | "airy";
  motion: "subtle" | "medium" | "bold";
  references: string[];
  screens: { id: string; title: string; icon: string; layout: string; purpose: string; keyPrimitives: string[] }[];
  navigation: string[];
  // ─── Inferred functional sections (guesses — carry confidence) ───
  features: { name: string; description: string; confidence: Confidence }[];
  dataEntities: { name: string; fields: string[]; confidence: Confidence }[];
  userFlows: { name: string; steps: string[]; confidence: Confidence }[];
}

function buildSystemPrompt(): string {
  return `You are a senior product designer + systems analyst. You are shown the MARKETING SCREENSHOTS of an existing mobile app plus its store description. Reverse-engineer it into a single JSON spec another model will use to build a clone.

RESPOND WITH ONLY VALID JSON — no fences, no prose.

Schema:
{
  "appName": "...",
  "domain": "fintech|wellness|fitness|travel|editorial|social|ecommerce|productivity|kids|sports|luxury|dev-tools|food|music|...",
  "mood": "2–4 adjectives",
  "audience": "one sentence",
  "palette": {
    "mode": "dark"|"light",
    "primary": "#hex", "accent": "#hex",
    "background": "#hex", "card": "#hex",
    "text": "#hex", "muted": "#hex", "border": "#hex",
    "danger": "#hex", "success": "#hex",
    "gradient": ["#hex","#hex"]
  },
  "typography": { "headingFont": "<from allowlist>", "bodyFont": "<from allowlist>", "displayFont": "<optional>", "scale": "compact"|"comfortable"|"editorial" },
  "radius": "tight"|"rounded"|"pillowy",
  "spacing": "compact"|"comfortable"|"airy",
  "motion": "subtle"|"medium"|"bold",
  "references": ["3–5 real apps/brands whose feel matches what you see"],
  "screens": [
    { "id":"home", "title":"...", "icon":"<icon name>", "layout":"bento-grid"|"stack"|"magazine"|"split-hero"|"full-bleed", "purpose":"one line", "keyPrimitives":["parallax-hero","stat-card-xl","glass-card","feature-showcase","testimonial","pricing-card","marquee","onboarding-slide","line-chart","sparkline","progress-bar","gauge-chart","radar-chart","bank-card","swipe-card","calendar-strip","chat-bubble","map-card","video-player","timeline","accordion","dropdown","checkbox","radio-group"] }
  ],
  "navigation": ["home","explore","activity","profile"],
  "features": [ { "name":"...", "description":"one line", "confidence":"high"|"medium"|"low" } ],
  "dataEntities": [ { "name":"...", "fields":["field: type", "..."], "confidence":"high"|"medium"|"low" } ],
  "userFlows": [ { "name":"...", "steps":["...","..."], "confidence":"high"|"medium"|"low" } ]
}

FONT ALLOWLIST: ${FONT_ALLOWLIST.join(", ")}

RULES:
- palette/typography/radius/screens: derive STRICTLY from what is visible in the screenshots. Match the real colors and type feel.
- One "screens" entry per distinct screen you can see (4–8). Use the real screen names.
- features/dataEntities/userFlows are INFERENCES. Mark "high" only when a screenshot or the description directly shows it; "medium" when strongly implied; "low" when you are guessing to fill a gap. Do not omit likely features just because you are unsure — include them as "low".
- Be honest with confidence. The user will review and correct these before any code is generated.`;
}

export const analyzeAppScreens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(8000).default(""),
        category: z.string().max(120).nullish(),
        screenshotUrls: z.array(z.string().url()).min(1).max(10),
        model: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try { await consumeOrThrow(context.userId, CREDIT_COSTS.image + CREDIT_COSTS.text, "analyze_app_screens"); }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }

    const user = `App name: ${data.title}
${data.category ? `Category: ${data.category}\n` : ""}Store description:
${data.description.slice(0, 6000) || "(none provided)"}

The attached images are the app's marketing screenshots. Produce the JSON spec.`;

    const r = await callAIVision(buildSystemPrompt(), user, data.screenshotUrls, data.model);
    if (!r.ok) return { ok: false as const, error: r.error };

    const text = r.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false as const, error: "Vision model did not return JSON." };
    }
    try {
      const spec = JSON.parse(text.slice(start, end + 1)) as Partial<CloneSpec>;
      if (!spec.palette?.primary || !Array.isArray(spec.screens) || spec.screens.length === 0) {
        return { ok: false as const, error: "Spec missing required fields (palette/screens)." };
      }
      return { ok: true as const, spec: spec as CloneSpec, provider: r.provider, model: r.model };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? `Parse failed: ${e.message}` : "Parse failed" };
    }
  });
