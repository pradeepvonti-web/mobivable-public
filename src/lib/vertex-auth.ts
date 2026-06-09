/**
 * Vertex AI Authentication Helper
 *
 * Generates short-lived OAuth2 access tokens from a GCP service account key
 * without requiring the `google-auth-library` package. Uses the JWT Bearer
 * flow: sign a JWT with the service account's RSA private key, then exchange
 * it at Google's token endpoint for an access token.
 *
 * Environment Variables:
 *   VERTEX_AI_SERVICE_ACCOUNT — JSON string of the GCP service account key
 *   VERTEX_AI_PROJECT         — GCP project ID (auto-detected from key if absent)
 *   VERTEX_AI_LOCATION        — Region (default: "us-central1")
 */

import * as crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────
interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Unix ms
}

// ─── State ──────────────────────────────────────────────────────
let cachedToken: CachedToken | null = null;
let parsedKey: ServiceAccountKey | null = null;

// ─── Helpers ────────────────────────────────────────────────────
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function getServiceAccountKey(): ServiceAccountKey | null {
  if (parsedKey) return parsedKey;

  const raw = process.env.VERTEX_AI_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    parsedKey = JSON.parse(raw) as ServiceAccountKey;
    return parsedKey;
  } catch {
    console.error("[vertex-auth] Failed to parse VERTEX_AI_SERVICE_ACCOUNT JSON");
    return null;
  }
}

/**
 * Create a signed JWT for the Google OAuth2 token exchange.
 * See: https://developers.google.com/identity/protocols/oauth2/service-account#httprest
 */
function createSignedJwt(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600, // 1 hour
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ];
  const signingInput = segments.join(".");
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: sa.private_key,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });

  return `${signingInput}.${base64url(signature)}`;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Check if Vertex AI is configured (service account key is present).
 */
export function isVertexConfigured(): boolean {
  return !!getServiceAccountKey();
}

/**
 * Get the GCP project ID (from env or service account key).
 */
export function getVertexProjectId(): string {
  return process.env.VERTEX_AI_PROJECT || getServiceAccountKey()?.project_id || "";
}

/**
 * Get the Vertex AI region.
 */
export function getVertexLocation(): string {
  return process.env.VERTEX_AI_LOCATION || "us-central1";
}

/**
 * Build the Vertex AI OpenAI-compatible base URL.
 */
export function getVertexBaseUrl(): string {
  const project = getVertexProjectId();
  const location = getVertexLocation();
  if (!project) return "";
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;
}

/**
 * Build the Vertex AI Imagen endpoint URL.
 */
export function getVertexImagenUrl(modelId: string = "imagen-4.0-generate-001"): string {
  const project = getVertexProjectId();
  const location = getVertexLocation();
  if (!project) return "";
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:predict`;
}

/**
 * Get a valid OAuth2 access token for Vertex AI.
 * Tokens are cached in-memory and refreshed 5 minutes before expiry.
 *
 * Returns null if Vertex AI is not configured or token generation fails.
 */
export async function getVertexAccessToken(): Promise<string | null> {
  // Check cache first (refresh 5 min before expiry)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const sa = getServiceAccountKey();
  if (!sa) return null;

  try {
    const jwt = createSignedJwt(sa);
    const tokenUrl = sa.token_uri || "https://oauth2.googleapis.com/token";

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[vertex-auth] Token exchange failed (${res.status}): ${body.slice(0, 200)}`);
      return null;
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      console.error("[vertex-auth] No access_token in response");
      return null;
    }

    cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };

    return cachedToken.token;
  } catch (e) {
    console.error("[vertex-auth] Token generation error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Invalidate the cached token (e.g. after a 401 from Vertex).
 */
export function invalidateVertexToken(): void {
  cachedToken = null;
}
