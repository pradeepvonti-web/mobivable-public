import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

/**
 * One-shot: tag every Stripe product in this account with the SaaS tax code
 * (txcd_10103001) so managed_payments / Stripe Tax can classify them.
 * Admin-only.
 */
export const backfillProductTaxCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    try {
      const stripe = createStripeClient(data.environment);
      const products = await stripe.products.list({ limit: 100, active: true });
      const updated: string[] = [];
      for (const p of products.data) {
        if (p.tax_code === "txcd_10103001") continue;
        await stripe.products.update(p.id, { tax_code: "txcd_10103001" });
        updated.push(p.name);
      }
      return { ok: true, updated };
    } catch (error) {
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });
