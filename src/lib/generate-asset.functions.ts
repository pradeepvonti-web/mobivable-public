import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAIImage } from "./ai-provider";

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
  .handler(async ({ data }) => {
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
