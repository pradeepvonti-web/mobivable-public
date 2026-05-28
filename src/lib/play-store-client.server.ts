/**
 * Google Play Developer Publishing API client.
 *
 * Direct HTTP — no SDK. Runs on Cloudflare Workers (WebCrypto for JWT
 * signing, fetch for everything else). Service-account JSON gives us
 * the auth path; we never touch the user's Google login.
 *
 * The Play edits API is staged: insert an edit, upload the bundle to
 * it, assign the bundle to a track, then commit the edit. Anything
 * uncommitted is harmless — failed runs leave dangling edits that
 * Google times out after 30 days.
 *
 * Reference: https://developers.google.com/android-publisher/api-ref/rest
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  // Other fields exist but we don't need them for publish flows.
}

/** Parse + lightly validate the service-account JSON the user pasted. */
export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `Service-account JSON didn't parse: ${e instanceof Error ? e.message : "invalid JSON"}`,
    );
  }
  const client_email = parsed.client_email;
  const private_key = parsed.private_key;
  if (typeof client_email !== "string" || !client_email.includes("@")) {
    throw new Error("Service-account JSON is missing a valid client_email.");
  }
  if (typeof private_key !== "string" || !private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Service-account JSON is missing a PKCS#8 private_key.");
  }
  return {
    client_email,
    private_key,
    private_key_id:
      typeof parsed.private_key_id === "string" ? parsed.private_key_id : undefined,
  };
}

// ─── JWT signing (WebCrypto RS256) ─────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Strip the PEM wrapper and base64-decode to raw PKCS#8 bytes. */
function pemToPkcs8(pem: string): Uint8Array {
  const stripped = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(stripped, "base64"));
}

/**
 * Mint a JWT signed with the service account's RS256 key, then exchange
 * it at the Google token endpoint for a short-lived bearer token.
 * Cached per-process for a minute below the actual expiry so a fast
 * sequence of publish steps doesn't re-mint per call.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64UrlEncode(utf8(JSON.stringify(header)));
  const claimB64 = base64UrlEncode(utf8(JSON.stringify(claim)));
  const signingInput = `${headerB64}.${claimB64}`;

  // Some WebCrypto type defs reject `Uint8Array<ArrayBufferLike>` for
  // BufferSource. Copy into a fresh `Uint8Array` whose .buffer is
  // definitely an `ArrayBuffer` and the overload resolves.
  const keyBytesRaw = pemToPkcs8(sa.private_key);
  const keyAb = new ArrayBuffer(keyBytesRaw.byteLength);
  new Uint8Array(keyAb).set(keyBytesRaw);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyAb,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signingBytes = utf8(signingInput);
  const signingAb = new ArrayBuffer(signingBytes.byteLength);
  new Uint8Array(signingAb).set(signingBytes);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signingAb);
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" +
      encodeURIComponent(jwt),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(sa.client_email, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  });
  return json.access_token;
}

// ─── Edits lifecycle ───────────────────────────────────────────────

interface ApiError {
  error?: { code?: number; message?: string };
}

async function apiCall<T>(args: {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  token: string;
  body?: BodyInit | null;
  contentType?: string;
}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
  };
  if (args.contentType) headers["Content-Type"] = args.contentType;
  const res = await fetch(args.url, {
    method: args.method,
    headers,
    body: args.body ?? undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as ApiError;
      detail = j.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `Play API ${args.method} ${args.url.replace(PUBLISHER_BASE, "")} failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }
  // Some delete endpoints return 204.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface PlayUploadResult {
  /** The track + status committed (used in the UI as `internal/draft`). */
  trackStatus: string;
  /** Bundle version code Play assigned after upload. */
  versionCode: number;
  /** Edit id we used (for forensic logging — Play prunes after commit). */
  editId: string;
}

/**
 * Upload an .aab to the user's Play project and assign it to the
 * internal testing track. The bundle bytes come in via streamed fetch
 * — for a 50 MB .aab we don't want to fully buffer in worker memory if
 * the runtime supports streaming.
 */
export async function uploadAabToInternal(args: {
  serviceAccountJson: string;
  /** Android applicationId, e.g. com.acme.lemonade. */
  packageName: string;
  aabUrl: string;
  /** "draft" stages the release without rolling it out; "completed"
   *  ships immediately to all internal testers. v1 always uses draft so
   *  the user does the final flip in Play Console. */
  status?: "draft" | "completed";
}): Promise<PlayUploadResult> {
  const sa = parseServiceAccount(args.serviceAccountJson);
  const token = await getAccessToken(sa);

  // 1. Open an edit. Play returns an id + an expiryTimeSeconds — they
  // GC unsaved edits after 30 days, so we don't have to be tidy.
  const edit = await apiCall<{ id: string }>({
    url: `${PUBLISHER_BASE}/applications/${encodeURIComponent(args.packageName)}/edits`,
    method: "POST",
    token,
  });

  // 2. Download the .aab from the EAS artifact URL and stream it up.
  // EAS artifact URLs are public-ish (signed redirects) and usually
  // 50-150 MB. We fetch as a stream and re-emit — works in Workers if
  // the runtime supports half-duplex streaming; otherwise it buffers
  // (50 MB still fits comfortably under the 128 MB worker memory cap).
  const aabRes = await fetch(args.aabUrl);
  if (!aabRes.ok || !aabRes.body) {
    throw new Error(`Couldn't download .aab from ${args.aabUrl} (${aabRes.status}).`);
  }
  const bundle = await apiCall<{ versionCode: number }>({
    url: `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(args.packageName)}/edits/${edit.id}/bundles?uploadType=media`,
    method: "POST",
    token,
    body: await aabRes.arrayBuffer(),
    contentType: "application/octet-stream",
  });

  // 3. Assign the new bundle to the internal track.
  const status = args.status ?? "draft";
  const track = await apiCall<{ track: string }>({
    url: `${PUBLISHER_BASE}/applications/${encodeURIComponent(args.packageName)}/edits/${edit.id}/tracks/internal`,
    method: "PUT",
    token,
    contentType: "application/json",
    body: JSON.stringify({
      track: "internal",
      releases: [
        {
          name: `Internal ${bundle.versionCode}`,
          status,
          versionCodes: [String(bundle.versionCode)],
        },
      ],
    }),
  });

  // 4. Commit. Play validates + applies the edit atomically. A 4xx
  // here means the bundle is bad or the track config conflicts; the
  // edit gets discarded automatically.
  await apiCall<{ id: string }>({
    url: `${PUBLISHER_BASE}/applications/${encodeURIComponent(args.packageName)}/edits/${edit.id}:commit`,
    method: "POST",
    token,
  });

  return {
    trackStatus: `${track.track}/${status}`,
    versionCode: bundle.versionCode,
    editId: edit.id,
  };
}
