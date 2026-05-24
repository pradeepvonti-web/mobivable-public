import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI, callAIImage } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";

/**
 * Generate a UI mockup image for a project using AI image generation.
 * Takes the UI/UX Designer's output and the project prompt to create
 * a professional-looking mockup of the mobile app screens.
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

    // Step 1: Ask the AI to convert the designer's output into a concise image prompt
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

    const promptResult = await callAI(promptSystemMsg, promptUserMsg);
    if (!promptResult.ok) {
      return { ok: false as const, error: `Failed to create prompt: ${promptResult.error}` };
    }

    // Step 2: Generate the mockup image
    const imagePrompt = `Professional mobile app UI mockup design. ${promptResult.text}

Style: Modern flat UI design mockup, 2x2 grid layout on dark charcoal background (#1a1a2e), 4 iPhone 15 Pro frames with realistic bezels, each showing a different app screen, screen labels in white text below each phone. Ultra clean, Dribbble/Behance quality, no text artifacts. High resolution, 4K quality.`;

    const imageResult = await callAIImage(imagePrompt);
    if (!imageResult.ok) {
      // Fallback: generate a text-based mockup description instead
      return {
        ok: true as const,
        type: "text" as const,
        mockupPrompt: promptResult.text,
        imageUrl: null,
        error: imageResult.error,
      };
    }

    return {
      ok: true as const,
      type: "image" as const,
      mockupPrompt: promptResult.text,
      imageUrl: imageResult.dataUrl,
      error: null,
    };
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
