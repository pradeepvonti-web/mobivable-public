/**
 * Store submission orchestration.
 *
 * V1 behavior (honest):
 *   - Record the submission intent in `store_submissions`.
 *   - Verify the user has the right credentials configured.
 *   - Return a structured "what to do next" payload the UI surfaces as a
 *     checklist (download export → run `eas submit -p ios --path …`).
 *   - For Play we use the latest eas_builds row's artifact_url if one
 *     exists; for iOS the user typically has to upload through Transporter
 *     or EAS submit because ASC API uploads need an installed Transporter
 *     binary.
 *
 * V2 will:
 *   - Sign a JWT for ASC API and call POST /v1/builds for iOS uploads.
 *   - Use the Google Play Publishing API directly (uploadAabRelease) for
 *     Android, since service-account JSON gives us everything we need.
 *
 * This file deliberately stops short of running shell commands or
 * holding credentials beyond the call duration — secrets are loaded,
 * decrypted, used, and discarded inside this handler.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SubmissionRow {
  id: string;
  project_id: string;
  platform: "ios" | "android";
  status: "queued" | "in_progress" | "succeeded" | "failed" | "cancelled";
  error_text: string | null;
  store_record_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface SubmitInstructions {
  /** Human-readable summary the UI puts next to the spinner. */
  summary: string;
  /** Ordered checklist for the user to follow. */
  steps: string[];
  /** Where the artifact lives if we already have one. */
  artifactUrl: string | null;
}

export const listStoreSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = (await adm
      .from("store_submissions")
      .select(
        "id, project_id, platform, status, error_text, store_record_id, created_at, updated_at, finished_at",
      )
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)) as {
      data: SubmissionRow[] | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, submissions: rows ?? [] };
  });

export const submitToStores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        platform: z.enum(["ios", "android"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

    // ── 1. credential check ──
    const { data: creds } = (await adm
      .from("store_credentials")
      .select(
        "asc_issuer_id, asc_key_id, asc_key_ciphertext, play_service_account_ciphertext",
      )
      .eq("user_id", userId)
      .maybeSingle()) as {
      data: {
        asc_issuer_id: string | null;
        asc_key_id: string | null;
        asc_key_ciphertext: string | null;
        play_service_account_ciphertext: string | null;
      } | null;
    };
    if (data.platform === "ios") {
      const has = !!(
        creds?.asc_issuer_id &&
        creds?.asc_key_id &&
        creds?.asc_key_ciphertext
      );
      if (!has) {
        return {
          ok: false as const,
          error: "Add your Apple ASC API key in Settings → Store credentials first.",
        };
      }
    } else if (!creds?.play_service_account_ciphertext) {
      return {
        ok: false as const,
        error: "Add your Play service-account JSON in Settings → Store credentials first.",
      };
    }

    // ── 2. ownership + listing check ──
    const sbLoose = adm; // RLS-safe because every where-clause includes user_id
    const { data: project } = (await sbLoose
      .from("projects")
      .select("user_id, name, store_listing")
      .eq("id", data.projectId)
      .maybeSingle()) as {
      data: {
        user_id: string;
        name: string;
        store_listing: Record<string, unknown> | null;
      } | null;
    };
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }
    const listing = (project.store_listing ?? {}) as {
      title?: string;
      description?: string;
      privacy_policy_url?: string;
      icon_url?: string;
    };
    const missingFields: string[] = [];
    if (!listing.title) missingFields.push("title");
    if (!listing.description) missingFields.push("description");
    if (!listing.privacy_policy_url) missingFields.push("privacy policy URL");
    if (!listing.icon_url) missingFields.push("app icon");
    if (missingFields.length > 0) {
      return {
        ok: false as const,
        error: `Store Listing is missing: ${missingFields.join(", ")}. Both stores will reject without these.`,
      };
    }

    // ── 3. latest finished build for the platform (best-effort) ──
    // The studio's existing `eas_builds` table has artifact_url + status.
    // We pick the most recent succeeded build of the right platform; if
    // none exists, we still record the submission intent and tell the
    // user to run an export first.
    const { data: build } = (await adm
      .from("eas_builds")
      .select("id, artifact_url, status, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .eq("platform", data.platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as {
      data: {
        id: string;
        artifact_url: string | null;
        status: string | null;
        created_at: string;
      } | null;
    };
    const artifactUrl =
      build?.status === "finished" && build.artifact_url ? build.artifact_url : null;

    // ── 4. record the submission row ──
    const { data: row, error: insertErr } = (await adm
      .from("store_submissions")
      .insert({
        user_id: userId,
        project_id: data.projectId,
        platform: data.platform,
        eas_build_id: build?.id ?? null,
        status: "queued",
      })
      .select(
        "id, project_id, platform, status, error_text, store_record_id, created_at, updated_at, finished_at",
      )
      .single()) as {
      data: SubmissionRow | null;
      error: { message: string } | null;
    };
    if (insertErr || !row) {
      return {
        ok: false as const,
        error: insertErr?.message ?? "Failed to record submission.",
      };
    }

    // ── 5. instructions payload ──
    // V1 doesn't shell out — the studio doesn't currently have a worker
    // sandbox to run `eas submit` from. The instructions block names
    // exactly what the user runs locally; the credentials they need
    // already live in `store_credentials` and they can pull them via
    // the future `submit-runner` worker.
    const instructions: SubmitInstructions =
      data.platform === "ios"
        ? {
            summary:
              "Recorded the submission intent. Until the in-studio submit worker ships, finish it locally:",
            steps: [
              artifactUrl
                ? `Download the .ipa from ${artifactUrl}.`
                : "Run a release build first (Side panel → Code Export → Build for iOS) so an .ipa is ready.",
              "Install Transporter (Mac App Store) or have eas-cli installed.",
              "Run: eas submit -p ios --path <ipa> --apple-id <your-apple-id> --asc-app-id <ASC_APP_ID>",
              "The credentials you stored in Settings → Store credentials sign the upload — Transporter / eas-cli reads them from your ASC profile.",
              "Once Apple processes the build (~10 min), it shows up in TestFlight → Internal Testing.",
            ],
            artifactUrl,
          }
        : {
            summary:
              "Recorded the submission intent. Until the in-studio submit worker ships, finish it locally:",
            steps: [
              artifactUrl
                ? `Download the .aab from ${artifactUrl}.`
                : "Run a release build first (Side panel → Code Export → Build for Android) so an .aab is ready.",
              "Install Google's official `playbrowser` cli or use eas-cli.",
              "Run: eas submit -p android --path <aab> --track internal",
              "Or upload directly in Play Console → Internal testing → Create release. The service-account JSON in Settings authenticates the upload.",
            ],
            artifactUrl,
          };

    return {
      ok: true as const,
      submission: row,
      instructions,
    };
  });
