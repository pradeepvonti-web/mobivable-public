/**
 * Skills — reusable instruction snippets the user invokes via `@name` in
 * the composer (Lovable shipped this May 2026). On send, the chat client
 * substitutes the `@name` token with the skill body before the message
 * crosses the wire, so the agent sees the expanded prose without needing
 * a special server path.
 *
 * Storage model:
 *   - One row per (user_id, name); name is lowercased + kebab style and
 *     enforced by a DB CHECK. Body capped at 8 KB by another CHECK so a
 *     single skill can't blow the model's context budget.
 *
 * Surface in the UI:
 *   - List / create / update / delete inside the Settings page (next to
 *     the MCP tokens card).
 *   - The composer auto-detects `@<name>` tokens on send and replaces
 *     them in-place with the skill body.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export interface SkillRow {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export const listSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_skills")
      .select("id, name, body, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })) as {
      data: SkillRow[] | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, skills: data ?? [] };
  });

export const upsertSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        // When `id` is set we update; when it's absent we insert (and the
        // server fills in a fresh uuid).
        id: z.string().uuid().optional(),
        name: z.string().regex(NAME_RE, {
          message:
            "Names must start with a–z or 0–9 and use only a–z, 0–9, dashes and underscores (max 40 chars).",
        }),
        body: z.string().min(1).max(8192),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const adm = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (data.id) {
      // Update path. The unique-(user_id, name) constraint catches rename
      // collisions; surface them as a soft error rather than a 500.
      const { data: row, error } = (await adm
        .from("mcp_agent_skills")
        .update({ name: data.name, body: data.body })
        .eq("id", data.id)
        .eq("user_id", userId)
        .select("id, name, body, created_at, updated_at")
        .single()) as {
        data: SkillRow | null;
        error: { message: string; code?: string } | null;
      };
      if (error || !row) {
        const msg = error?.code === "23505" ? "That name is already taken." : error?.message ?? "Update failed.";
        return { ok: false as const, error: msg };
      }
      return { ok: true as const, skill: row };
    }

    const { data: row, error } = (await adm
      .from("mcp_agent_skills")
      .insert({
        user_id: userId,
        name: data.name,
        body: data.body,
      })
      .select("id, name, body, created_at, updated_at")
      .single()) as {
      data: SkillRow | null;
      error: { message: string; code?: string } | null;
    };
    if (error || !row) {
      const msg = error?.code === "23505" ? "That name is already taken." : error?.message ?? "Insert failed.";
      return { ok: false as const, error: msg };
    }
    return { ok: true as const, skill: row };
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = (await (
      supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    )
      .from("mcp_agent_skills")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)) as { error: { message: string } | null };
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/**
 * Pure helper: given a draft message and a list of skills owned by the
 * user, expand every `@name` token to the skill body. Lives here next
 * to the server fns so both the composer (client) and any future
 * server-side path can share the same substitution rule.
 *
 * Substitution rules:
 *   - Tokens must be preceded by whitespace, line start, or a code-fence
 *     boundary — `email@example.com` is NOT a skill reference.
 *   - Unknown `@name` tokens pass through verbatim (no error toast).
 *   - The replacement format is "\n\n[skill: <name>]\n<body>\n" so the
 *     model can tell which span came from a skill expansion if it
 *     matters for citation.
 */
export function expandSkillMentions(
  text: string,
  skills: { name: string; body: string }[],
): string {
  if (!text.includes("@") || skills.length === 0) return text;
  const byName = new Map(skills.map((s) => [s.name, s.body]));
  // Token boundaries: start-of-line OR whitespace OR ([({ before the @,
  // then a–z0–9 with internal dashes/underscores. Lookbehind keeps the
  // preceding char in the match.
  return text.replace(
    /(^|[\s([{])@([a-z0-9][a-z0-9_-]{0,39})\b/g,
    (whole, lead, name) => {
      const body = byName.get(name as string);
      if (!body) return whole;
      return `${lead}\n\n[skill: ${name}]\n${body.trim()}\n`;
    },
  );
}
