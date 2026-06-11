import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI, callAIImage } from "./ai-provider";
import { consumeOrThrow, refundCredits, CREDIT_COSTS } from "./credits.server";

/**
 * Generate a UI mockup image for a project using AI image generation.
 * Takes the UI/UX Designer's output and the project prompt to create
 * a professional-looking mockup of the mobile app screens.
 *
 * mode: "quick"  = single screen, skips text prompt engineering, faster (~3-5x)
 * mode: "full"   = 2x2 four-screen grid with detailed prompts (default)
 */
export const generateMockupImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        designerOutput: z.string().min(10),
        projectPrompt: z.string(),
        projectName: z.string().optional(),
        mode: z.enum(["quick", "full"]).optional().default("full"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify project ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found" };
    }

    const isQuick = data.mode === "quick";
    const COST = isQuick ? CREDIT_COSTS.image : CREDIT_COSTS.image + CREDIT_COSTS.text;
    const reason = isQuick ? "mockup-quick" : "mockup";

    let imagePrompt: string;

    if (isQuick) {
      // ── QUICK MODE ──
      try { await consumeOrThrow(userId, COST, reason, project.id); }
      catch (e) { return { ok: false as const, error: (e as Error).message }; }

      imagePrompt = `Professional mobile app UI mockup. A single iPhone 15 Pro frame centered on a clean dark background (#1a1a2e). The screen shows the main/home view of "${data.projectName ?? "Mobile App"}". 

Design spec to follow:
${data.designerOutput.slice(0, 1500)}

Style: Modern flat UI, Dribbble-quality, clean typography, no text artifacts, minimal shadows, high contrast. The iPhone frame should have a subtle realistic bezel. No labels, no extra UI outside the phone frame.`;
    } else {
      // ── FULL MODE ──
      const promptSystemMsg = `You are a UI mockup prompt engineer. Given a mobile app design specification, produce a single image generation prompt that will create a professional mobile app mockup grid showing 4 key screens.

Rules:
- The prompt must describe a 2x2 grid of iPhone screens on a dark background
- Each screen must be clearly labeled below it
- Describe specific UI elements, colors, typography, and layout for each screen
- The style should be photorealistic iPhone mockups with the app displayed
- Keep the prompt under 300 words
- Include the app name and color scheme
- Output ONLY the image prompt text, nothing else.`;

      const promptUserMsg = `App name: ${data.projectName ?? "Mobile App"}
App idea: ${data.projectPrompt}

UI/UX Designer's specification:
${data.designerOutput.slice(0, 2000)}

Generate the image prompt for a professional 4-screen mockup of this app.`;

      try { await consumeOrThrow(userId, COST, reason, project.id); }
      catch (e) { return { ok: false as const, error: (e as Error).message }; }

      const promptResult = await callAI(promptSystemMsg, promptUserMsg);
      if (!promptResult.ok) {
        await refundCredits(userId, COST, reason, project.id);
        return { ok: false as const, error: `Failed to create prompt: ${promptResult.error}` };
      }

      imagePrompt = `Professional mobile app UI mockup design. ${promptResult.text}

Style: Modern flat UI design mockup, 2x2 grid layout on dark charcoal background (#1a1a2e), 4 iPhone 15 Pro frames with realistic bezels, each showing a different app screen, screen labels in white text below each phone. Ultra clean, Dribbble/Behance quality, no text artifacts. High resolution, 4K quality.`;
    }

    try {
      const imageResult = await callAIImage(imagePrompt);
      if (!imageResult.ok) {
        // Image gen failed — refund and return text-only fallback
        await refundCredits(userId, COST, reason, project.id);
        return {
          ok: true as const,
          type: "text" as const,
          mockupPrompt: imagePrompt.slice(0, 500),
          imageUrl: null,
          error: imageResult.error,
        };
      }

      return {
        ok: true as const,
        type: "image" as const,
        mockupPrompt: imagePrompt.slice(0, 500),
        imageUrl: imageResult.dataUrl,
        error: null,
      };
    } catch (e) {
      await refundCredits(userId, COST, reason, project.id);
      throw e;
    }
  });

/**
 * Generate screen-by-screen mockup descriptions from the designer output.
 * This is used as a fallback when image generation isn't available.
 */
export function parseScreensFromDesignerOutput(output: string): { name: string; description: string }[] {
  const screens: { name: string; description: string }[] = [];
  const lines = output.split("\n");
  let currentScreen = "";
  let currentDesc: string[] = [];

  for (const line of lines) {
    // Match screen headers like "## Home Screen" or "- **Home/Dashboard**"
    const headerMatch = line.match(/^#{1,3}\s+(.+?)(?:\s*[-–—]\s*(.+))?$/) ??
      line.match(/^[-*]\s+\*\*(.+?)\*\*(?:\s*[-–—:]\s*(.+))?/);
    if (headerMatch) {
      if (currentScreen) {
        screens.push({ name: currentScreen, description: currentDesc.join("\n").trim() });
      }
      currentScreen = headerMatch[1].replace(/\*\*/g, "").trim();
      currentDesc = headerMatch[2] ? [headerMatch[2]] : [];
    } else if (currentScreen && line.trim()) {
      currentDesc.push(line);
    }
  }
  if (currentScreen) {
    screens.push({ name: currentScreen, description: currentDesc.join("\n").trim() });
  }

  return screens.slice(0, 8); // Max 8 screens
}
