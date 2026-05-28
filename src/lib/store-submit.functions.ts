/**
 * Store submission orchestration.
 *
 * Android (Play Internal Track):
 *   - We have the full direct path: service-account JSON → JWT → OAuth →
 *     edits API → upload .aab → assign to internal → commit. Runs
 *     synchronously inside `submitToStores` so the user gets a single
 *     succeeded/failed response with a real versionCode.
 *
 * iOS (TestFlight):
 *   - Still scaffolding. The ASC API v1 /builds upload requires the
 *     Transporter binary or `altool` for the actual chunked upload;
 *     pure-API upload exists but is poorly documented and requires
 *     Apple's CDN handshake. We surface instructions until a Node
 *     side-worker ships that wraps `xcrun altool --upload-app`.
 *
 * Credentials are loaded, decrypted via APP_SECRET_ENCRYPTION_KEY, used
 * inside this handler, and discarded — never returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptAtRest } from "./at-rest-crypto.server";
import { uploadAabToInternal } from "./play-store-client.server";

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

    // ── 5. live execution path ──
    // Android has a clean HTTP-only path via the Play Publishing API.
    // We run it synchronously here — uploads take ~10–30 s for typical
    // .aab sizes; users see a spinner and a final status in one click.
    // iOS still requires Transporter / altool for the actual chunked
    // upload, so for now we surface instructions instead.
    if (data.platform === "android") {
      // The Play API needs the applicationId (Android package name) —
      // we look it up from project_env_vars under ANDROID_PACKAGE_NAME.
      // Without it, surface a clear error and let the user set it once.
      // Reading via the admin client (project ownership already checked
      // above) keeps the path consistent with the rest of this handler.
      const { data: pkgRow } = (await adm
        .from("project_env_vars")
        .select("value")
        .eq("project_id", data.projectId)
        .eq("user_id", userId)
        .eq("name", "ANDROID_PACKAGE_NAME")
        .maybeSingle()) as { data: { value: string | null } | null };
      const packageName =
        typeof pkgRow?.value === "string" ? pkgRow.value.trim() : "";

      if (!packageName) {
        await markFailed(
          row.id,
          "Set ANDROID_PACKAGE_NAME in this project's AI & Env Keys (e.g. com.acme.lemonade). Play uses it as the package identifier.",
        );
        return {
          ok: false as const,
          error:
            "Add an `ANDROID_PACKAGE_NAME` env key on this project first (Settings → AI & Env Keys, e.g. com.acme.lemonade).",
        };
      }
      if (!artifactUrl) {
        await markFailed(
          row.id,
          "No finished Android build with an artifact_url. Run an EAS release build first.",
        );
        return {
          ok: false as const,
          error:
            "No finished Android build yet. Run an EAS Android release build first so a .aab artifact exists.",
        };
      }
      if (!creds?.play_service_account_ciphertext) {
        // Defense in depth — credential check already guarded above.
        await markFailed(row.id, "Play credentials missing at execution time.");
        return { ok: false as const, error: "Play credentials missing." };
      }

      // Flip to in_progress so the UI shows a live spinner on refresh.
      await adm
        .from("store_submissions")
        .update({ status: "in_progress" })
        .eq("id", row.id)
        .eq("user_id", userId);

      try {
        const serviceAccountJson = await decryptAtRest(
          creds.play_service_account_ciphertext,
        );
        const result = await uploadAabToInternal({
          serviceAccountJson,
          packageName,
          aabUrl: artifactUrl,
        });
        const finishedAt = new Date().toISOString();
        const storeRecordId = `versionCode:${result.versionCode}/${result.trackStatus}`;
        const { data: finalRow } = (await adm
          .from("store_submissions")
          .update({
            status: "succeeded",
            store_record_id: storeRecordId,
            finished_at: finishedAt,
          })
          .eq("id", row.id)
          .eq("user_id", userId)
          .select(
            "id, project_id, platform, status, error_text, store_record_id, created_at, updated_at, finished_at",
          )
          .single()) as { data: SubmissionRow | null };
        return {
          ok: true as const,
          submission: finalRow ?? row,
          instructions: {
            summary:
              `Uploaded version ${result.versionCode} to the Play Internal track (status: ${result.trackStatus}).`,
            steps: [
              "Open Play Console → Internal testing → Releases and review the draft.",
              "Add your tester emails on Internal testing → Testers.",
              "Click Roll out when you're ready to push to your testers' devices.",
            ],
            artifactUrl,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await markFailed(row.id, message);
        return {
          ok: false as const,
          error: `Play upload failed: ${message}`,
        };
      }
    }

    // ── iOS scaffolding path (unchanged) ──
    // Until a Node side-worker wraps `xcrun altool --upload-app`, the
    // ASC API v1 build upload requires Transporter-style chunked upload
    // which Cloudflare Workers can't perform cleanly. Surface the exact
    // CLI commands the user runs locally; their credentials in
    // store_credentials are used by Transporter / eas-cli once installed.
    const instructions: SubmitInstructions = {
      summary:
        "Recorded the iOS submission intent. The in-studio runner doesn't ship iOS uploads yet — finish it locally:",
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
    };

    return {
      ok: true as const,
      submission: row,
      instructions,
    };

    async function markFailed(rowId: string, errorText: string): Promise<void> {
      await adm
        .from("store_submissions")
        .update({
          status: "failed",
          error_text: errorText,
          finished_at: new Date().toISOString(),
        })
        .eq("id", rowId)
        .eq("user_id", userId);
    }
  });
