/**
 * Store Listing — the App Store Connect / Play Console "info you must
 * fill in before you ship" surface, gathered into one form so the user
 * does it once instead of re-keying every metadata field into two
 * different web consoles.
 *
 * Pieces:
 *   - Metadata form (title, subtitle, description, keywords, categories,
 *     URLs, age rating, what's new). Saved as a single jsonb on the
 *     project row.
 *   - Icon upload — accepts a 1024×1024 PNG/JPEG/WebP. Validates the
 *     dimensions client-side; Expo's prebuild handles the per-platform
 *     resizing at build time so we don't need to ship 30 sizes.
 *   - Screenshot slots per device size — Apple and Google each require
 *     a specific set; the panel lists them with current-state thumbnails.
 *     Mutation: upload replaces the most recent ordinal for that slot.
 *
 * Why no in-browser screenshot generator yet: that needs the schema-
 * renderer to lay out each screen at exact device dimensions. The
 * Snack/Flutter preview pipes don't yet expose a "render at NxM and
 * give me bytes" hook. Path-of-least-resistance for v1 is upload slots;
 * v2 will auto-capture from the preview engine when the user clicks
 * "Capture all screens."
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  X,
  Smartphone,
  Tablet,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStoreListing,
  upsertStoreListing,
  uploadStoreAsset,
  type StoreListing,
  type StoreScreenshot,
} from "@/lib/store-listing.functions";

interface DeviceSlot {
  id: string;
  label: string;
  /** Required dimensions for the upload — width × height. */
  width: number;
  height: number;
  /** Whether iPad-like or phone-like — affects the slot icon. */
  kind: "phone" | "tablet";
  /** Required by Apple's review or just nice to have? */
  required: "ios" | "android" | "both" | "optional";
}

// Apple + Google ask for these baseline slots in late-2025 review. Apple
// in particular rejects builds that lack the 6.7" / 6.5" sizes.
const DEVICE_SLOTS: DeviceSlot[] = [
  { id: "iphone_6_7", label: "iPhone 6.7\"", width: 1290, height: 2796, kind: "phone", required: "ios" },
  { id: "iphone_6_5", label: "iPhone 6.5\"", width: 1242, height: 2688, kind: "phone", required: "ios" },
  { id: "iphone_5_5", label: "iPhone 5.5\"", width: 1242, height: 2208, kind: "phone", required: "optional" },
  { id: "ipad_12_9", label: "iPad 12.9\"", width: 2048, height: 2732, kind: "tablet", required: "ios" },
  { id: "android_phone", label: "Android phone", width: 1080, height: 1920, kind: "phone", required: "android" },
  { id: "android_tablet", label: "Android tablet", width: 1600, height: 2560, kind: "tablet", required: "optional" },
];

const CATEGORIES = [
  "Food & Drink",
  "Health & Fitness",
  "Lifestyle",
  "Productivity",
  "Education",
  "Entertainment",
  "Games",
  "Finance",
  "Business",
  "Social Networking",
  "Travel",
  "Shopping",
  "Utilities",
  "News",
  "Photo & Video",
  "Music",
  "Sports",
  "Reference",
];

const AGE_RATINGS = ["4+", "9+", "12+", "17+"];

