import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gatewayFetch, getPaddleClient, type PaddleEnv } from "@/lib/paddle.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => data)
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`
    );
    const result = await response.json();
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0].id as string;
  });

// Open Paddle's hosted customer portal so the user can update payment
// method or cancel. Returns the URL; the client opens it in a new tab.
export const openCustomerPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id, paddle_subscription_id, environment")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("No subscription found");

    const paddle = getPaddleClient(sub.environment as PaddleEnv);
    const session = await paddle.customerPortalSessions.create(
      sub.paddle_customer_id as string,
      [sub.paddle_subscription_id as string]
    );
    return { url: session.urls.general.overview };
  });

// Change plan: upgrades take effect immediately and are prorated; downgrades
// wait for the next billing period (no proration).
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetPriceId: z.enum([
          "starter_monthly",
          "starter_yearly",
          "pro_monthly",
          "pro_yearly",
          "scale_monthly",
          "scale_yearly",
          "business_monthly",
          "business_yearly",
        ]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_subscription_id, price_id, environment, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("No active subscription");
    if (sub.price_id === data.targetPriceId) {
      return { ok: true, unchanged: true };
    }

    const env = sub.environment as PaddleEnv;
    // Resolve price external id → Paddle internal id
    const priceLookup = await gatewayFetch(
      env,
      `/prices?external_id=${encodeURIComponent(data.targetPriceId)}`
    );
    const priceJson = await priceLookup.json();
    const paddlePriceId = priceJson.data?.[0]?.id as string | undefined;
    if (!paddlePriceId) throw new Error("Target price not found in Paddle");

    // Upgrade if moving up a tier, or monthly→yearly within the same tier.
    const tierRank = (id: string): number => {
      if (id.startsWith("business_")) return 4;
      if (id.startsWith("scale_")) return 3;
      if (id.startsWith("pro_")) return 2;
      return 1; // starter
    };
    const intervalRank = (id: string) => (id.endsWith("_yearly") ? 2 : 1);
    const currentTier = tierRank(sub.price_id as string);
    const targetTier = tierRank(data.targetPriceId);
    const isUpgrade =
      targetTier > currentTier ||
      (targetTier === currentTier &&
        intervalRank(data.targetPriceId) > intervalRank(sub.price_id as string));

    const paddle = getPaddleClient(env);
    const updated = await paddle.subscriptions.update(
      sub.paddle_subscription_id as string,
      {
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        prorationBillingMode: isUpgrade
          ? "prorated_immediately"
          : "prorated_next_billing_period",
      }
    );
    return { ok: true, isUpgrade, status: updated.status };
  });
