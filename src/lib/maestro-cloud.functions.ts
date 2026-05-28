/**
 * Maestro Cloud integration via GitHub Actions.
 *
 * Architecture choice (see panel in Testing & QA): the studio does NOT call
 * Maestro Cloud's HTTP API directly — it's undocumented and brittle. Instead:
 *
 *   1. Studio ensures `.github/workflows/maestro-cloud.yml` is present in the
 *      user's already-linked repo (idempotent via Contents API).
 *   2. Studio dispatches the workflow with `flowContent` (base64 YAML),
 *      `buildArtifactUrl`, `buildPlatform`, and `mobivableTestRunId`.
 *   3. The workflow uses `mobile-dev-inc/action-maestro-cloud@v1` (Maestro's
 *      OFFICIAL action) to upload + run.
 *   4. Maestro Cloud → POST → studio's `/api/public/maestro/webhook` route,
 *      authenticated by a Bearer token the operator configures in Maestro's
 *      project settings.
 *   5. Webhook handler matches `envVariables.MOBIVABLE_TEST_RUN_ID` back to
 *      the studio's `eas_test_runs` row and writes final status.
 *
 * This module owns step 1 and exports helpers the trigger fn uses for step 2.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Stable path inside the user's repo. Treated as the single source of truth. */
export const MAESTRO_WORKFLOW_PATH = ".github/workflows/maestro-cloud.yml";

/** Bumped whenever WORKFLOW_TEMPLATE changes — written into the file as a comment. */
export const MAESTRO_WORKFLOW_VERSION = 1;

/**
 * The workflow file we manage on behalf of the user. Pinned action version,
 * base64-encoded flow content (to avoid shell-escaping issues), explicit
 * permissions (`contents: read` only — we never need write).
 *
 * Inputs are typed and small. `flowContent` is the YAML body, base64-encoded
 * upstream so it round-trips cleanly through GitHub's JSON dispatch payload.
 */
export const MAESTRO_WORKFLOW_TEMPLATE = `# Managed by Mobivable Studio — version ${MAESTRO_WORKFLOW_VERSION}.
# Re-applied automatically when the studio detects content drift.
# Do not edit by hand; your changes will be overwritten on the next "Run Test".

name: Maestro Cloud (Mobivable)

on:
  workflow_dispatch:
    inputs:
      flowContent:
        description: Maestro YAML flow body, base64-encoded.
        required: true
        type: string
      buildArtifactUrl:
        description: HTTPS URL to the .apk / .aab / .ipa / .zip(.app) artifact.
        required: true
        type: string
      buildPlatform:
        description: 'ios | android'
        required: true
        type: string
      mobivableTestRunId:
        description: Echoed back via env so the Maestro webhook can correlate.
        required: true
        type: string
      runName:
        description: Optional display name in Maestro Cloud.
        required: false
        type: string
        default: Mobivable-test

permissions:
  contents: read

jobs:
  maestro:
    runs-on: ubuntu-latest
    steps:
      - name: Stage workspace
        run: mkdir -p ./build ./.maestro

      - name: Download app artifact
        env:
          ARTIFACT_URL: \${{ inputs.buildArtifactUrl }}
          PLATFORM: \${{ inputs.buildPlatform }}
        run: |
          set -euo pipefail
          case "\$PLATFORM" in
            android) DEST="./build/app.apk" ;;
            ios)     DEST="./build/app.zip" ;;
            *) echo "Unsupported buildPlatform: \$PLATFORM" && exit 1 ;;
          esac
          curl --fail --silent --show-error --location --retry 3 --retry-delay 5 \\
               --output "\$DEST" "\$ARTIFACT_URL"
          ls -lh "\$DEST"

      - name: Write Maestro flow
        env:
          FLOW_B64: \${{ inputs.flowContent }}
        run: |
          set -euo pipefail
          echo "\$FLOW_B64" | base64 -d > ./.maestro/flow.yaml
          head -5 ./.maestro/flow.yaml

      - name: Run on Maestro Cloud
        uses: mobile-dev-inc/action-maestro-cloud@v1.10.0
        with:
          api-key: \${{ secrets.MAESTRO_API_KEY }}
          app-file: \${{ inputs.buildPlatform == 'android' && './build/app.apk' || './build/app.zip' }}
          workspace: ./.maestro
          name: \${{ inputs.runName }}
          env: |
            MOBIVABLE_TEST_RUN_ID=\${{ inputs.mobivableTestRunId }}
`;

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Contents API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GithubFileMeta {
  sha: string;
  content: string; // base64
}

