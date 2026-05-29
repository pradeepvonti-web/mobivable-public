/**
 * Scrape a public App Store / Google Play listing into a structured
 * `StoreListing` — title, developer, description, category, and the
 * marketing screenshot URLs. This is step 1 of the "clone an app from its
 * store page" flow; the screenshots then go to the vision pass
 * (analyze-app-screens.functions.ts) which turns them into a clone spec.
 *
 * What a store listing can and cannot give us:
 *   - CAN: the polished marketing screenshots (5–10 screens), the app name,
 *     developer, category, rating, and the long description.
 *   - CANNOT: real data models, API behavior, auth flows, or any screen the
 *     developer didn't put in their marketing shots. The clone built from
 *     this is a strong visual/navigation approximation, not a functional copy
 *     — the vision + inference passes downstream make that gap explicit and
 *     hand it to the user to confirm.
 *
 * Per-store strategy:
 *   - Apple: use the official iTunes Lookup JSON API. Reliable, structured,
 *     gives screenshotUrls + description + genre directly. We construct the
 *     lookup URL ourselves from the app id, so there's no SSRF surface.
 *   - Google Play: no public API. We fetch the listing HTML and regex out the
 *     play-lh.googleusercontent.com image URLs + og: meta tags. Brittle by
 *     nature; when Google reshapes their markup this degrades gracefully and
 *     the caller can fall back to user-uploaded screenshots.
 *
 * Security posture (mirrors ingest-url.functions.ts):
 *   - We only ever fetch a fixed allow-list of store hostnames. The Apple
 *     lookup URL is built by us; the Play URL's hostname is verified before
 *     fetch. No private IPs, no arbitrary user-controlled hosts.
 *   - 8s timeout, 2 MiB response cap.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2_000_000; // 2 MiB — Play HTML pages are large.
const MAX_SCREENSHOTS = 10;
const MAX_DESC_CHARS = 6_000;

export type StoreSource = "apple" | "google";

export interface StoreListing {
  store: StoreSource;
  appId: string;
  title: string;
  developer: string | null;
  description: string;
  category: string | null;
  rating: number | null;
  iconUrl: string | null;
  screenshotUrls: string[];
  sourceUrl: string;
}

interface ParsedStoreUrl {
  store: StoreSource;
  appId: string;
  country: string;
}

/**
 * Identify the store and extract the app id from a listing URL.
 * Apple: https://apps.apple.com/us/app/instagram/id389801252
 * Google: https://play.google.com/store/apps/details?id=com.instagram.android
 */
function parseStoreUrl(raw: string): ParsedStoreUrl {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Unsupported scheme: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();

  if (host === "apps.apple.com" || host === "itunes.apple.com") {
    const idMatch = /\/id(\d+)/.exec(u.pathname);
    if (!idMatch) throw new Error("Couldn't find an app id in that App Store URL.");
    const countryMatch = /^\/([a-z]{2})\//i.exec(u.pathname);
    return { store: "apple", appId: idMatch[1], country: (countryMatch?.[1] ?? "us").toLowerCase() };
  }

  if (host === "play.google.com") {
    const id = u.searchParams.get("id");
    if (!id) throw new Error("Couldn't find an app id in that Google Play URL.");
    return { store: "google", appId: id, country: (u.searchParams.get("gl") ?? "us").toLowerCase() };
  }

  throw new Error("Unsupported store. Provide an apps.apple.com or play.google.com URL.");
}

