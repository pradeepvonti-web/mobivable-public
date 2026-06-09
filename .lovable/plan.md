# Make the build match the mockup — multi-AI vision-grounded pipeline

## The similarity problem you're seeing

The mockup (Culina Modern — dark chef app, indigo accents, 4 screens: Onboarding, The Pass, Flavor Atlas, Technical Sheet) and the actual build (serif "Master the Art of Cooking" / "Geometry of Gastronomy" with a giant `?` placeholder) share **almost nothing**: different palette, different typography, different screens, missing content. Same failure class as the prior FlavorShare run.

Root cause: today's pipeline only feeds the **textual brief JSON** into the final schema model. The mockup image — which is what the user actually approved — is never re-shown to the generator. So the model improvises whenever the brief is ambiguous, and drifts.

## Fix: a 3-stage multi-AI pipeline, mockup image as ground truth

```text
   ┌───────────────────────────────┐
   │ Stage 1 — VISION RE-READ      │  callAIVision (Gemini 2.5 Pro / GPT-5)
   │ Input:  approved mockup IMAGE │  Re-derives a strict CloneSpec from
   │         + saved brief JSON    │  the IMAGE, reconciled with brief.
   │ Output: ReconciledSpec        │  Image wins on visual fields.
   └──────────────┬────────────────┘
                  │
   ┌──────────────▼────────────────┐
   │ Stage 2 — PER-SCREEN PLANNER  │  callAIStrong (Claude Sonnet / GPT-5)
   │ Input:  ReconciledSpec        │  Emits, per screen: ordered list of
   │ Output: ScreenPlan[]          │  REAL element types + copy + data.
   └──────────────┬────────────────┘  (No "[split-hero]" placeholders.)
                  │
   ┌──────────────▼────────────────┐
   │ Stage 3 — SCHEMA ASSEMBLER    │  callAIStrong, constrained
   │ Input:  ReconciledSpec +      │  Emits MobileAppSchema JSON
   │         ScreenPlan[]          │  matching the existing validator.
   │ Output: MobileAppSchema       │
   └──────────────┬────────────────┘
                  │
        Validator → schema-validator.ts → DB → image auto-fill
```

Three models, three roles. Vision grounds design; planner enforces structure; assembler emits valid JSON. Each stage's output is the next stage's input, so a single weak step can't ruin the build.

## Why three calls, not one

A single strong call has to simultaneously: read an image, reconcile it with a brief, plan 5–8 screens, and emit ~1000 lines of valid JSON. That's the workload that currently fails. Splitting it:
- Vision call is cheap and short (returns ~spec-sized JSON).
- Planner call is text-only and small (returns ~screen plan).
- Assembler call is large but has zero design decisions left to make — it just composes known pieces into the schema shape.

## Where it plugs in

- `src/lib/agent-run.functions.ts` → `finalizeAgentRun`, the block that today builds `userPrompt` + calls `callAIStrong` once (lines ~543–632). Replace with the 3-stage pipeline **only when `savedBrief` exists AND `projects.attachments.design_mockup_url` is set** (already saved on approval). Fall back to today's single-call path otherwise.
- New helper file: `src/lib/build-from-mockup.functions.ts` with `reconcileFromMockup()`, `planScreens()`, `assembleSchema()` — pure functions, no route changes.
- Reuse existing helpers: `callAIVision`, `callAIStrong`, `parseAppSchema`, `validateAndFixSchema`, `runAppImagesInternal`. No new dependencies.

## Guardrails

1. Each stage validates its output; on parse failure, retry once with a "previous attempt was invalid: <reason>" tail, then fall back to today's path so the user always gets *something*.
2. Per-screen element count enforced post-assembly (6–10); if a screen is short, re-call the assembler for that screen only.
3. Palette/typography/screen-ids from Stage 1 are passed to Stage 3 as **locked** fields — assembler is instructed to copy verbatim, and the validator rejects drift.
4. Credits: ~3× current cost on builds with a mockup. Gated behind the existing `consumeOrThrow` flow with a single combined charge so partial failures don't leak credits.

## What the user will see

- "Approve & Build" stays the same button.
- Status messages will progress: "Reading mockup…", "Planning screens…", "Assembling app…", "Generating images…" so the user knows it's doing real work.
- Build time goes from ~1 strong call to ~3 (≈ 1.5–2× wall clock).
- Output should visibly match the mockup: same screen titles ("The Pass", "Flavor Atlas", "Technical Sheet"), same dark palette, same indigo accent, same chef imagery.

## Out of scope for this change

- No edits to the renderer (`flutter_preview_engine`), schema validator, or DesignBriefCard UI.
- No changes to the no-mockup / no-brief path.
- Mockup regeneration flow stays as-is.

Confirm and I'll implement.