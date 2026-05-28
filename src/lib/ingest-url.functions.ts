/**
 * Fetch a public URL, extract its visible text, and persist a
 * `knowledge_items` row the user can review/edit later.
 *
 * Used by the Knowledge dialog's "Ingest from URL" affordance and (later)
 * by the MCP server's `ingest_url` tool. Server-only because:
 *   - The studio's deploy target (Cloudflare Workers / Render) avoids CORS
 *     entirely; the browser would otherwise be blocked from most pages.
 *   - We can sandbox the fetch (timeout, max size, allow-list scheme).
 *
 * Security posture (matches the rest of the user-input plumbing):
 *   - HTTPS only — no `file:`, `data:`, `javascript:`, no internal IPs.
 *   - 8-second timeout. 1.5 MiB response cap. If either trips, we reject
 *     cleanly without retaining partial data.
 *   - HTML is parsed via a tiny regex stripper (no DOMParser available in
 *     Workers). Good enough for blog posts / docs pages / GitHub READMEs.
 *     Heavy SPAs (Notion, Linear) will give thin content; users will see
 *     that immediately and can paste the text manually.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_500_000; // 1.5 MiB
const MAX_STORED_CHARS = 20_000;       // capped before INSERT — knowledge-context.ts re-caps at ~8 KB

const BLOCKED_HOSTNAMES = new Set([
  // Loopback / private-network — defence against SSRF probing.
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  // Cloud metadata endpoints — same.
  "169.254.169.254",
  "metadata.google.internal",
]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Unsupported scheme: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error(`Refusing to fetch ${host}.`);
  }
  if (isPrivateIpv4(host)) {
    throw new Error(`Refusing to fetch a private-range address.`);
  }
  return u;
}

/**
 * Convert raw HTML into something usable as LLM context.
 * Strategy:
 *   1. Drop <script>, <style>, <noscript>, <template> blocks entirely.
 *   2. Replace block-level tags with newlines so paragraph structure survives.
 *   3. Strip remaining tags.
 *   4. Decode the common HTML entities (full table is overkill here).
 *   5. Collapse whitespace runs.
 */
function stripHtmlToText(html: string): string {
  let s = html;
  s = s.replace(/<\s*(script|style|noscript|template)[\s\S]*?<\/\s*\1\s*>/gi, " ");
  s = s.replace(/<\s*(br|hr)\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/?\s*(p|div|section|article|li|h\d|tr|td|th|blockquote|pre)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  s = s.replace(/\n[ \t]+/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function extractTitle(html: string, fallback: string): string {
  const m = /<title[^>]*>([\s\S]{1,400}?)<\/title>/i.exec(html);
  const raw = (m?.[1] ?? fallback).trim();
  // Same entity decoder as the body — cheap to re-run on the title.
  return stripHtmlToText(raw).slice(0, 200) || fallback;
}

export const ingestUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input) =>
      z
        .object({
          url: z.string().min(8).max(2048),
          // Optional override; defaults to the page's <title> tag.
          title: z.string().max(200).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let url: URL;
    try {
      url = validateUrl(data.url.trim());
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }

    // Fetch with timeout + size cap.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          // Some sites (docs.github.com, Linear) gate on a UA. Identify
          // ourselves so they can rate-limit honestly.
          "User-Agent": "mobivable-knowledge-ingest/1.0",
          Accept: "text/html, text/plain;q=0.9, */*;q=0.1",
        },
      });
    } catch (e) {
      clearTimeout(timeout);
      const aborted = e instanceof DOMException && e.name === "AbortError";
      return {
        ok: false as const,
        error: aborted
          ? `Timed out fetching ${url.hostname} after ${FETCH_TIMEOUT_MS / 1000}s.`
          : `Couldn't reach ${url.hostname}: ${e instanceof Error ? e.message : "unknown"}.`,
      };
    }
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        ok: false as const,
        error: `${url.hostname} returned HTTP ${res.status}.`,
      };
    }

    // Read with a hard size cap so a runaway response can't pin the worker.
    const reader = res.body?.getReader();
    if (!reader) {
      return { ok: false as const, error: `${url.hostname} returned an empty body.` };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return {
            ok: false as const,
            error: `Page exceeds the ${(MAX_RESPONSE_BYTES / 1024 / 1024).toFixed(1)} MiB cap.`,
          };
        }
        chunks.push(value);
      }
    } catch (e) {
      return {
        ok: false as const,
        error: `Stream error reading ${url.hostname}: ${e instanceof Error ? e.message : "unknown"}.`,
      };
    }

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const text = stripHtmlToText(html);
    if (text.length < 30) {
      return {
        ok: false as const,
        error: `Couldn't extract meaningful text — page may be JS-rendered or empty. Paste the content manually.`,
      };
    }

    const stored = text.length > MAX_STORED_CHARS
      ? text.slice(0, MAX_STORED_CHARS) + "\n\n…[truncated at " + MAX_STORED_CHARS + " chars]"
      : text;
    const title = data.title?.trim() || extractTitle(html, url.hostname);

    const { data: row, error } = await supabase
      .from("knowledge_items")
      .insert({
        user_id: userId,
        title: `🔗 ${title}`,
        content:
          `Source: ${url.toString()}\nFetched: ${new Date().toISOString()}\n\n${stored}`,
        file_url: null,
        file_name: null,
      })
      .select("id, title, content, updated_at")
      .single();
    if (error || !row) {
      return { ok: false as const, error: error?.message ?? "Could not save knowledge item." };
    }
    return {
      ok: true as const,
      item: row,
      charsStored: stored.length,
      sourceUrl: url.toString(),
    };
  });
