import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreditBalance = {
  monthly_remaining: number;
  monthly_granted: number;
  daily_remaining: number;
  daily_granted: number;
  plan: string;
  period_start: string;
};

export const getCreditBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreditBalance> => {
    const { supabase, userId } = context;

    // Ensure a balance row exists
    const { data: existing } = await supabase
      .from("ai_credit_balances")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.rpc("grant_ai_credits", { p_user: userId });
      if (error) throw new Error(error.message);
    }

    const [{ data: bal, error: balError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("ai_credit_balances")
        .select("*")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .single(),
    ]);

    if (balError) throw new Error(balError.message);
    if (profileError) throw new Error(profileError.message);

    return {
      monthly_remaining: bal?.monthly_remaining ?? 0,
      monthly_granted: bal?.monthly_granted ?? 0,
      daily_remaining: bal?.daily_remaining ?? 0,
      daily_granted: bal?.daily_granted ?? 0,
      plan: (profile?.plan as string) ?? "free_beta",
      period_start: bal?.period_start ?? new Date().toISOString(),
    };
  });

const ConsumeInput = z.object({
  amount: z.number().int().min(1).max(100),
  reason: z.string().min(1).max(120),
  projectId: z.string().uuid().optional(),
});

export const consumeCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConsumeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rpcArgs: { p_user: string; p_amount: number; p_reason: string; p_project?: string } = {
      p_user: userId,
      p_amount: data.amount,
      p_reason: data.reason,
    };
    if (data.projectId) rpcArgs.p_project = data.projectId;
    const { data: result, error } = await supabase.rpc("consume_ai_credits", rpcArgs);
    if (error) throw new Error(error.message);
    return result as unknown as { ok: boolean; daily_remaining: number; monthly_remaining: number };
  });
