import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { easGraphql, scaffoldExpoProject } from "./eas.server";

const EXPO_GITHUB_APP_INSTALL_URL = "https://github.com/apps/expo/installations/new";

function slug(s: string): string {
  return (s || "my-app")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "my-app";
}

// -------------------------------------------------------------------------
// Account / connection status
// -------------------------------------------------------------------------
export const getExpoAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, errors } = await easGraphql<{
      meActor: {
        id: string;
        username?: string;
        firstName?: string;
        accounts: Array<{ id: string; name: string }>;
      } | null;
    }>(`
      query LovableViewer {
        meActor {
          __typename id
          ... on User { username firstName }
          ... on Robot { firstName }
          accounts { id name }
        }
      }
    `);
    if (errors?.length) return { ok: false as const, error: errors.map((e) => e.message).join("; ") };
    const actor = data?.meActor;
    if (!actor) return { ok: false as const, error: "Expo token rejected." };
    return {
      ok: true as const,
      id: actor.id,
      username: actor.username ?? actor.firstName ?? "expo-user",
      accounts: actor.accounts ?? [],
    };
  });

// -------------------------------------------------------------------------
// Internal: ensure EAS app exists, return ids
// -------------------------------------------------------------------------
async function ensureEasApp(opts: {
  supabase: any;
  userId: string;
  projectId: string;
  projectName: string;
}): Promise<
  | { ok: true; rowId: string; appId: string; accountName: string; accountId: string; slug: string }
  | { ok: false; error: string }
> {
  const projectSlug = slug(opts.projectName);

  const { data: existing } = await opts.supabase
    .from("eas_apps")
    .select("id, eas_app_id, eas_account_name, eas_slug")
    .eq("project_id", opts.projectId)
    .maybeSingle();

  // Resolve account (need accountId regardless)
  const viewer = await easGraphql<{
    meActor: { accounts: Array<{ id: string; name: string }> } | null;
  }>(`query { meActor { ... on User { accounts { id name } } ... on Robot { accounts { id name } } } }`);
  const acc = viewer.data?.meActor?.accounts?.[0];
  if (!acc) return { ok: false, error: "No Expo account on this token." };

  if (existing?.eas_app_id) {
    return {
      ok: true,
      rowId: existing.id,
      appId: existing.eas_app_id,
      accountName: existing.eas_account_name,
      accountId: acc.id,
      slug: existing.eas_slug,
    };
  }

  const fullName = `@${acc.name}/${projectSlug}`;
  const find = await easGraphql<{ app: { byFullName: { id: string; slug: string } | null } }>(
    `query Find($fullName: String!) { app { byFullName(fullName: $fullName) { id slug } } }`,
    { fullName },
  );
  let appId = find.data?.app?.byFullName?.id;
  let appSlug = find.data?.app?.byFullName?.slug;

  if (!appId) {
    const created = await easGraphql<{ app: { createApp: { id: string; slug: string } } }>(
      `mutation Create($input: AppInput!) {
        app { createApp(appInput: $input) { id slug } }
      }`,
      { input: { accountId: acc.id, projectName: projectSlug, privacy: "HIDDEN" } },
    );
    if (created.errors?.length)
      return { ok: false, error: "createApp: " + created.errors.map((e) => e.message).join("; ") };
    appId = created.data?.app?.createApp?.id!;
    appSlug = created.data?.app?.createApp?.slug ?? projectSlug;
  }

  const { data: inserted } = await opts.supabase
    .from("eas_apps")
    .insert({
      user_id: opts.userId,
      project_id: opts.projectId,
      eas_app_id: appId,
      eas_account_name: acc.name,
      eas_slug: appSlug || projectSlug,
    })
    .select("id")
    .single();

  return {
    ok: true,
    rowId: inserted!.id,
    appId: appId!,
    accountName: acc.name,
    accountId: acc.id,
    slug: appSlug || projectSlug,
  };
}

