import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAI } from "./ai-provider";
import { consumeOrThrow, refundCredits, CREDIT_COSTS } from "./credits.server";
import {
  dispatchMaestroWorkflow,
  ensureMaestroWorkflowInRepo,
  MAESTRO_WORKFLOW_PATH,
} from "./maestro-cloud.functions";

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

    try {
      const r = await callAI(
        MAESTRO_FLOW_PROMPT,
        `App Name: ${project.name}\nApp Idea: ${project.prompt}\nUI Schema:\n${schemaSummary}`
      );

      if (!r.ok) {
        await refundCredits(userId, CREDIT_COSTS.text, "testing.generate_flow", project.id);
        return { ok: false as const, error: r.error };
      }
      return { ok: true as const, yamlFlow: r.text.trim() };
    } catch (e) {
      await refundCredits(userId, CREDIT_COSTS.text, "testing.generate_flow", project.id);
      throw e;
    }
  });

/**
 * Trigger a real Maestro Cloud test run via GitHub Actions.
 *
 * Replaces the old simulator (which set a row to `passed` after parsing the
 * YAML and inserting Unsplash stock photos). Flow now:
 *
 *   1. Validate buildId points to a finished `eas_builds` row owned by the
 *      caller with a usable artifact URL.
 *   2. Verify the caller has a GitHub OAuth token with the `workflow` scope
 *      AND the project has a linked repo (eas_apps.github_repo_*).
 *   3. Insert a row in eas_test_runs at status='queued'.
 *   4. Idempotently install/update .github/workflows/maestro-cloud.yml in
 *      the user's repo.
 *   5. POST workflow_dispatch with the YAML flow (base64), artifact URL,
 *      platform, and the test run id (passed back via env so the Maestro
 *      webhook can correlate).
 *   6. Store the GitHub Actions run id for deep-linking.
 *
 * No setTimeout, no background simulation. The status transitions
 * (queued → running → passed/failed/cancelled) come from Maestro's webhook
 * (see /api/public/maestro/webhook).
 */
export const triggerEasTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        buildId: z.string().uuid(),
        yamlFlow: z.string().min(5).max(50_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ─── Step 1: validate the build ───
    const { data: build, error: buildErr } = await supabase
      .from("eas_builds")
      .select("id, status, artifact_url, platform, user_id")
      .eq("id", data.buildId)
      .eq("user_id", userId)
      .maybeSingle();
    if (buildErr) return { ok: false as const, error: buildErr.message };
    if (!build) {
      return {
        ok: false as const,
        error: "Build not found or doesn't belong to you.",
      };
    }
    if (build.status !== "finished") {
      return {
        ok: false as const,
        error: `Build is ${build.status} — wait for it to finish before running a test.`,
      };
    }
    if (!build.artifact_url) {
      return {
        ok: false as const,
        error: "Build has no downloadable artifact URL.",
      };
    }
    const platform = build.platform === "ios" ? "ios" : "android";

    // ─── Step 2: GitHub + repo prerequisites ───
    const { data: conn } = await supabaseAdmin
      .from("github_connections")
      .select("access_token, scopes")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn?.access_token) {
      return {
        ok: false as const,
        error: "Connect GitHub first — the workflow file lives in your repo.",
      };
    }
    const scopes = typeof conn.scopes === "string" ? conn.scopes : "";
    if (!scopes.split(/[,\s]+/).includes("workflow")) {
      return {
        ok: false as const,
        error:
          "Your GitHub connection needs the `workflow` scope. Disconnect and reconnect in the studio so we can manage `.github/workflows/maestro-cloud.yml`.",
      };
    }

    const { data: app } = await supabase
      .from("eas_apps")
      .select("github_repo_owner, github_repo_name, github_default_branch")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!app?.github_repo_owner || !app?.github_repo_name) {
      return {
        ok: false as const,
        error:
          "This project isn't linked to a GitHub repo yet. Push code to GitHub from the Deployments panel first.",
      };
    }
    const repo = {
      owner: app.github_repo_owner,
      repo: app.github_repo_name,
      branch: app.github_default_branch ?? "main",
    };

    // ─── Step 3: create the row at status='queued' ───
    const { data: testRun, error: insErr } = await supabase
      .from("eas_test_runs")
      .insert({
        project_id: data.projectId,
        build_id: data.buildId,
        user_id: userId,
        status: "queued",
        yaml_flow: data.yamlFlow,
        queued_at: new Date().toISOString(),
        logs: "⏳ Ensuring workflow file is in your repo...\n",
      })
      .select("id")
      .single();
    if (insErr || !testRun) {
      return { ok: false as const, error: insErr?.message ?? "Failed to insert test run" };
    }

    // ─── Step 4: idempotently install the workflow file ───
    try {
      const ensured = await ensureMaestroWorkflowInRepo(conn.access_token, repo);
      await supabase
        .from("eas_test_runs")
        .update({
          logs:
            (ensured.updated
              ? `📝 Updated ${MAESTRO_WORKFLOW_PATH} in ${repo.owner}/${repo.repo}\n`
              : `✅ ${MAESTRO_WORKFLOW_PATH} already up to date\n`) +
            "⏳ Dispatching workflow run...\n",
        })
        .eq("id", testRun.id);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("eas_test_runs")
        .update({
          status: "errored",
          error_text: errMsg,
          finished_at: new Date().toISOString(),
          logs: `❌ Could not write workflow file:\n${errMsg}`,
        })
        .eq("id", testRun.id);
      return { ok: false as const, error: errMsg };
    }

    // ─── Step 5: dispatch ───
    try {
      const dispatched = await dispatchMaestroWorkflow(conn.access_token, repo, {
        flowContent: data.yamlFlow,
        buildArtifactUrl: build.artifact_url,
        buildPlatform: platform,
        mobivableTestRunId: testRun.id,
        runName: `Mobivable-${testRun.id.slice(0, 8)}`,
      });
      await supabase
        .from("eas_test_runs")
        .update({
          status: "running",
          github_workflow_run_id: dispatched.githubRunId,
          logs:
            "🚀 Workflow dispatched.\n" +
            (dispatched.githubRunId
              ? `🔗 https://github.com/${repo.owner}/${repo.repo}/actions/runs/${dispatched.githubRunId}\n`
              : "") +
            "⏳ Waiting for Maestro Cloud to upload + run...\n",
        })
        .eq("id", testRun.id);
      return {
        ok: true as const,
        testRunId: testRun.id,
        githubRunId: dispatched.githubRunId,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("eas_test_runs")
        .update({
          status: "errored",
          error_text: errMsg,
          finished_at: new Date().toISOString(),
          logs: `❌ Could not dispatch GitHub Actions workflow:\n${errMsg}`,
        })
        .eq("id", testRun.id);
      return { ok: false as const, error: errMsg };
    }
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
