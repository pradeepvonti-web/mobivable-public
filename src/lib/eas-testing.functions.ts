import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";

const MAESTRO_FLOW_PROMPT = `You are a Maestro QA Engineer.
Given a mobile app's UI schema (screens, navigation, and elements), write a complete, valid Maestro UI test flow in YAML format.

Rules:
1. Output ONLY valid Maestro YAML. Do not include markdown code fences, explanation, or notes.
2. The YAML structure must start with the appId, followed by "---", and then a list of steps.
   Example:
   appId: app.lovable.example
   ---
   - launchApp
   - tapOn: "Get Started"
   - inputText: "user@example.com"
   - tapOn: "Next"
   - assertVisible: "Dashboard"
3. Supported Maestro actions:
   - launchApp
   - clearState
   - tapOn: "Text or Selector"
   - inputText: "text"
   - assertVisible: "Text"
   - scroll
   - back
4. Cover the primary user flow (e.g. Onboarding/Login -> Dashboard -> Tap primary action -> Assert details visible).
5. Map specific elements and buttons from the schema to simulate realistic interactions.
`;

/** Generate Maestro YAML test script using AI. */
export const generateMaestroFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, result, prompt")
      .eq("id", data.projectId)
      .single();
    if (!project) return { ok: false as const, error: "Project not found" };

    let schemaSummary = "";
    if (project.result) {
      try {
        const schema = JSON.parse(project.result);
        schemaSummary = JSON.stringify({
          name: schema.name,
          screens: schema.screens?.map((s: any) => ({
            id: s.id,
            title: s.title,
            navigation: s.navigation,
            interactiveElements: s.elements
              ?.filter((e: any) => ["button", "input", "toggle", "chip-group", "dropdown", "checkbox"].includes(e.type))
              .map((e: any) => ({ type: e.type, label: e.label || e.placeholder || e.title, action: e.action })),
          })),
        });
      } catch {
        schemaSummary = project.result.slice(0, 3000);
      }
    }

    try {
      await consumeOrThrow(userId, CREDIT_COSTS.text, "testing.generate_flow", project.id);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }

    const r = await callAI(
      MAESTRO_FLOW_PROMPT,
      `App Name: ${project.name}\nApp Idea: ${project.prompt}\nUI Schema:\n${schemaSummary}`
    );

    if (!r.ok) return { ok: false as const, error: r.error };
    return { ok: true as const, yamlFlow: r.text.trim() };
  });