// -------------------------------------------------------------------------
// Push Expo scaffold to GitHub (creates repo if missing, commits scaffold)
// -------------------------------------------------------------------------
export const pushExpoScaffoldToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, prompt, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) return { ok: false as const, error: "Project not found." };

    const { data: conn } = await supabaseAdmin
      .from("github_connections")
      .select("access_token, github_username")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn?.access_token) return { ok: false as const, error: "Connect GitHub first (Settings → GitHub)." };

    const app = await ensureEasApp({
      supabase,
      userId,
      projectId: data.projectId,
      projectName: project.name,
    });
    if (!app.ok) return { ok: false as const, error: app.error };

    const repoName = `lovable-${app.slug}`;
    const ghHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${conn.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "easy-mobile-ai",
    };

    // Create or fetch repo
    let repoOwner = conn.github_username;
    let repoFullName = `${repoOwner}/${repoName}`;
    let defaultBranch = "main";
    let repoNodeId: string | null = null;
    let repoDbId: string | null = null;

    const getRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers: ghHeaders });
    if (getRes.ok) {
      const r = (await getRes.json()) as any;
      defaultBranch = r.default_branch;
      repoNodeId = r.node_id;
      repoDbId = String(r.id);
    } else {
      const createRes = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: ghHeaders,
        body: JSON.stringify({
          name: repoName,
          description: `Expo app generated by Lovable — ${project.name}`,
          private: true,
          auto_init: true,
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text();
        return {
          ok: false as const,
          error: `GitHub create repo failed (${createRes.status}): ${txt.slice(0, 300)}`,
        };
      }
      const r = (await createRes.json()) as any;
      defaultBranch = r.default_branch;
      repoNodeId = r.node_id;
      repoDbId = String(r.id);
    }

    // Build scaffold and a workflow file
    const pkgId = `app.lovable.${repoOwner.replace(/[^a-z0-9]/gi, "")}.${app.slug.replace(/-/g, "")}`;
    const files = scaffoldExpoProject({
      appName: project.name || "My App",
      slug: app.slug,
      prompt: project.prompt || "",
      android: { package: pkgId },
      ios: { bundleIdentifier: pkgId },
    });

    // Use Git Data API to put all files in a single commit
    // 1. Get current ref
    const refRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      { headers: ghHeaders },
    );
    if (!refRes.ok) {
      return { ok: false as const, error: `GitHub ref read failed (${refRes.status}).` };
    }
    const refData = (await refRes.json()) as any;
    const baseSha = refData.object.sha;
    const commitRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits/${baseSha}`,
      { headers: ghHeaders },
    );
    const baseCommit = (await commitRes.json()) as any;
    const baseTreeSha = baseCommit.tree.sha;

    // 2. Create blobs for each file (base64 for binary safety)
    const blobs: Array<{ path: string; sha: string }> = [];
    for (const f of files) {
      // base64 encode bytes
      let bin = "";
      for (let i = 0; i < f.data.length; i++) bin += String.fromCharCode(f.data[i]);
      const b64 = btoa(bin);
      const blobRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/blobs`, {
        method: "POST",
        headers: ghHeaders,
        body: JSON.stringify({ content: b64, encoding: "base64" }),
      });
      if (!blobRes.ok) {
        const txt = await blobRes.text();
        return { ok: false as const, error: `Blob ${f.path} failed: ${txt.slice(0, 200)}` };
      }
      const blob = (await blobRes.json()) as any;
      blobs.push({ path: f.path, sha: blob.sha });
    }

    // 3. Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/trees`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      }),
    });
    if (!treeRes.ok) {
      const txt = await treeRes.text();
      return { ok: false as const, error: `Tree create failed: ${txt.slice(0, 200)}` };
    }
    const tree = (await treeRes.json()) as any;

    // 4. Create commit
    const newCommitRes = await fetch(`https://api.github.com/repos/${repoFullName}/git/commits`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        message: "Sync Expo scaffold from Lovable",
        tree: tree.sha,
        parents: [baseSha],
      }),
    });
    const newCommit = (await newCommitRes.json()) as any;

    // 5. Update ref
    const upRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      {
        method: "PATCH",
        headers: ghHeaders,
        body: JSON.stringify({ sha: newCommit.sha, force: true }),
      },
    );
    if (!upRes.ok) {
      const txt = await upRes.text();
      return { ok: false as const, error: `Ref update failed: ${txt.slice(0, 200)}` };
    }

    // Persist repo info on eas_apps
    await supabase
      .from("eas_apps")
      .update({
        github_repo_owner: repoOwner,
        github_repo_name: repoName,
        github_default_branch: defaultBranch,
        github_repo_node_id: repoNodeId,
        github_repo_db_id: repoDbId,
      })
      .eq("id", app.rowId);

    return {
      ok: true as const,
      repoUrl: `https://github.com/${repoFullName}`,
      branch: defaultBranch,
      commitSha: newCommit.sha,
    };
  });

