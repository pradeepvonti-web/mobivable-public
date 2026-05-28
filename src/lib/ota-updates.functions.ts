/**
 * OTA / EAS Update orchestration.
 *
 * What ships in v1 (honest scope):
 *   - Configuration storage — EAS project id + Expo owner live on
 *     project_env_vars (precedent set by the monetization panel).
 *     These aren't sensitive; both are public in every built app's
 *     runtime URL. Keeping them with other env vars keeps the surface
 *     small.
 *   - Publish history — each "Publish update" click records a row in
 *     ota_publishes with the channel + message + queued status.
 *   - Instructions — `recordOtaPublish` returns a structured payload
 *     describing the `eas update --branch …` command the user runs
 *     locally. Same pattern as store-submit: scaffolding around the
 *     pipeline, with actual execution deferred to a follow-up worker
 *     that decrypts the user's EAS access token and shells `eas update`.
 *
 * What ships v2:
 *   - submit-runner worker that performs the actual `eas update`
 *     invocation, polls EAS for the resulting update_group_id, and
 *     writes status back to the row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNEL_RE = /^[a-z][a-z0-9_-]{0,40}$/;
/** Reserved env-var names where we stash the EAS config. */
const EAS_PROJECT_ID_KEY = "EAS_PROJECT_ID";
const EAS_OWNER_KEY = "EAS_OWNER";
const EAS_UPDATE_URL_KEY = "EAS_UPDATE_URL";

export interface OtaPublishRow {
  id: string;
  channel: string;
  message: string | null;
  status: "queued" | "in_progress" | "succeeded" | "failed" | "cancelled";
  error_text: string | null;
  expo_update_group_id: string | null;
  runtime_version: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface OtaConfig {
  /** UUID Expo assigns to the EAS project (matches the value in
   *  app.json's `extra.eas.projectId`). */
  easProjectId: string;
  /** Expo username — fills `owner` in app.json so update channels
   *  resolve to the right account. */
  owner: string;
  /** Composed Update URL the studio writes into the expo-updates
   *  plugin. EAS expects `https://u.expo.dev/<projectId>`. */
  updateUrl: string;
}

export interface OtaPublishInstructions {
  summary: string;
  steps: string[];
  /** The exact CLI command the user runs to actually publish. */
  command: string;
}

export const getOtaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: envRows } = await supabase
      .from("project_env_vars")
      .select("name, value")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .in("name", [EAS_PROJECT_ID_KEY, EAS_OWNER_KEY, EAS_UPDATE_URL_KEY]);

    const envMap: Record<string, string> = {};
    for (const row of envRows ?? []) {
      if (row?.name && typeof row.value === "string") envMap[row.name] = row.value.trim();
    }

    const easProjectId = envMap[EAS_PROJECT_ID_KEY] ?? "";
    const owner = envMap[EAS_OWNER_KEY] ?? "";
    const config: OtaConfig | null = easProjectId
      ? {
          easProjectId,
          owner,
          updateUrl: envMap[EAS_UPDATE_URL_KEY] || `https://u.expo.dev/${easProjectId}`,
        }
      : null;

    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: rows } = (await adm
      .from("ota_publishes")
      .select(
        "id, channel, message, status, error_text, expo_update_group_id, runtime_version, created_at, updated_at, finished_at",
      )
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)) as { data: OtaPublishRow[] | null };

    return {
      ok: true as const,
      config,
      publishes: rows ?? [],
    };
  });

export const upsertOtaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        easProjectId: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            "EAS project id must be a UUID — copy it from `eas init` output or the Expo dashboard.",
          ),
        owner: z.string().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Upsert each env var by (project_id, name) — composite unique
    // already exists on project_env_vars from the monetization flow.
    const entries = [
      { name: EAS_PROJECT_ID_KEY, value: data.easProjectId },
      { name: EAS_OWNER_KEY, value: data.owner },
      { name: EAS_UPDATE_URL_KEY, value: `https://u.expo.dev/${data.easProjectId}` },
    ];
    for (const entry of entries) {
      const { error } = await supabase.from("project_env_vars").upsert(
        {
          project_id: data.projectId,
          user_id: userId,
          name: entry.name,
          value: entry.value,
          visible: true,
        },
        { onConflict: "project_id,name" },
      );
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

export const recordOtaPublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        channel: z
          .string()
          .regex(CHANNEL_RE, "Channel must be lowercase, alphanumeric, dashes/underscores; max 40 chars."),
        message: z.string().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify configuration is in place — there's no value recording an
    // intent to publish if the project doesn't yet have an EAS project
    // id to publish to.
    const { data: envRows } = await supabase
      .from("project_env_vars")
      .select("name, value")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .in("name", [EAS_PROJECT_ID_KEY, EAS_OWNER_KEY]);
    const envMap: Record<string, string> = {};
    for (const row of envRows ?? []) {
      if (row?.name && typeof row.value === "string") envMap[row.name] = row.value.trim();
    }
    const easProjectId = envMap[EAS_PROJECT_ID_KEY];
    const owner = envMap[EAS_OWNER_KEY];
    if (!easProjectId || !owner) {
      return {
        ok: false as const,
        error: "Set the EAS project id + owner on this project first (top of the OTA panel).",
      };
    }

    // Verify the project belongs to the user before we cross-tenant
    // anything via admin client.
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }

    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: row, error } = (await adm
      .from("ota_publishes")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        channel: data.channel,
        message: data.message ?? null,
        status: "queued",
      })
      .select(
        "id, channel, message, status, error_text, expo_update_group_id, runtime_version, created_at, updated_at, finished_at",
      )
      .single()) as {
      data: OtaPublishRow | null;
      error: { message: string } | null;
    };
    if (error || !row) {
      return { ok: false as const, error: error?.message ?? "Failed to record publish." };
    }

    const messageArg = data.message
      ? ` --message ${JSON.stringify(data.message)}`
      : "";
    const command = `eas update --branch ${data.channel}${messageArg}`;

    const instructions: OtaPublishInstructions = {
      summary:
        "Recorded the publish intent. Until the in-studio publish worker ships, run the CLI command below from a clone of your exported Expo project:",
      steps: [
        "Run `npx expo-cli install` once to pin matching engine versions.",
        `Inside the project: \`${command}\``,
        `EAS bundles your latest JS + assets and pushes them to channel \`${data.channel}\`. Apps with the matching runtimeVersion will pick it up on next launch — no store review.`,
        `Watch the publish at https://expo.dev/accounts/${encodeURIComponent(owner)}/projects/${encodeURIComponent(easProjectId)}/updates`,
      ],
      command,
    };

    return { ok: true as const, publish: row, instructions };
  });
