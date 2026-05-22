import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FRAMEWORK_LABELS: Record<string, string> = {
  react_native: "React Native (Expo)",
  flutter: "Flutter (Dart)",
  swiftui: "SwiftUI (iOS)",
  jetpack_compose: "Jetpack Compose (Kotlin / Android)",
};

const FRAMEWORK_INSTRUCTIONS: Record<string, string> = {
  react_native: `Use React Native with Expo SDK 51+. Use functional components, React hooks, TypeScript, and react-navigation for routing. Use StyleSheet.create for styles. Include proper SafeAreaView handling.`,
  flutter: `Use Flutter 3+ with Dart. Use StatelessWidget/StatefulWidget, Material Design 3, proper state management with setState or Provider. Include proper scaffold and app bar patterns.`,
  swiftui: `Use SwiftUI for iOS 17+. Use @State, @Binding, @ObservableObject, NavigationStack, and modern SwiftUI patterns. Include proper previews.`,
  jetpack_compose: `Use Jetpack Compose with Kotlin. Use Material3, remember/mutableStateOf, NavHost for navigation, and modern Compose patterns. Include proper @Preview annotations.`,
};

function requireKey(): string {
  const key = process.env.PIXLAB_API_KEY;
  if (!key) {
    throw new Error(
      "PIXLAB_API_KEY is not configured. Add it as a runtime secret to enable PixLab features."
    );
  }
  return key;
}

/**
 * Generate mobile UI code for a specific framework using PixLab's CODER API.
 */
export const generateMobileCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        framework: z.enum(["react_native", "flutter", "swiftui", "jetpack_compose"]),
        designSpec: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: fetchErr } = await supabase
      .from("projects")
      .select("id, prompt, name, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (fetchErr) return { ok: false as const, error: fetchErr.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };

    const frameworkLabel = FRAMEWORK_LABELS[data.framework] ?? data.framework;
    const frameworkInstructions = FRAMEWORK_INSTRUCTIONS[data.framework] ?? "";

    const prompt = `You are an expert mobile app developer. Generate premium, production-ready ${frameworkLabel} code for the following mobile application.

## Target Framework
${frameworkLabel}
${frameworkInstructions}

## App Description
${project.prompt ?? "A mobile application"}

${data.designSpec ? `## Design Specification (from Designer Agent)\n${data.designSpec}` : ""}

## Requirements
- Generate complete, runnable code — not snippets
- Include all necessary imports
- Use modern best practices and clean architecture
- Add helpful inline comments
- Make the UI polished, premium, and production-ready
- Use proper spacing, typography hierarchy, and color harmony
- Include loading states, error handling, and empty states where appropriate
- The code should compile and run without modification

Generate the full source code now:`;

    const apiKey = process.env.PIXLAB_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "PIXLAB_API_KEY is not configured on the server." };
    }

    try {
      const response = await fetch(`https://llm.pixlab.io/coder?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          format: "markdown",
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          ok: false as const,
          error: `PixLab API error (${response.status}): ${body || response.statusText}`,
        };
      }

      const result = await response.json();
      const generatedCode: string =
        typeof result === "string"
          ? result
          : result?.choices?.[0]?.message?.content ??
            result?.result ??
            result?.text ??
            result?.content ??
            JSON.stringify(result, null, 2);

      return {
        ok: true as const,
        code: generatedCode,
        framework: data.framework,
        frameworkLabel,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown PixLab API error";
      return { ok: false as const, error: msg };
    }
  });

// ─────────────────────────────────────────────────────────────────────────
// PixLab Image API — UI design helpers (bgremove, gen, filters, mockup)
// ─────────────────────────────────────────────────────────────────────────

const PIXLAB_IMG_BASE = "https://api.pixlab.io/v1";

async function callPixlabImg(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const key = requireKey();
  const res = await fetch(`${PIXLAB_IMG_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, key }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || (typeof data.status === "number" && data.status !== 200)) {
    const msg =
      (typeof data.error === "string" && data.error) ||
      `PixLab ${endpoint} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/** Remove background — returns a hosted PixLab URL of the transparent result. */
export const pixlabBgRemove = createServerFn({ method: "POST" })
  .inputValidator(z.object({ imageUrl: z.string().url().max(2048) }).parse)
  .handler(async ({ data }) => {
    const out = await callPixlabImg("bgremove", { img: data.imageUrl });
    return { url: (out.link as string | undefined) ?? null };
  });

/** Text → image generation. */
export const pixlabGenerate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      prompt: z.string().min(2).max(1000),
      width: z.number().int().min(256).max(1536).optional(),
      height: z.number().int().min(256).max(1536).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlabImg("gen", {
      text: data.prompt,
      width: data.width ?? 1024,
      height: data.height ?? 1024,
    });
    return { url: (out.link as string | undefined) ?? null };
  });

/** Apply a smart filter (blur, grayscale, oilpaint, sepia, sharpen, etc.). */
export const pixlabFilter = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imageUrl: z.string().url().max(2048),
      filter: z.enum([
        "blur",
        "grayscale",
        "oilpaint",
        "sepia",
        "sharpen",
        "edge",
        "emboss",
        "invert",
      ]),
      intensity: z.number().min(0).max(100).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlabImg(data.filter, {
      img: data.imageUrl,
      ...(data.intensity != null ? { sigma: data.intensity } : {}),
    });
    return { url: (out.link as string | undefined) ?? null };
  });

/** Merge a screenshot onto a device frame / background (mockup composer). */
export const pixlabMockup = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      screenshotUrl: z.string().url().max(2048),
      frameUrl: z.string().url().max(2048),
      x: z.number().int().min(0).max(4096).optional(),
      y: z.number().int().min(0).max(4096).optional(),
      opacity: z.number().min(0).max(100).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlabImg("merge", {
      src: data.frameUrl,
      cap: data.screenshotUrl,
      x: data.x ?? 0,
      y: data.y ?? 0,
      opacity: data.opacity ?? 100,
    });
    return { url: (out.link as string | undefined) ?? null };
  });