// -------------------------------------------------------------------------
// Trigger GitHub build on EAS
// -------------------------------------------------------------------------
export const startEasBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        platform: z.enum(["android", "ios"]).default("android"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: appRow } = await supabase
      .from("eas_apps")
      .select(
        "id, eas_app_id, eas_account_name, eas_slug, github_repo_owner, github_repo_name, github_default_branch, github_repo_node_id, github_repo_db_id, eas_github_repo_id",
      )
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!appRow?.github_repo_owner || !appRow.github_repo_name) {
      return {
        ok: false as const,
        error: "Push the Expo scaffold to GitHub first.",
        needsPush: true,
      };
    }

    // 1. Find an Expo GitHub App installation that matches this repo's GitHub account
    const accQ = await easGraphql<{
      account: {
        byName: {
          id: string;
          githubAppInstallations: Array<{
            id: string;
            installationIdentifier: number;
            metadata: {
              installationStatus: string;
              githubAccountName?: string | null;
            };
          }>;
        };
      };
    }>(
      `query Acc($name: String!) {
        account { byName(accountName: $name) {
          id
          githubAppInstallations {
            id installationIdentifier
            metadata { installationStatus githubAccountName }
          }
        } }
      }`,
      { name: appRow.eas_account_name },
    );

    if (accQ.errors?.length) {
      return { ok: false as const, error: accQ.errors.map((e) => e.message).join("; ") };
    }

    const installations = accQ.data?.account?.byName?.githubAppInstallations ?? [];
    const match = installations.find(
      (i) =>
        i.metadata.installationStatus === "ACTIVE" &&
        (i.metadata.githubAccountName?.toLowerCase() === appRow.github_repo_owner?.toLowerCase()),
    );

    if (!match) {
      return {
        ok: false as const,
        error: "Expo GitHub App is not installed on your GitHub account yet.",
        needsAppInstall: true,
        installUrl: EXPO_GITHUB_APP_INSTALL_URL,
      };
    }

    // 2. Link repo to EAS app if not already linked
    let easRepoId = appRow.eas_github_repo_id;
    if (!easRepoId) {
      const linkRes = await easGraphql<{
        githubRepository: { createGitHubRepository: { id: string } };
      }>(
        `mutation Link($input: CreateGitHubRepositoryInput!) {
          githubRepository { createGitHubRepository(githubRepositoryData: $input) { id } }
        }`,
        {
          input: {
            appId: appRow.eas_app_id,
            githubAppInstallationId: match.id,
            githubRepositoryIdentifier: Number(appRow.github_repo_db_id),
            nodeIdentifier: appRow.github_repo_node_id,
          },
        },
      );
      if (linkRes.errors?.length) {
        const msg = linkRes.errors.map((e) => e.message).join("; ");
        if (/already/i.test(msg)) {
          // already linked, that's fine
        } else {
          return { ok: false as const, error: "Link repo: " + msg };
        }
      }
      easRepoId = linkRes.data?.githubRepository?.createGitHubRepository?.id ?? null;
      if (easRepoId) {
        await supabase.from("eas_apps").update({ eas_github_repo_id: easRepoId }).eq("id", appRow.id);
      }
    }

    // 3. Insert pending build row
    const gitRef = appRow.github_default_branch || "main";
    const { data: buildRow, error: insErr } = await supabase
      .from("eas_builds")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        eas_app_id: appRow.eas_app_id,
        platform: data.platform,
        profile: "preview",
        status: "pending",
        git_ref: gitRef,
      })
      .select("id")
      .single();
    if (insErr || !buildRow) return { ok: false as const, error: "DB insert: " + insErr?.message };

    // 4. Trigger the GitHub build
    const built = await easGraphql<{
      githubApp: { createGitHubBuild: { id: string } };
    }>(
      `mutation Build($input: GitHubBuildInput!) {
        githubApp { createGitHubBuild(buildInput: $input) { id } }
      }`,
      {
        input: {
          appId: appRow.eas_app_id,
          buildProfile: "preview",
          gitRef,
          platform: data.platform === "android" ? "ANDROID" : "IOS",
        },
      },
    );

    if (built.errors?.length) {
      const msg = built.errors.map((e) => e.message).join("; ");
      await supabase
        .from("eas_builds")
        .update({ status: "errored", error_text: msg, raw_response: built as any })
        .eq("id", buildRow.id);
      return { ok: false as const, error: msg, buildRowId: buildRow.id };
    }

    const receiptId = built.data?.githubApp?.createGitHubBuild?.id;
    const dashUrl = `https://expo.dev/accounts/${appRow.eas_account_name}/projects/${appRow.eas_slug}/builds`;
    await supabase
      .from("eas_builds")
      .update({
        status: "in-queue",
        receipt_id: receiptId ?? null,
        logs_url: dashUrl,
        raw_response: built as any,
      })
      .eq("id", buildRow.id);

    return {
      ok: true as const,
      buildRowId: buildRow.id,
      receiptId,
      logsUrl: dashUrl,
    };
  });

