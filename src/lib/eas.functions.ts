import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  easGraphql,
  makeTarGz,
  scaffoldExpoProject,
  uploadProjectArchive,
} from "./eas.server";

function slug(s: string): string {
  return (s || "my-app")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "my-app";
}

// -------------------------------------------------------------------------
// 1. Verify EXPO_TOKEN + return the Expo account info.
// -------------------------------------------------------------------------
export const getExpoAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, errors } = await easGraphql<{
      meActor: { id: string; username?: string; firstName?: string; accounts: Array<{ id: string; name: string }> } | null;
    }>(`
      query LovableViewer {
        meActor {
          __typename
          id
          ... on User { username firstName }
          ... on Robot { firstName }
          accounts { id name }
        }
      }
    `);
    if (errors?.length) {
      return { ok: false as const, error: errors.map((e) => e.message).join("; ") };
    }
    const actor = data?.meActor;
    if (!actor) return { ok: false as const, error: "Expo token rejected (no actor returned)." };
    return {
      ok: true as const,
      id: actor.id,
      username: actor.username ?? actor.firstName ?? "expo-user",
      accounts: actor.accounts ?? [],
    };
  });

// -------------------------------------------------------------------------
// 2. Ensure an EAS app exists for this project, return its eas_app_id.
// -------------------------------------------------------------------------
async function ensureEasApp(opts: {
  supabase: any;
  userId: string;
  projectId: string;
  projectName: string;
  accountName?: string;
  accountId?: string;
}): Promise<{ ok: true; appId: string; accountName: string; slug: string } | { ok: false; error: string }> {
  // Existing record?
  const { data: existing } = await opts.supabase
    .from("eas_apps")
    .select("eas_app_id, eas_account_name, eas_slug")
    .eq("project_id", opts.projectId)
    .maybeSingle();
  if (existing?.eas_app_id) {
    return { ok: true, appId: existing.eas_app_id, accountName: existing.eas_account_name, slug: existing.eas_slug };
  }

  // Resolve account
  let accountName = opts.accountName;
  let accountId = opts.accountId;
  if (!accountName || !accountId) {
    const viewer = await easGraphql<{ meActor: { accounts: Array<{ id: string; name: string }>; username?: string } | null }>(
      `query { meActor { id ... on User { username } accounts { id name } } }`,
    );
    const acc = viewer.data?.meActor?.accounts?.[0];
    if (!acc) return { ok: false, error: "No Expo account found for this token." };
    accountName = acc.name;
    accountId = acc.id;
  }

  const projectSlug = slug(opts.projectName);
  const fullName = `@${accountName}/${projectSlug}`;

  // Try to find existing app by full name first
  const find = await easGraphql<{ app: { byFullName: { id: string; slug: string } | null } }>(
    `query Find($fullName: String!) { app { byFullName(fullName: $fullName) { id slug } } }`,
    { fullName },
  );
  let appId = find.data?.app?.byFullName?.id;
  let appSlug = find.data?.app?.byFullName?.slug;

  if (!appId) {
    // Create a new EAS app
    const created = await easGraphql<{ app: { createApp: { id: string; slug: string } } }>(
      `mutation Create($input: AppInput!) {
        app { createApp(appInput: $input) { id slug } }
      }`,
      {
        input: {
          accountId,
          projectName: projectSlug,
          privacy: "HIDDEN",
        },
      },
    );
    if (created.errors?.length) {
      return { ok: false, error: "createApp: " + created.errors.map((e) => e.message).join("; ") };
    }
    appId = created.data?.app?.createApp?.id;
    appSlug = created.data?.app?.createApp?.slug;
    if (!appId) return { ok: false, error: "createApp returned no id" };
  }

  await opts.supabase.from("eas_apps").insert({
    user_id: opts.userId,
    project_id: opts.projectId,
    eas_app_id: appId,
    eas_account_name: accountName,
    eas_slug: appSlug || projectSlug,
  });

  return { ok: true, appId, accountName, slug: appSlug || projectSlug };
}