/** Trigger a simulated cloud Maestro UI test execution. */
export const triggerEasTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        buildId: z.string().uuid().nullable(),
        yamlFlow: z.string().min(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Create pending test run
    const { data: testRun, error: insErr } = await supabase
      .from("eas_test_runs")
      .insert({
        project_id: data.projectId,
        build_id: data.buildId,
        user_id: userId,
        status: "running",
        yaml_flow: data.yamlFlow,
        logs: "⏳ [Maestro Cloud] Queueing test execution...\n",
      })
      .select("id")
      .single();

    if (insErr || !testRun) {
      return { ok: false as const, error: insErr?.message ?? "Failed to trigger run" };
    }

    // 2. Fetch project details to customize test results
    const { data: project } = await supabase
      .from("projects")
      .select("name, prompt, result")
      .eq("id", data.projectId)
      .single();

    // 3. Asynchronously run simulated Maestro execution
    // In a real environment, this dispatches a webhook to mobile.dev
    // We execute a stateful simulation and write steps/logs back to the database.
    setTimeout(async () => {
      try {
        let appName = project?.name || "App";
        let domain = "fintech";
        if (project?.result) {
          try {
            const schema = JSON.parse(project.result);
            appName = schema.name || appName;
            if (project.prompt?.toLowerCase().includes("fit")) domain = "fitness";
            if (project.prompt?.toLowerCase().includes("travel")) domain = "travel";
            if (project.prompt?.toLowerCase().includes("food")) domain = "food";
          } catch {}
        }

        // Standard Unsplash images mapping to app categories for simulated screenshots
        const domainImages: Record<string, string[]> = {
          fintech: [
            "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop", // Dashboard
            "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&auto=format&fit=crop", // Transaction details
            "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=600&auto=format&fit=crop", // Send success
          ],
          fitness: [
            "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop", // Warmup screen
            "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&auto=format&fit=crop", // Exercise tracker
            "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=600&auto=format&fit=crop", // Stats screen
          ],
          travel: [
            "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop", // Destination search
            "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&auto=format&fit=crop", // Trip itinerary
            "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop", // Hotel preview
          ],
          food: [
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop", // Menu browse
            "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop", // Cart checkout
            "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop", // Order delivery tracking
          ],
        };

        const activeImages = domainImages[domain] ?? domainImages.fintech;

        // Compile logs and step runs based on parsing the YAML flow
        const yamlLines = data.yamlFlow.split("\n");
        const steps: Array<{ name: string; cmd: string; time: string }> = [];
        let curAppId = "app.lovable";

        for (const line of yamlLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("appId:")) {
            curAppId = trimmed.split(":")[1].trim();
          } else if (trimmed.startsWith("-")) {
            const stepText = trimmed.replace("-", "").trim();
            if (stepText === "launchApp") {
              steps.push({ name: "Launch Application", cmd: "launchApp", time: "1.2s" });
            } else if (stepText === "clearState") {
              steps.push({ name: "Clear App Cache", cmd: "clearState", time: "0.4s" });
            } else if (stepText.startsWith("tapOn:")) {
              const selector = stepText.split(":")[1].replace(/['"]/g, "").trim();
              steps.push({ name: `Tap on "${selector}"`, cmd: `tapOn: "${selector}"`, time: "1.8s" });
            } else if (stepText.startsWith("inputText:")) {
              const val = stepText.split(":")[1].replace(/['"]/g, "").trim();
              steps.push({ name: `Type input "${val}"`, cmd: `inputText: "${val}"`, time: "2.1s" });
            } else if (stepText.startsWith("assertVisible:")) {
              const txt = stepText.split(":")[1].replace(/['"]/g, "").trim();
              steps.push({ name: `Assert visible: "${txt}"`, cmd: `assertVisible: "${txt}"`, time: "0.8s" });
            } else {
              steps.push({ name: `Execute command "${stepText}"`, cmd: stepText, time: "1.0s" });
            }
          }
        }

        if (steps.length === 0) {
          steps.push(
            { name: "Launch Application", cmd: "launchApp", time: "1.2s" },
            { name: "Verify Home Screen Dashboard", cmd: 'assertVisible: "Welcome"', time: "0.8s" },
            { name: "Interact with Dashboard Cards", cmd: "scroll", time: "1.5s" }
          );
        }

        // Simulating the log streams
        let runLogs = `🚀 [Maestro Cloud] Initializing simulator instance (iOS 17.4)\n` +
          `📦 Installing App Bundle: ${curAppId}...\n` +
          `✅ App installed successfully.\n\n` +
          `▶️ Starting Test Flow Execution:\n` +
          `----------------------------------------\n`;

        const testScreenshots: string[] = [];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          runLogs += `[STEP ${i + 1}/${steps.length}] ${step.name} (${step.time}) - SUCCESS\n`;
          // Map steps to Unsplash mock screenshots
          const imgIdx = Math.min(i, activeImages.length - 1);
          testScreenshots.push(activeImages[imgIdx]);
        }

        runLogs += `\n----------------------------------------\n` +
          `✅ [Maestro Cloud] Test Flow PASSED successfully.\n` +
          `⏱️ Total execution time: ${steps.length * 1.5}s\n` +
          `📊 Visual Assertions: ${steps.filter(s => s.cmd.startsWith("assertVisible")).length} passed, 0 failed.`;

        // Update database run outcome
        await supabase
          .from("eas_test_runs")
          .update({
            status: "passed",
            logs: runLogs,
            screenshots: testScreenshots,
          })
          .eq("id", testRun.id);

      } catch (runErr) {
        const errMsg = runErr instanceof Error ? runErr.message : "Unknown testing runner error";
        await supabase
          .from("eas_test_runs")
          .update({
            status: "failed",
            error_text: errMsg,
            logs: `❌ Test Run Failed:\n${errMsg}`,
          })
          .eq("id", testRun.id);
      }
    }, 100);

    return { ok: true as const, testRunId: testRun.id };
  });

/** List all Maestro test runs for a project. */
export const listEasTestRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: runs } = await supabase
      .from("eas_test_runs")
      .select("id, build_id, status, yaml_flow, logs, screenshots, error_text, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    return { ok: true as const, testRuns: runs ?? [] };
  });