export function StoreListingPanel({ projectId }: { projectId: string }) {
  const [listing, setListing] = useState<StoreListing>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotSlotRef = useRef<DeviceSlot | null>(null);
  const getFn = useServerFn(getStoreListing);
  const upsertFn = useServerFn(upsertStoreListing);
  const uploadFn = useServerFn(uploadStoreAsset);

  // Local form state mirrors `listing`. We commit on Save rather than
  // per-keystroke so the user can cancel a draft cleanly.
  const [draft, setDraft] = useState<StoreListing>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await getFn({ data: { projectId } });
        if (cancelled) return;
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setListing(res.listing);
        setDraft(res.listing);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, getFn]);

  const screenshotsByDevice = useMemo(() => {
    const map = new Map<string, StoreScreenshot[]>();
    for (const s of listing.screenshots ?? []) {
      const arr = map.get(s.device) ?? [];
      arr.push(s);
      map.set(s.device, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.ordinal - b.ordinal);
    return map;
  }, [listing.screenshots]);

  async function saveDraft() {
    setSaving(true);
    try {
      // Strip undefineds + the read-only icon_url / screenshots (they're
      // mutated through the upload path, not the metadata form).
      const patch: Partial<StoreListing> = {};
      const fields: (keyof StoreListing)[] = [
        "title",
        "subtitle",
        "description",
        "keywords",
        "primary_category",
        "secondary_category",
        "age_rating",
        "support_url",
        "marketing_url",
        "privacy_policy_url",
        "whats_new",
      ];
      for (const f of fields) {
        const v = draft[f];
        if (v !== undefined) (patch as Record<string, unknown>)[f] = v;
      }
      const res = await upsertFn({ data: { projectId, patch } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setListing(res.listing);
      toast.success("Listing saved");
    } finally {
      setSaving(false);
    }
  }

  /** Read a file as data URL + assert image dimensions. */
  function readImage(
    file: File,
  ): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please pick a PNG, JPEG, or WebP image."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read the file."));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onerror = () => reject(new Error("Couldn't decode the image."));
        img.onload = () =>
          resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleIconFile(file: File) {
    setIconUploading(true);
    try {
      const { dataUrl, width, height } = await readImage(file);
      if (width !== 1024 || height !== 1024) {
        toast.error(`Icon must be exactly 1024×1024. Got ${width}×${height}.`);
        return;
      }
      const res = await uploadFn({
        data: { projectId, kind: "icon", dataUrl, slot: "icon" },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const upsert = await upsertFn({
        data: { projectId, patch: { icon_url: res.url } },
      });
      if (!upsert.ok) {
        toast.error(upsert.error);
        return;
      }
      setListing(upsert.listing);
      setDraft((d) => ({ ...d, icon_url: res.url }));
      toast.success("Icon uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Icon upload failed");
    } finally {
      setIconUploading(false);
    }
  }

  async function handleScreenshotFile(file: File, slot: DeviceSlot) {
    setScreenshotBusy(slot.id);
    try {
      const { dataUrl, width, height } = await readImage(file);
      // Apple is strict; Google takes a range. We allow a 10% tolerance
      // so the user doesn't fail over a 1290 vs 1284 mismatch.
      const tol = 0.1;
      const matchesW = Math.abs(width - slot.width) / slot.width <= tol;
      const matchesH = Math.abs(height - slot.height) / slot.height <= tol;
      if (!matchesW || !matchesH) {
        toast.error(
          `${slot.label} expects ${slot.width}×${slot.height}. Got ${width}×${height}.`,
        );
        return;
      }
      const res = await uploadFn({
        data: { projectId, kind: "screenshot", dataUrl, slot: slot.id },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const existing = listing.screenshots ?? [];
      const ordinal = existing.filter((s) => s.device === slot.id).length;
      const next: StoreScreenshot[] = [
        ...existing,
        { device: slot.id, url: res.url, ordinal },
      ];
      const upsert = await upsertFn({
        data: { projectId, patch: { screenshots: next } },
      });
      if (!upsert.ok) {
        toast.error(upsert.error);
        return;
      }
      setListing(upsert.listing);
      toast.success(`${slot.label} screenshot added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Screenshot upload failed");
    } finally {
      setScreenshotBusy(null);
    }
  }

  async function removeScreenshot(s: StoreScreenshot) {
    if (!window.confirm(`Remove this ${s.device} screenshot?`)) return;
    const next = (listing.screenshots ?? []).filter(
      (x) => !(x.device === s.device && x.url === s.url),
    );
    const upsert = await upsertFn({
      data: { projectId, patch: { screenshots: next } },
    });
    if (!upsert.ok) {
      toast.error(upsert.error);
      return;
    }
    setListing(upsert.listing);
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading listing…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Icon ── */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          App icon
        </h3>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl border border-border bg-muted/40 grid place-items-center overflow-hidden shrink-0">
            {listing.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.icon_url}
                alt="App icon"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <input
              ref={iconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleIconFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => iconInputRef.current?.click()}
              disabled={iconUploading}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {iconUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {listing.icon_url ? "Replace icon" : "Upload icon"}
            </button>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              1024×1024 PNG, JPEG, or WebP. Expo will downscale for every
              platform variant at build time — no need to ship 30 sizes.
            </p>
          </div>
        </div>
      </section>

      {/* ── Metadata form ── */}
      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Metadata
        </h3>
        <Field label="Title" hint="30 chars max (App Store limit).">
          <input
            type="text"
            maxLength={30}
            value={draft.title ?? ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Subtitle" hint="30 chars max. Shows under the title in search.">
          <input
            type="text"
            maxLength={30}
            value={draft.subtitle ?? ""}
            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Description" hint="4,000 chars max.">
          <textarea
            rows={6}
            maxLength={4000}
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-y"
          />
        </Field>
        <Field
          label="Keywords"
          hint="Comma-separated. Apple counts the total joined length (100 chars max)."
        >
          <input
            type="text"
            value={(draft.keywords ?? []).join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                keywords: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean),
              })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="recipes, citrus, summer"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary category">
            <select
              value={draft.primary_category ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, primary_category: e.target.value })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Pick —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Secondary category">
            <select
              value={draft.secondary_category ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, secondary_category: e.target.value })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Pick —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Age rating">
          <select
            value={draft.age_rating ?? ""}
            onChange={(e) => setDraft({ ...draft, age_rating: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Pick —</option>
            {AGE_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Support URL">
          <input
            type="url"
            value={draft.support_url ?? ""}
            onChange={(e) => setDraft({ ...draft, support_url: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="https://"
          />
        </Field>
        <Field label="Marketing URL">
          <input
            type="url"
            value={draft.marketing_url ?? ""}
            onChange={(e) => setDraft({ ...draft, marketing_url: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="https://"
          />
        </Field>
        <Field label="Privacy policy URL" hint="Required by Apple + Google.">
          <input
            type="url"
            value={draft.privacy_policy_url ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, privacy_policy_url: e.target.value })
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="https://"
          />
        </Field>
        <Field label="What's new" hint="Release notes — shown on the update screen.">
          <textarea
            rows={4}
            maxLength={4000}
            value={draft.whats_new ?? ""}
            onChange={(e) => setDraft({ ...draft, whats_new: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-y"
          />
        </Field>
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save listing"}
        </button>
      </section>

      {/* ── Screenshots ── */}
      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Screenshots
        </h3>
        <p className="text-xs text-muted-foreground">
          Apple requires screenshots for at least the iPhone 6.7" and the
          iPad 12.9" sizes. Google requires the Android phone size.
        </p>
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            const slot = screenshotSlotRef.current;
            if (f && slot) handleScreenshotFile(f, slot);
            e.target.value = "";
            screenshotSlotRef.current = null;
          }}
        />
        <div className="space-y-3">
          {DEVICE_SLOTS.map((slot) => {
            const shots = screenshotsByDevice.get(slot.id) ?? [];
            const Icon = slot.kind === "tablet" ? Tablet : Smartphone;
            const requiredBadge =
              slot.required === "ios"
                ? "iOS required"
                : slot.required === "android"
                  ? "Android required"
                  : slot.required === "both"
                    ? "Required"
                    : "Optional";
            return (
              <div
                key={slot.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium flex-1 truncate">
                    {slot.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({slot.width}×{slot.height})
                    </span>
                  </p>
                  <span
                    className={
                      "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 " +
                      (slot.required === "optional"
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/15 text-primary")
                    }
                  >
                    {requiredBadge}
                  </span>
                </div>
                {shots.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {shots.map((s) => (
                      <div
                        key={s.url}
                        className="relative shrink-0 group"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt={`${slot.label} screenshot`}
                          className="h-24 rounded border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(s)}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition"
                          aria-label="Remove screenshot"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No screenshots yet.</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    screenshotSlotRef.current = slot;
                    screenshotInputRef.current?.click();
                  }}
                  disabled={screenshotBusy === slot.id}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
                >
                  {screenshotBusy === slot.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Upload
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[10px] text-muted-foreground">
        The next Expo export bundles your icon as <code>assets/icon.png</code>{" "}
        and writes <code>store/listing.json</code> with this metadata so a
        downstream <code>eas submit</code> step can pick it up.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {hint && <span className="text-[10px] text-muted-foreground"> · {hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