// -------------------------------------------------------------------------
// 3. Trigger a build (Android APK by default).
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

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, prompt, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }

    const appName = project.name || "My App";
    const projectSlug = slug(appName);

    // 1. Ensure EAS app
    const app = await ensureEasApp({
      supabase,
      userId,
      projectId: data.projectId,
      projectName: appName,
    });
    if (!app.ok) return { ok: false as const, error: app.error };

    const pkgId = `app.lovable.${app.accountName.replace(/[^a-z0-9]/gi, "")}.${projectSlug.replace(/-/g, "")}`;

    // 2. Scaffold + tar.gz
    const files = scaffoldExpoProject({
      appName,
      slug: projectSlug,
      prompt: project.prompt || "",
      android: { package: pkgId },
      ios: { bundleIdentifier: pkgId },
    });
    const archive = makeTarGz(files);

    // 3. Upload archive so EAS can fetch by URL
    const up = await uploadProjectArchive(userId, data.projectId, archive);
    if ("error" in up) return { ok: false as const, error: "Upload failed: " + up.error };

    // 4. Insert pending build row
    const { data: buildRow, error: insErr } = await supabase
      .from("eas_builds")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        eas_app_id: app.appId,
        platform: data.platform,
        profile: "preview",
        status: "pending",
        archive_url: up.url,
      })
      .select("id")
      .single();
    if (insErr || !buildRow) return { ok: false as const, error: "DB insert failed: " + insErr?.message };

    // 5. GraphQL: createAndroidBuild / createIosBuild
    const job: Record<string, unknown> = {
      type: "GENERIC",
      projectArchive: { type: "URL", url: up.url },
      projectRootDirectory: ".",
      releaseChannel: "default",
      developmentClient: false,
      ...(data.platform === "android"
        ? { buildType: "APK" }
        : { buildType: "SIMULATOR" }),
    };

    const mutationName = data.platform === "android" ? "createAndroidBuild" : "createIosBuild";
    const inputType = data.platform === "android" ? "AndroidJobInput" : "IosJobInput";

    const built = await easGraphql<any>(
      `mutation Trigger($appId: ID!, $job: ${inputType}!) {
        build {
          ${mutationName}(appId: $appId, job: $job) {
            build { id status artifacts { applicationArchiveUrl } }
          }
        }
      }`,
      { appId: app.appId, job },
    );

    if (built.errors?.length) {
      const msg = built.errors.map((e) => e.message).join("; ");
      await supabase
        .from("eas_builds")
        .update({ status: "errored", error_text: msg, raw_response: built as any })
        .eq("id", buildRow.id);
      return {
        ok: false as const,
        error: msg,
        hint: msg.toLowerCase().includes("credential") || msg.toLowerCase().includes("keystore")
          ? `EAS needs Android signing credentials. Open https://expo.dev/accounts/${app.accountName}/projects/${app.slug}/credentials, click "Add Application Identifier", then "Generate new Keystore". Then click Build APK again.`
          : undefined,
        buildRowId: buildRow.id,
      };
    }

    const easBuild = built.data?.build?.[mutationName]?.build;
    const dashUrl = easBuild?.id
      ? `https://expo.dev/accounts/${app.accountName}/projects/${app.slug}/builds/${easBuild.id}`
      : null;
    await supabase
      .from("eas_builds")
      .update({
        status: (easBuild?.status || "in-queue").toLowerCase(),
        eas_build_id: easBuild?.id ?? null,
        logs_url: dashUrl,
        artifact_url: easBuild?.artifacts?.applicationArchiveUrl ?? null,
        raw_response: built as any,
      })
      .eq("id", buildRow.id);

    return {
      ok: true as const,
      buildRowId: buildRow.id,
      easBuildId: easBuild?.id,
      logsUrl: dashUrl,
      easDashboardUrl: dashUrl ?? "",
    };
  });

// -------------------------------------------------------------------------
// 4. Refresh a build's status from EAS.
// -------------------------------------------------------------------------
export const refreshEasBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ buildRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("eas_builds")
      .select("id, eas_build_id, user_id")
      .eq("id", data.buildRowId)
      .maybeSingle();
    if (!row || row.user_id !== userId) return { ok: false as const, error: "Build not found" };
    if (!row.eas_build_id) return { ok: true as const, status: "pending" };

    const res = await easGraphql<any>(
      `query B($id: ID!) {
        builds {
          byId(buildId: $id) {
            id status
            artifacts { applicationArchiveUrl buildArtifactsUrl }
            error { errorCode message }
          }
        }
      }`,
      { id: row.eas_build_id },
    );
    if (res.errors?.length) return { ok: false as const, error: res.errors.map((e) => e.message).join("; ") };
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
// 5. List builds for a project.
// -------------------------------------------------------------------------
export const listEasBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("eas_builds")
      .select("id, platform, status, artifact_url, logs_url, eas_build_id, error_text, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return { ok: true as const, builds: rows ?? [] };
  });