async function fetchWithLimits(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "mobivable-store-ingest/1.0",
        Accept: accept,
      },
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof DOMException && e.name === "AbortError";
    throw new Error(
      aborted
        ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
        : `Couldn't reach the store: ${e instanceof Error ? e.message : "unknown"}.`,
    );
  }
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`Store returned HTTP ${res.status}.`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Store returned an empty body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response exceeds the ${(MAX_RESPONSE_BYTES / 1024 / 1024).toFixed(1)} MiB cap.`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

interface ItunesResult {
  trackName?: string;
  sellerName?: string;
  artistName?: string;
  description?: string;
  primaryGenreName?: string;
  averageUserRating?: number;
  artworkUrl512?: string;
  artworkUrl100?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
}

async function fetchAppleListing(parsed: ParsedStoreUrl, sourceUrl: string): Promise<StoreListing> {
  // Official, structured, and host is fixed by us → no SSRF surface.
  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(parsed.appId)}&country=${encodeURIComponent(parsed.country)}`;
  const body = await fetchWithLimits(lookupUrl, "application/json");

  let json: { resultCount?: number; results?: ItunesResult[] };
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("App Store lookup returned malformed JSON.");
  }
  const r = json.results?.[0];
  if (!r) throw new Error("No app found for that App Store id.");

  const screenshots = [...(r.screenshotUrls ?? []), ...(r.ipadScreenshotUrls ?? [])]
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, MAX_SCREENSHOTS);

  return {
    store: "apple",
    appId: parsed.appId,
    title: r.trackName ?? "Unknown app",
    developer: r.sellerName ?? r.artistName ?? null,
    description: (r.description ?? "").slice(0, MAX_DESC_CHARS),
    category: r.primaryGenreName ?? null,
    rating: typeof r.averageUserRating === "number" ? Math.round(r.averageUserRating * 10) / 10 : null,
    iconUrl: r.artworkUrl512 ?? r.artworkUrl100 ?? null,
    screenshotUrls: screenshots,
    sourceUrl,
  };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function metaContent(html: string, property: string): string | null {
  // Matches <meta property="og:title" content="..."> in either attribute order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return decodeHtmlEntities(m[1]).trim();
  }
  return null;
}

async function fetchGoogleListing(parsed: ParsedStoreUrl, sourceUrl: string): Promise<StoreListing> {
  // No public API — scrape the listing HTML. Brittle by design; we degrade
  // gracefully rather than throwing when individual fields are missing.
  const playUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(parsed.appId)}&hl=en&gl=${encodeURIComponent(parsed.country)}`;
  const html = await fetchWithLimits(playUrl, "text/html");

  const ogTitle = metaContent(html, "og:title");
  const title = (ogTitle ?? parsed.appId).replace(/\s*[-–]\s*Apps on Google Play\s*$/i, "").trim();
  const description = (metaContent(html, "og:description") ?? metaContent(html, "description") ?? "").slice(0, MAX_DESC_CHARS);
  const iconUrl = metaContent(html, "og:image");

  // Screenshots are hosted on play-lh.googleusercontent.com. Collect unique
  // URLs, drop the icon (og:image) if it shows up in the set.
  const imgRe = /https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9\-_=./]+/g;
  const seen = new Set<string>();
  const screenshots: string[] = [];
  for (const m of html.matchAll(imgRe)) {
    const base = m[0].split("=")[0]; // strip size params for dedupe
    if (seen.has(base)) continue;
    seen.add(base);
    if (iconUrl && m[0].split("=")[0] === iconUrl.split("=")[0]) continue;
    screenshots.push(m[0]);
    if (screenshots.length >= MAX_SCREENSHOTS) break;
  }

  return {
    store: "google",
    appId: parsed.appId,
    title,
    developer: null,
    description,
    category: null,
    rating: null,
    iconUrl,
    screenshotUrls: screenshots,
    sourceUrl,
  };
}

export const ingestAppStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ url: z.string().min(8).max(2048) }).parse(input),
  )
  .handler(async ({ data }) => {
    let parsed: ParsedStoreUrl;
    try {
      parsed = parseStoreUrl(data.url);
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const listing =
        parsed.store === "apple"
          ? await fetchAppleListing(parsed, data.url.trim())
          : await fetchGoogleListing(parsed, data.url.trim());

      if (listing.screenshotUrls.length === 0) {
        return {
          ok: false as const,
          error:
            parsed.store === "google"
              ? "Couldn't extract screenshots from the Play listing — Google may have changed their markup. Try uploading screenshots manually."
              : "That App Store listing had no screenshots to analyze.",
        };
      }
      return { ok: true as const, listing };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed to read the store listing." };
    }
  });
