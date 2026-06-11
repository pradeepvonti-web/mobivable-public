import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";
import { consumeOrThrow, refundCredits, CREDIT_COSTS } from "./credits.server";
import type { MobileTheme } from "./mobile-theme";
import { FONT_ALLOWLIST } from "./mobile-theme";

/**
 * Extract a MobileTheme (colors, typography) from the UI/UX Designer's spec.
 * Used to apply the same visual direction from the mockup back into the live
 * rendered screens so the preview matches the mockup image.
 */
export const extractThemeFromDesigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        designerOutput: z.string().min(10),
        projectName: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try { await consumeOrThrow(context.userId, CREDIT_COSTS.text, "extract_theme"); }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
    const system = `You convert a UI/UX design spec into a strict JSON theme for a mobile app renderer.

Output ONLY valid JSON matching this shape (no markdown, no commentary):
{
  "mode": "dark" | "light",
  "primary": "#hex",
  "accent": "#hex",
  "background": "#hex",
  "card": "#hex",
  "text": "#hex",
  "muted": "#hex",
  "border": "#hex",
  "danger": "#hex",
  "success": "#hex",
  "gradient": ["#hex", "#hex"],
  "typography": { "headingFont": "<font>", "bodyFont": "<font>", "scale": "compact" | "comfortable" | "editorial" }
}

Font names MUST be chosen from this allowlist: ${FONT_ALLOWLIST.join(", ")}.
Pick colors that match the spec's intent. Ensure contrast: text vs background, card vs background.`;

    const user = `App: ${data.projectName ?? "Mobile App"}

Designer spec:
${data.designerOutput.slice(0, 3000)}

Return the JSON theme only.`;

    try {
      const r = await callAI(system, user);
      if (!r.ok) {
        await refundCredits(context.userId, CREDIT_COSTS.text, "extract_theme");
        return { ok: false as const, error: r.error };
      }

      // Strip code fences if model wrapped them
      const text = r.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      try {
        const theme = JSON.parse(text) as Partial<MobileTheme>;
        if (!theme.primary || !theme.background) {
          await refundCredits(context.userId, CREDIT_COSTS.text, "extract_theme");
          return { ok: false as const, error: "Theme missing required fields" };
        }
        return { ok: true as const, theme };
      } catch (e) {
        await refundCredits(context.userId, CREDIT_COSTS.text, "extract_theme");
        return {
          ok: false as const,
          error: e instanceof Error ? `Parse failed: ${e.message}` : "Parse failed",
        };
      }
    } catch (e) {
      await refundCredits(context.userId, CREDIT_COSTS.text, "extract_theme");
      throw e;
    }
  });