async function getRepoFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GithubFileMeta | null> {
  const url = new URL(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
  );
  url.searchParams.set("ref", branch);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mobivable-studio",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `GitHub GET contents ${path} failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`,
    );
  }
  const body = (await res.json()) as { sha: string; content: string };
  return { sha: body.sha, content: body.content };
}

/**
 * PUT a file via the Contents API. If `sha` is provided we update; else we
 * create. Returns the new sha so callers can chain edits.
 */
async function putRepoFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "mobivable-studio",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().then((t) => t.slice(0, 400));
    // 422 with "Resource not accessible by personal access token" almost
    // always means the OAuth scope is missing `workflow` — surface it.
    const hint =
      res.status === 422 && txt.includes("workflow")
        ? " — your GitHub connection is missing the `workflow` scope. Disconnect + reconnect in the studio."
        : "";
    throw new Error(`GitHub PUT contents ${path} failed: ${res.status} ${txt}${hint}`);
  }
  const data = (await res.json()) as { content: { sha: string } };
  return { sha: data.content.sha };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers used by triggerMaestroRun in eas-testing.functions.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface RepoCoords {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Idempotently install / update the Maestro workflow file in the user's repo.
 * Compares the live content against the template byte-for-byte; only commits
 * when they differ. Returns whether a write happened (caller can show a
 * one-time banner without spamming on every Run).
 */
export async function ensureMaestroWorkflowInRepo(
  accessToken: string,
  coords: RepoCoords,
): Promise<{ updated: boolean; sha: string }> {
  const existing = await getRepoFile(
    accessToken,
    coords.owner,
    coords.repo,
    MAESTRO_WORKFLOW_PATH,
    coords.branch,
  );

  const desiredBase64 = btoa(unescape(encodeURIComponent(MAESTRO_WORKFLOW_TEMPLATE)));
  // GitHub returns the file content with newlines every 60 chars; normalize.
  const existingBase64 = existing?.content.replace(/\s+/g, "") ?? "";
  if (existing && existingBase64 === desiredBase64) {
    return { updated: false, sha: existing.sha };
  }

  const message = existing
    ? `chore(mobivable): update Maestro workflow to v${MAESTRO_WORKFLOW_VERSION}`
    : `chore(mobivable): add Maestro workflow v${MAESTRO_WORKFLOW_VERSION}`;
  const result = await putRepoFile(
    accessToken,
    coords.owner,
    coords.repo,
    MAESTRO_WORKFLOW_PATH,
    coords.branch,
    MAESTRO_WORKFLOW_TEMPLATE,
    message,
    existing?.sha,
  );
  return { updated: true, sha: result.sha };
}

/**
 * POST to GitHub's workflow_dispatch endpoint. Returns the GitHub Actions
 * run id so the studio can deep-link into the build log and store it on the
 * eas_test_runs row.
 *
 * GitHub's dispatch endpoint returns 204 with no body and DOES NOT include
 * the run id, so we list workflow runs immediately after with `event=workflow_dispatch`
 * + a created-at filter and pick the most recent matching one. Race
 * condition: if two dispatches happen in the same second we may attribute
 * the wrong runId — acceptable for first-cut; can use the GraphQL API later
 * for a tighter correlation.
 */
export async function dispatchMaestroWorkflow(
  accessToken: string,
  coords: RepoCoords,
  inputs: {
    flowContent: string; // raw YAML — encoded internally to base64
    buildArtifactUrl: string;
    buildPlatform: "ios" | "android";
    mobivableTestRunId: string;
    runName?: string;
  },
): Promise<{ githubRunId: string | null }> {
  const dispatchedAt = new Date();
  const res = await fetch(
    `https://api.github.com/repos/${coords.owner}/${coords.repo}/actions/workflows/${encodeURIComponent("maestro-cloud.yml")}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "mobivable-studio",
      },
      body: JSON.stringify({
        ref: coords.branch,
        inputs: {
          flowContent: btoa(unescape(encodeURIComponent(inputs.flowContent))),
          buildArtifactUrl: inputs.buildArtifactUrl,
          buildPlatform: inputs.buildPlatform,
          mobivableTestRunId: inputs.mobivableTestRunId,
          ...(inputs.runName ? { runName: inputs.runName } : {}),
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub dispatch failed: ${res.status} ${await res.text().then((t) => t.slice(0, 400))}`,
    );
  }

  // Best-effort: look up the run id we just created.
  // Give GitHub a moment to register the run.
  await new Promise((r) => setTimeout(r, 1500));
  const created = `>=${dispatchedAt.toISOString()}`;
  const listRes = await fetch(
    `https://api.github.com/repos/${coords.owner}/${coords.repo}/actions/workflows/${encodeURIComponent("maestro-cloud.yml")}/runs?event=workflow_dispatch&per_page=5&created=${encodeURIComponent(created)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mobivable-studio",
      },
    },
  );
  if (!listRes.ok) return { githubRunId: null };
  const list = (await listRes.json()) as {
    workflow_runs?: Array<{ id: number }>;
  };
  const runId = list.workflow_runs?.[0]?.id;
  return { githubRunId: runId ? String(runId) : null };
}

/**
 * Read-only server fn that tells the studio UI whether the workflow file is
 * already in place. Useful for the "Run Test" button enable check.
 */
export const getMaestroWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input) => z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: conn } = await supabaseAdmin
      .from("github_connections")
      .select("access_token, scopes")
      .eq("user_id", userId)
      .maybeSingle();

    if (!conn?.access_token) {
      return { ok: true as const, githubConnected: false as const };
    }
    const scopes = typeof conn.scopes === "string" ? conn.scopes : "";
    const hasWorkflowScope = scopes.split(/[,\s]+/).includes("workflow");

    const { data: app } = await supabaseAdmin
      .from("eas_apps")
      .select("github_repo_owner, github_repo_name, github_default_branch")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!app?.github_repo_owner || !app?.github_repo_name) {
      return {
        ok: true as const,
        githubConnected: true as const,
        hasWorkflowScope,
        repoLinked: false as const,
      };
    }

    let workflowPresent = false;
    if (hasWorkflowScope) {
      try {
        const file = await getRepoFile(
          conn.access_token,
          app.github_repo_owner,
          app.github_repo_name,
          MAESTRO_WORKFLOW_PATH,
          app.github_default_branch ?? "main",
        );
        workflowPresent = !!file;
      } catch {
        // non-fatal — UI will offer a retry when the user clicks Run
      }
    }

    // Is the webhook token already configured for this project? We don't
    // surface the value — just whether it exists, so the panel can show a
    // "you still need to set it" hint vs. a "you're all set" state. The
    // token itself stays read-only to the project owner via project_env_vars.
    const { data: tokRow } = await supabaseAdmin
      .from("project_env_vars")
      .select("value")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .eq("name", "MAESTRO_WEBHOOK_TOKEN")
      .maybeSingle();
    const webhookTokenConfigured =
      typeof tokRow?.value === "string" && tokRow.value.trim().length >= 16;

    return {
      ok: true as const,
      githubConnected: true as const,
      hasWorkflowScope,
      repoLinked: true as const,
      repo: {
        owner: app.github_repo_owner,
        name: app.github_repo_name,
        branch: app.github_default_branch ?? "main",
      },
      workflowPresent,
      webhookTokenConfigured,
    };
  });
