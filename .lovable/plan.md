## Goal

Stop generating mobile apps that look like the same 6 presets with stock icons. Two upgrades:

1. **Custom theme per app** — AI outputs a full design system (palette, typography pair, radius, spacing, shadows, motion) instead of picking a preset name.
2. **AI-generated imagery** — hero banners, carousel slides, image elements, and grid cards get real generated images (Nano Banana via Lovable AI Gateway) cached in Cloud Storage, not placeholder gradients.

## Milestone 1A — Custom Theme System

### Schema changes

Extend `MobileTheme` in `src/lib/mobile-theme.ts`:

```text
MobileTheme {
  mode, primary, accent, background, card, text, muted, border, danger, success,
  gradient,
  // NEW
  typography: {
    headingFont: string,   // Google Font name e.g. "Space Grotesk"
    bodyFont: string,      // e.g. "Inter"
    displayFont?: string,  // optional editorial face
    scale: "compact" | "comfortable" | "editorial"
  },
  radius: { sm, md, lg, xl, pill },   // numbers in px
  spacing: { xs, sm, md, lg, xl },
  shadows: { sm, md, lg },             // CSS shadow strings
  motion: {
    duration: number,                   // ms
    easing: string,                     // cubic-bezier
    intensity: "subtle" | "medium" | "bold"
  }
}
```

Keep the 6 presets as fallbacks; each gets default values filled in.

### CSS variable surface

`themeToCSSVars` emits:
- `--m-font-heading`, `--m-font-body`, `--m-font-display`
- `--m-radius-sm/md/lg/xl/pill`
- `--m-space-xs/sm/md/lg/xl`
- `--m-shadow-sm/md/lg`
- `--m-ease`, `--m-duration`

Renderer (`MobileAppRenderer.tsx`) injects a dynamic `<link rel="stylesheet">` for the chosen Google Fonts, swaps hardcoded `fontFamily`/radii/shadows in `MobileComponents.tsx` to use the new vars (no behavior change for preset users — they get sensible defaults).

### Prompt changes (`src/lib/code-gen.ts`)

AI is now required to output a **full theme object** (not a preset string) per app, with:
- Palette derived from app domain + mood
- Typography pair from a curated whitelist (~15 Google Font pairs to keep load fast)
- Radius/spacing/motion that matches the mood (e.g. editorial → larger radius + slower motion + serif display font)

Whitelist enforced server-side via `schema-validator.ts` — unknown fonts snap to nearest preset.

### Validator update

`schema-validator.ts` accepts both string preset names (backward compat) and full theme objects. Fills missing keys with sane defaults so the renderer never crashes.

## Milestone 1B — AI-Generated Imagery

### Schema changes

Add optional `prompt: string` field to image-bearing elements:
- `MImage.props.prompt`
- `MHeroBanner.props.prompt`
- `MCarousel.props.items[].prompt`
- `MGridCards.props.items[].prompt`

Existing `src` URL still wins. If `prompt` is set and `src` is empty, the image pipeline fills it.

### Storage bucket

New migration: public `app-assets` bucket, path scheme `{projectId}/{hash}.png`. Public read; only service role writes.

### Image generator (`src/lib/app-images.functions.ts` — NEW)

Server function `generateAppImages({ projectId })`:
1. Loads the project's current schema from `projects.result`.
2. Walks all screens; collects any image element with `prompt && !src`.
3. For each prompt:
   - Hashes prompt + theme palette → asset key.
   - Calls Lovable AI Gateway directly with `google/gemini-2.5-flash-image` (Nano Banana), passing prompt enriched with theme palette hint (e.g. "in palette #6366f1, #22c55e, dark background").
   - Decodes base64, uploads to `app-assets/{projectId}/{hash}.png` via `supabaseAdmin`.
   - Writes back the public URL into the schema element's `src`.
4. Persists updated schema to `projects.result`.
5. Returns counts: `{ generated, cached, failed }`.

Concurrency: process in batches of 3 to avoid gateway rate limits.

### Prompt changes

The code-gen prompt now instructs the AI to **always add a `prompt` field** to hero banners, carousel slides, grid cards (when visual), and image elements. Prompts must be 1-2 sentence cinematic art-direction strings ("dimly lit espresso bar at golden hour, shallow depth of field, editorial").

### UX wiring

In `src/routes/projects.$projectId.tsx`:
- After `generateProject` finishes, automatically call `generateAppImages` in the background.
- Show subtle "Generating imagery…" pill in the preview header with a count (e.g. `4/7`).
- Each image, as it lands, swaps into the live preview (poll the schema or use Supabase realtime).
- Add manual "Regenerate imagery" button in the existing toolbar.

### Cost guard

- Skip if `prompt` already mapped to an existing asset (hash-based cache).
- Hard cap: 12 generated images per app generation pass.
- Surface gateway errors (429 → "Image quota reached", 402 → "Add credits to workspace") instead of failing the whole render.

## Files Touched / Created

```text
NEW   src/lib/app-images.functions.ts        # image generator server fn
NEW   supabase/migrations/*_app_assets.sql   # public bucket + RLS

EDIT  src/lib/mobile-theme.ts                # extended type + defaults + CSS vars
EDIT  src/lib/mobile-app-schema.ts           # optional `prompt` on image elements
EDIT  src/lib/schema-validator.ts            # accept custom theme objects, snap fonts
EDIT  src/lib/code-gen.ts                    # new system prompt, font whitelist
EDIT  src/components/MobileAppRenderer.tsx   # font loader, vars
EDIT  src/components/MobileComponents.tsx    # use --m-radius/--m-font/--m-shadow
EDIT  src/routes/projects.$projectId.tsx    # post-gen image pipeline + UI
```

## Dependencies / Secrets

- `LOVABLE_API_KEY` — required for Nano Banana image generation. If not present, I'll provision it via `lovable_api_key--create`.
- No new npm packages.

## Order of execution

1. Migration: create `app-assets` storage bucket.
2. Schema + theme type extensions (backward compatible).
3. Renderer + components consume new CSS vars.
4. Code-gen prompt rewrite.
5. Image generator server fn + wiring in project route.
6. Manual smoke test on the current project.

## Out of scope (saved for later)

- Richer primitives (glass-card, bento-grid, etc.) — separate milestone.
- Per-screen layout templates.
- Motion playback in preview (we'll emit motion tokens but actual animation execution comes later).
- Editing/regenerating individual images from the UI (only "regenerate all" for now).

Approve and I'll start with the migration.