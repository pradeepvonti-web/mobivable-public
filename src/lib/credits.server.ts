import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

function createUserScopedCreditClient(accessToken: string) {
  const p = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const supabaseUrl = p.SUPABASE_URL;
  const publishableKey = p.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing backend environment variable(s): ${missing.join(", ")}.`);
  }

  return createClient<Database>(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Server-only credit gate. Deducts credits via the consume_ai_credits RPC.
 * Throws a user-facing error when the user has none left. Call BEFORE invoking the AI.
 */
export async function consumeOrThrow(
  userId: string,
  amount: number,
  reason: string,
  projectId?: string,
): Promise<{ daily_remaining: number; monthly_remaining: number }> {
  const authHeader = getRequest()?.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!accessToken) {
    throw new Error("Unauthorized: No authorization header provided");
  }

  const args: { p_user: string; p_amount: number; p_reason: string; p_project?: string } = {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
  };
  if (projectId) args.p_project = projectId;

  const supabase = createUserScopedCreditClient(accessToken);
  const { data, error } = await supabase.rpc("consume_ai_credits", args);
  if (error) throw new Error(error.message);

  const r = data as { ok: boolean; daily_remaining: number; monthly_remaining: number } | null;
  if (!r || !r.ok) {
    throw new Error("OUT_OF_CREDITS: You're out of AI credits. Upgrade your plan to keep going.");
  }
  return { daily_remaining: r.daily_remaining, monthly_remaining: r.monthly_remaining };
}

export const CREDIT_COSTS = {
  text: 1,
  image: 2,
  research: 2,
  generate_project: 3,
  agent_task: 1,
} as const;
