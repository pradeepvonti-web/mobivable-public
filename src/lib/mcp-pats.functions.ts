/**
 * Personal Access Token lifecycle for the MCP server.
 *
 * Storage model (GitHub-style):
 *   - Plaintext format: `mvbl_pat_{32 random bytes hex}` = 8 + 1 + 64 = 73 chars.
 *   - Returned exactly once by `issueMcpPat` — never recoverable thereafter.
 *   - Stored as SHA-256 hex digest, plus a display `prefix` (first 16 chars
 *     of the plaintext) so the settings UI can render
 *     `mvbl_pat_a1b2c3d4… (revoke)` without storing the secret.
 *
 * Listing returns the prefix + name + created/last_used so the user can
 * recognize their tokens. Revoke sets `revoked_at = now()`; the MCP route
 * filters revoked rows out of the lookup.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Same algorithm the MCP route uses to verify incoming Bearers. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const TOKEN_BYTES = 32;
const PREFIX_LEN = 16; // 'mvbl_pat_' (9) + 7 random hex chars

function generatePat(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mvbl_pat_${hex}`;
}

export const issueMcpPat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[\w\s.\-]+$/, "Name must be alphanumeric + spaces / dots / dashes."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Cap per-user — 10 tokens is plenty; stops runaway leakage if a token
    // ever falls into a script that auto-creates more.
    const { count } = (await (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("mvbl_pats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("revoked_at", null)) as { count: number | null };
    if ((count ?? 0) >= 10) {
      return {
        ok: false as const,
        error: "You already have 10 active tokens. Revoke an unused one before issuing more.",
      };
    }

    const token = generatePat();
    const token_hash = await sha256Hex(token);
    const prefix = token.slice(0, PREFIX_LEN);

    const insertRes = (await (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("mvbl_pats")
      .insert({
        user_id: userId,
        name: data.name.trim(),
        token_hash,
        prefix,
      })
      .select("id, name, prefix, created_at")
      .single()) as {
      data: { id: string; name: string; prefix: string; created_at: string } | null;
      error: { message: string } | null;
    };
    if (insertRes.error || !insertRes.data) {
      return {
        ok: false as const,
        error: insertRes.error?.message ?? "Could not save token.",
      };
    }
    const row = insertRes.data;

    // Plaintext returned ONCE — caller surfaces it for copying, then can
    // never read it again from anywhere.
    return {
      ok: true as const,
      pat: token,
      token: { id: row.id, name: row.name, prefix: row.prefix, created_at: row.created_at },
    };
  });

export interface ListedPat {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const listMcpPats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("mvbl_pats")
      .select("id, name, prefix, created_at, last_used_at, revoked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: (error as { message: string }).message };
    return { ok: true as const, tokens: (data ?? []) as ListedPat[] };
  });

export const revokeMcpPat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // The RLS UPDATE policy already restricts to own rows; the explicit
    // user_id filter is belt-and-braces.
    const { error } = (await (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("mvbl_pats")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId)) as { error: { message: string } | null };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
