import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI gateway is not configured" };
    }

    const styleHint =
      data.kind === "icon"
        ? "App icon: bold, centered, symmetrical, 1024x1024, no text, vibrant, modern, suitable for iOS/Android home screen."
        : "Mobile app splash screen: 1024x1024, simple central focal point, soft background gradient, no text, generous negative space.";

    const fullPrompt = `${styleHint}\n\nConcept: ${data.prompt}`;

    let res: Response;
    try {
      res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Network error",
      };
    }

    if (res.status === 429) {
      return { ok: false as const, error: "Rate limit reached. Try again shortly." };
    }
    if (res.status === 402) {
      return { ok: false as const, error: "AI credits exhausted. Add credits in Workspace settings." };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false as const, error: `AI error ${res.status}: ${text.slice(0, 200)}` };
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: { images?: Array<{ image_url?: { url?: string } }> };
      }>;
    };
    const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return { ok: false as const, error: "No image returned" };
    }

    return { ok: true as const, dataUrl };
  });
