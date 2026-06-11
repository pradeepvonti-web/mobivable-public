import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAIImage } from "./ai-provider";
import { consumeOrThrow, refundCredits, CREDIT_COSTS } from "./credits.server";

export const generateAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["icon", "splash"]),
        prompt: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try { await consumeOrThrow(context.userId, CREDIT_COSTS.image, `asset.${data.kind}`); }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
    const styleHint =
      data.kind === "icon"
        ? "App icon: bold, centered, symmetrical, 1024x1024, no text, vibrant, modern, suitable for iOS/Android home screen."
        : "Mobile app splash screen: 1024x1024, simple central focal point, soft background gradient, no text, generous negative space.";

    const fullPrompt = `${styleHint}\n\nConcept: ${data.prompt}`;

    const result = await callAIImage(fullPrompt);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }

    return { ok: true as const, dataUrl: result.dataUrl };
  });
