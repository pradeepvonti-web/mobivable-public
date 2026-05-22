import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callAI } from "./ai-provider";

/* ─── helpers ───────────────────────────────────────────────── */

async function run(system: string, user: string) {
  const res = await callAI(system, user);
  if (!res.ok) throw new Error(res.error);
  return res.text;
}

function extractJSON<T>(text: string, fallback: T): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const raw = (fence ? fence[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)) as T; } catch { /* noop */ }
    }
    return fallback;
  }
}

/* ─── 1. AI Generate (planning) ─────────────────────────────── */

export const aiGenerate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ prompt: z.string().min(1).max(4000), projectName: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      "You are a senior product engineer helping plan a mobile app feature. Reply in concise markdown with: a one-line summary, a bulleted implementation plan (5-10 steps), required dependencies, and suggested file changes.",
      `Project: ${data.projectName ?? "Untitled"}\n\nFeature request:\n${data.prompt}`,
    );
    return { text };
  });

/* ─── 2. Web Research ───────────────────────────────────────── */

export const aiResearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      "You are a mobile/React Native research assistant. Return concise markdown with: 1) TL;DR, 2) 3-5 recommended approaches/libraries with one-line pros/cons, 3) key links the user can search for (no fabricated URLs — suggest search terms instead), 4) a recommended next step.",
      `Research topic: ${data.query}`,
    );
    return { text };
  });

/* ─── 3. Code Review ────────────────────────────────────────── */

const reviewSchema = z.object({
  checks: z.array(z.object({
    label: z.string(),
    status: z.enum(["pass", "warn", "fail"]),
    detail: z.string(),
  })),
  summary: z.string(),
});
export type ReviewResult = z.infer<typeof reviewSchema>;

export const aiCodeReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ projectName: z.string().max(200), context: z.string().max(4000).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      'You are a senior code reviewer for React Native / Expo apps. Reply ONLY with JSON matching: {"checks":[{"label":string,"status":"pass"|"warn"|"fail","detail":string}],"summary":string}. Cover: Type Safety, Error Handling, Accessibility, Performance, Security, Best Practices. Be specific.',
      `Project: ${data.projectName}\nContext: ${data.context ?? "(no extra context provided)"}`,
    );
    const parsed = extractJSON<ReviewResult>(text, {
      checks: [], summary: text.slice(0, 400),
    });
    return parsed;
  });

/* ─── 4. Smart Debug ────────────────────────────────────────── */

export const aiDebug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ input: z.string().min(1).max(4000), projectName: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      "You are an expert React Native debugger. Given an error or symptom, reply in concise markdown with: **Likely cause**, **Root analysis** (2-4 bullets), **Fix** (numbered steps + code snippets when useful), **Prevention** (1-2 bullets).",
      `Project: ${data.projectName ?? "Untitled"}\n\nIssue:\n${data.input}`,
    );
    return { text };
  });

/* ─── 5. Design — palette ───────────────────────────────────── */

const paletteSchema = z.object({
  palettes: z.array(z.object({
    name: z.string(),
    colors: z.array(z.string()).min(3).max(6),
  })).min(1),
  rationale: z.string(),
});
export type PaletteResult = z.infer<typeof paletteSchema>;

export const aiPalette = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ projectName: z.string().max(200), brief: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      'You are a senior product designer. Generate 3 palettes (Primary, Neutral, Accent) tailored to the app. Reply ONLY with JSON: {"palettes":[{"name":"Primary","colors":["#...","#...","#...","#..."]},...],"rationale":string}. Use modern hex values, harmonious shades.',
      `Project: ${data.projectName}\nBrief: ${data.brief ?? "Modern, polished mobile app."}`,
    );
    return extractJSON<PaletteResult>(text, {
      palettes: [{ name: "Primary", colors: ["#6366F1", "#4F46E5", "#4338CA", "#3730A3"] }],
      rationale: text.slice(0, 300),
    });
  });

/* ─── 6. Optimize ───────────────────────────────────────────── */

export const aiOptimize = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ projectName: z.string().max(200), focus: z.enum(["performance", "accessibility", "bundle", "all"]).default("all") }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await run(
      "You are a senior React Native performance engineer. Reply in concise markdown with sections: **Performance**, **Accessibility**, **Bundle size**, **Best practices** — 2-4 actionable bullets each. Be specific to React Native / Expo.",
      `Project: ${data.projectName}\nFocus: ${data.focus}`,
    );
    return { text };
  });
