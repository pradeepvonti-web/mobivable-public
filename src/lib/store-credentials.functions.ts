/**
 * Store credentials — Apple ASC API key (.p8 + issuer/key id) and
 * Play Console service-account JSON, encrypted at rest.
 *
 * Read path returns only safe metadata (key id, last 4 of the issuer
 * id, "has_play_service_account" boolean). Plaintext blobs only flow
 * outward at submit time (server fn → eas submit), never back into the
 * browser.
 *
 * Upsert path is whole-row replace: each credential block is
 * optionally clearable by passing an empty string in its field.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptAtRest, tail4 } from "./at-rest-crypto.server";

export interface CredentialStatus {
  hasAscKey: boolean;
  ascIssuerIdTail: string;
  ascKeyId: string;
  hasPlayServiceAccount: boolean;
  updatedAt: string | null;
}

interface RawRow {
  asc_issuer_id: string | null;
  asc_key_id: string | null;
  asc_key_ciphertext: string | null;
  play_service_account_ciphertext: string | null;
  updated_at: string | null;
}

export const getStoreCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data, error } = (await adm
      .from("store_credentials")
      .select(
        "asc_issuer_id, asc_key_id, asc_key_ciphertext, play_service_account_ciphertext, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle()) as {
      data: RawRow | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    const row = data;
    const status: CredentialStatus = {
      hasAscKey: !!(row?.asc_key_ciphertext && row.asc_key_id && row.asc_issuer_id),
      ascIssuerIdTail: tail4(row?.asc_issuer_id ?? ""),
      ascKeyId: row?.asc_key_id ?? "",
      hasPlayServiceAccount: !!row?.play_service_account_ciphertext,
      updatedAt: row?.updated_at ?? null,
    };
    return { ok: true as const, status };
  });

export const upsertStoreCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        // Apple block — all three required together, or all three blank
        // to clear. We enforce that pairing below.
        ascIssuerId: z.string().max(80).optional(),
        ascKeyId: z.string().max(20).optional(),
        ascP8Pem: z.string().max(8_000).optional(),
        // Google block — single field. Pass empty string to clear.
        playServiceAccountJson: z.string().max(20_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

    const patch: Record<string, string | null> = {};

    // Apple ASC — atomic: either all three set, or all cleared, never
    // partial. Cuts off footguns where a stale ascKeyId points at a
    // missing .p8.
    if (
      data.ascIssuerId !== undefined ||
      data.ascKeyId !== undefined ||
      data.ascP8Pem !== undefined
    ) {
      const allSet =
        !!data.ascIssuerId?.trim() &&
        !!data.ascKeyId?.trim() &&
        !!data.ascP8Pem?.trim();
      const allCleared =
        (data.ascIssuerId ?? "") === "" &&
        (data.ascKeyId ?? "") === "" &&
        (data.ascP8Pem ?? "") === "";
      if (!allSet && !allCleared) {
        return {
          ok: false as const,
          error: "Apple credentials must be set together (issuer id + key id + .p8) or cleared together.",
        };
      }
      patch.asc_issuer_id = allSet ? data.ascIssuerId! : null;
      patch.asc_key_id = allSet ? data.ascKeyId! : null;
      patch.asc_key_ciphertext = allSet ? await encryptAtRest(data.ascP8Pem!) : null;
    }

    if (data.playServiceAccountJson !== undefined) {
      const trimmed = data.playServiceAccountJson.trim();
      if (trimmed.length === 0) {
        patch.play_service_account_ciphertext = null;
      } else {
        // Sanity: must be parseable JSON with a `private_key` field
        // (matches Google's standard download).
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof parsed.private_key !== "string") {
            throw new Error("missing private_key field");
          }
        } catch (e) {
          return {
            ok: false as const,
            error: `Play service-account JSON didn't parse: ${e instanceof Error ? e.message : "invalid JSON"}`,
          };
        }
        patch.play_service_account_ciphertext = await encryptAtRest(trimmed);
      }
    }

    // Upsert pattern that works even when no row exists yet for this user.
    const { error } = (await adm.from("store_credentials").upsert(
      { user_id: userId, ...patch },
      { onConflict: "user_id" },
    )) as { error: { message: string } | null };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
