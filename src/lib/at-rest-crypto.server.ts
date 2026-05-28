/**
 * App-layer AES-256-GCM encryption for sensitive credentials at rest.
 *
 * Why we do this on top of Supabase's at-rest encryption:
 *   - Supabase's encryption protects the disk, not the JSON the DB
 *     hands back when the row is queried. Anyone with the service-role
 *     key can read every ASC private key in plaintext if we just stash
 *     them in a `text` column.
 *   - Application-layer encryption with a key kept in our own env
 *     (APP_SECRET_ENCRYPTION_KEY) means a leaked service-role key
 *     yields opaque ciphertext, and a DB-only attacker (e.g. an SQL
 *     injection that reads but can't read env) gets nothing useful.
 *
 * Key material: 32-byte key, hex-encoded in env. If the env var is
 * missing we throw loudly — credentials are too sensitive to store in
 * the clear by accident.
 *
 * Wire format for every ciphertext column:
 *   base64( 12-byte nonce ‖ ciphertext-with-16-byte-tag )
 *
 * WebCrypto is available in Node 20+ and on Cloudflare Workers, so this
 * works in both deploy targets.
 */

const ALGO = "AES-GCM";
const NONCE_BYTES = 12;
const KEY_ENV = "APP_SECRET_ENCRYPTION_KEY";

let cachedKey: CryptoKey | null = null;

async function importKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `${KEY_ENV} is not set. Generate one with \`openssl rand -hex 32\` and add it to your env.`,
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `${KEY_ENV} must be 64 hex chars (32 bytes). Got ${raw.length} chars.`,
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
  }
  cachedKey = await crypto.subtle.importKey("raw", bytes, ALGO, false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Buffer is the cleanest path under Node; Workers also expose it now.
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

/** Encrypt UTF-8 plaintext. Returns base64(nonce ‖ ciphertext+tag). */
export async function encryptAtRest(plaintext: string): Promise<string> {
  if (plaintext.length === 0) return "";
  const key = await importKey();
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: ALGO, iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(NONCE_BYTES + ct.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ct), NONCE_BYTES);
  return bytesToBase64(out);
}

/** Decrypt a previously-encrypted blob. Throws if tag check fails. */
export async function decryptAtRest(ciphertext: string): Promise<string> {
  if (ciphertext.length === 0) return "";
  const key = await importKey();
  const bytes = base64ToBytes(ciphertext);
  if (bytes.length < NONCE_BYTES + 16) {
    throw new Error("Ciphertext too short to contain nonce + tag.");
  }
  // `subarray` returns a `Uint8Array<ArrayBufferLike>` in newer TS libs
  // which WebCrypto's BufferSource type doesn't always accept. Slicing
  // yields a fresh `Uint8Array<ArrayBuffer>` that fits cleanly.
  const nonce = bytes.slice(0, NONCE_BYTES);
  const ct = bytes.slice(NONCE_BYTES);
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv: nonce }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Quick safe-fingerprint for UI display ("last 4 of the key id" etc).
 *  Never reveals more than 4 chars. */
export function tail4(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = s.replace(/[\s\r\n]+/g, "");
  return trimmed.slice(-4);
}
