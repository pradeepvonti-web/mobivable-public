/**
 * Store Listing — App Store Connect + Play Console metadata + assets.
 *
 * Flow:
 *   1. `getStoreListing` — read the project's current listing for the UI.
 *   2. `upsertStoreListing` — merge a partial update into the row. The
 *      column is jsonb so each field can ship independently (partial
 *      updates avoid clobbering a screenshot list when the user only
 *      edited the subtitle).
 *   3. `uploadStoreAsset` — upload a 1024×1024 icon or a screenshot to
 *      Supabase Storage and return the public URL. The export bundles
 *      the icon into the Expo zip and emits a `store/listing.json` the
 *      operator can paste into App Store Connect / Play Console.
 *
 * Why a single jsonb column vs a `store_listings` table: the schema
 * will change every six months as Apple/Google shift their requirements.
 * A jsonb column lets us iterate without migrations and lets each
 * deployed studio version tolerate older shapes by defaulting fields.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface StoreScreenshot {
  device: string;
  url: string;
  /** Ordering within a device — Apple/Google both order screenshots. */
  ordinal: number;
}

export interface StoreListing {
  title?: string;
  subtitle?: string;
  description?: string;
  /** Each is short (~16 chars). Apple caps total to 100 chars comma-joined. */
  keywords?: string[];
  primary_category?: string;
  secondary_category?: string;
  age_rating?: string;
  support_url?: string;
  marketing_url?: string;
  privacy_policy_url?: string;
  whats_new?: string;
  /** Supabase Storage public URL of the 1024×1024 master icon. */
  icon_url?: string;
  screenshots?: StoreScreenshot[];
}

const StoreListingPatch = z
  .object({
    title: z.string().max(30).optional(),
    subtitle: z.string().max(30).optional(),
    description: z.string().max(4000).optional(),
    keywords: z.array(z.string().max(40)).max(20).optional(),
    primary_category: z.string().max(60).optional(),
    secondary_category: z.string().max(60).optional(),
    age_rating: z.string().max(20).optional(),
    support_url: z.string().url().max(500).optional().or(z.literal("")),
    marketing_url: z.string().url().max(500).optional().or(z.literal("")),
    privacy_policy_url: z.string().url().max(500).optional().or(z.literal("")),
    whats_new: z.string().max(4000).optional(),
    icon_url: z.string().url().max(1000).optional(),
    screenshots: z
      .array(
        z.object({
          device: z.string().min(1).max(60),
          url: z.string().url(),
          ordinal: z.number().int().min(0).max(50),
        }),
      )
      .max(50)
      .optional(),
  })
  .strict();

export const getStoreListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Loose cast: store_listing is brand-new and not in the generated
    // Database types yet.
    const sbLoose = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: row, error } = (await sbLoose
      .from("projects")
      .select("store_listing, user_id")
      .eq("id", data.projectId)
      .maybeSingle()) as {
      data: { store_listing: StoreListing | null; user_id: string } | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    if (!row || row.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }
    return { ok: true as const, listing: (row.store_listing ?? {}) as StoreListing };
  });

export const upsertStoreListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        patch: StoreListingPatch,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Read-modify-write so the partial patch only overwrites listed keys.
    // Verifying ownership through the user-scoped client guards RLS even
    // though the write uses the admin client.
    const sbLoose = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: row, error: readErr } = (await sbLoose
      .from("projects")
      .select("store_listing, user_id")
      .eq("id", data.projectId)
      .maybeSingle()) as {
      data: { store_listing: StoreListing | null; user_id: string } | null;
      error: { message: string } | null;
    };
    if (readErr) return { ok: false as const, error: readErr.message };
    if (!row || row.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }

    // Empty-string URLs come from the form on field clear — collapse to
    // undefined so we don't persist invalid placeholders.
    const cleanPatch: StoreListing = { ...data.patch };
    for (const key of ["support_url", "marketing_url", "privacy_policy_url"] as const) {
      if (cleanPatch[key] === "") cleanPatch[key] = undefined;
    }
    const next: StoreListing = { ...(row.store_listing ?? {}), ...cleanPatch };

    const { error: writeErr } = (await adm
      .from("projects")
      .update({ store_listing: next })
      .eq("id", data.projectId)
      .eq("user_id", userId)) as { error: { message: string } | null };
    if (writeErr) return { ok: false as const, error: writeErr.message };

    return { ok: true as const, listing: next };
  });

/**
 * Upload an icon or screenshot to Supabase Storage scoped to the user
 * and the project. Returns the public URL the caller persists onto
 * `store_listing`.
 *
 * Why we accept a data URL (vs multipart): keeps the surface a single
 * server fn call instead of a separate multipart endpoint, and the
 * client already has a canvas-derived data URL for icons. Capped at
 * 4 MB so an enormous PSD-derived PNG doesn't blow request size.
 */
export const uploadStoreAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        kind: z.enum(["icon", "screenshot"]),
        /** Slug for screenshots: iphone_6_7, ipad_12_9, android_phone, etc. */
        slot: z
          .string()
          .regex(/^[a-z0-9_]{1,40}$/i, "Use kebab/snake — letters, digits, underscores.")
          .optional(),
        /** Recommended PNG; JPEG / WebP also accepted. */
        dataUrl: z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,/)
          .max(4_500_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const match = data.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return { ok: false as const, error: "Could not parse data URL." };
    const mime = match[1];
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1].replace("jpeg", "jpg");

    const slot = data.slot ?? data.kind;
    const path = `store-assets/${userId}/${data.projectId}/${slot}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("project-attachments")
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
      });
    if (upErr) return { ok: false as const, error: upErr.message };

    const { data: pub } = supabaseAdmin.storage
      .from("project-attachments")
      .getPublicUrl(path);

    return { ok: true as const, url: pub.publicUrl, path };
  });
