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

    // 1. Fetch project for context
    const { data: project, error: fetchErr } = await supabase
      .from("projects")
      .select("id, prompt, name, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (fetchErr) return { ok: false as const, error: fetchErr.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };

    // 2. Build the prompt
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

    // 3. Call PixLab CODER API
    const apiKey = process.env.PIXLAB_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "PIXLAB_API_KEY is not configured on the server." };
    }

    try {
      const response = await fetch("https://llm.pixlab.io/coder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": apiKey,
        },
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

      // PixLab returns the generated content — extract the text
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
