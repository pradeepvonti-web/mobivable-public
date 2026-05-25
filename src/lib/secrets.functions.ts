import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ─── Helpers ─── */

function encodeValue(value: string): string {
  return btoa(value);
}

function decodeValue(encoded: string): string {
  return atob(encoded);
}

function maskValue(encrypted: string): string {
  const decoded = decodeValue(encrypted);
  if (decoded.length <= 4) return "••••" + decoded;
  return "••••" + decoded.slice(-4);
}

/* ─── listSecrets (client-callable) ─── */

const ListSecretsInput = z.object({
  projectId: z.string().uuid(),
});

export const listSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSecretsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: rows, error } = await supabaseAdmin
      .from("project_secrets")
      .select("id, key_name, category, encrypted_value, updated_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const secrets = (rows ?? []).map((row: any) => ({
      id: row.id as string,
      key_name: row.key_name as string,
      category: row.category as string,
      masked_value: maskValue(row.encrypted_value),
      updated_at: row.updated_at as string,
    }));

    return { secrets };
  });

/* ─── setSecret (client-callable) ─── */

const SetSecretInput = z.object({
  projectId: z.string().uuid(),
  keyName: z.string().min(1).max(255),
  value: z.string().min(1),
  category: z.string().max(50).optional(),
});

export const setSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetSecretInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const encrypted = encodeValue(data.value);
    const category = data.category ?? "custom";

    const { error } = await supabaseAdmin
      .from("project_secrets")
      .upsert(
        {
          project_id: data.projectId,
          user_id: userId,
          key_name: data.keyName,
          encrypted_value: encrypted,
          category,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,key_name" },
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─── deleteSecret (client-callable) ─── */

const DeleteSecretInput = z.object({
  projectId: z.string().uuid(),
  secretId: z.string().uuid(),
});

export const deleteSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSecretInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from("project_secrets")
      .delete()
      .eq("id", data.secretId)
      .eq("project_id", data.projectId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─── getSecretsForBuild (server-only, NOT a createServerFn) ─── */

export async function getSecretsForBuild({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}): Promise<Record<string, string>> {
  const { data: rows, error } = await supabaseAdmin
    .from("project_secrets")
    .select("key_name, encrypted_value")
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const result: Record<string, string> = {};
  for (const row of rows ?? []) {
    result[row.key_name] = decodeValue(row.encrypted_value);
  }
  return result;
}