// -------------------------------------------------------------------------
// Refresh status — resolves receipt → real build, then polls build
// -------------------------------------------------------------------------
export const refreshEasBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ buildRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("eas_builds")
      .select("id, eas_build_id, receipt_id, user_id")
      .eq("id", data.buildRowId)
      .maybeSingle();
    if (!row || row.user_id !== userId) return { ok: false as const, error: "Build not found" };

    // Resolve receipt → build id if needed
    let buildId = row.eas_build_id;
    if (!buildId && row.receipt_id) {
      const rec = await easGraphql<{
        backgroundJobReceipt: {
          byId: { state: string; resultId?: string | null; errorMessage?: string | null };
        };
      }>(
        `query R($id: ID!) {
          backgroundJobReceipt { byId(id: $id) { state resultId errorMessage } }
        }`,
        { id: row.receipt_id },
      );
      const r = rec.data?.backgroundJobReceipt?.byId;
      if (r?.resultId) {
        buildId = r.resultId;
        await supabase.from("eas_builds").update({ eas_build_id: buildId }).eq("id", row.id);
      } else if (r?.errorMessage) {
        await supabase
          .from("eas_builds")
          .update({ status: "errored", error_text: r.errorMessage })
          .eq("id", row.id);
        return { ok: false as const, error: r.errorMessage };
      } else {
        return { ok: true as const, status: "pending" };
      }
    }
    if (!buildId) return { ok: true as const, status: "pending" };

    const res = await easGraphql<any>(
      `query B($id: ID!) {
        builds { byId(buildId: $id) {
          id status
          artifacts { applicationArchiveUrl buildArtifactsUrl }
          error { errorCode message }
        } }
      }`,
      { id: buildId },
    );
    if (res.errors?.length) return { ok: false as const, error: res.errors.map((e: any) => e.message).join("; ") };
    const b = res.data?.builds?.byId;
    if (!b) return { ok: false as const, error: "EAS returned no build" };

    await supabase
      .from("eas_builds")
      .update({
        status: (b.status || "unknown").toLowerCase(),
        artifact_url: b.artifacts?.applicationArchiveUrl ?? null,
        error_text: b.error?.message ?? null,
      })
      .eq("id", row.id);

    return {
      ok: true as const,
      status: (b.status || "unknown").toLowerCase(),
      artifactUrl: b.artifacts?.applicationArchiveUrl ?? null,
      error: b.error?.message ?? null,
    };
  });

// -------------------------------------------------------------------------
// List builds
// -------------------------------------------------------------------------
export const listEasBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("eas_builds")
      .select("id, platform, status, artifact_url, logs_url, eas_build_id, error_text, created_at, git_ref")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return { ok: true as const, builds: rows ?? [] };
  });

// -------------------------------------------------------------------------
// Get GitHub linkage status for a project (drives the 3-step UI)
// -------------------------------------------------------------------------
export const getGithubBuildStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gh } = await supabaseAdmin
      .from("github_connections")
      .select("github_username")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: app } = await supabase
      .from("eas_apps")
      .select("github_repo_owner, github_repo_name, github_default_branch, eas_github_repo_id")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();

    const githubConnected = !!gh?.github_username;
    const repoPushed = !!(app?.github_repo_owner && app?.github_repo_name);
    const repoUrl = repoPushed
      ? `https://github.com/${app!.github_repo_owner}/${app!.github_repo_name}`
      : null;

    return {
      ok: true as const,
      githubConnected,
      githubUsername: gh?.github_username ?? null,
      repoPushed,
      repoUrl,
      branch: app?.github_default_branch ?? "main",
      expoAppInstallUrl: EXPO_GITHUB_APP_INSTALL_URL,
    };
  });
