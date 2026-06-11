import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type Stripe from "stripe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };

const PRICE_IDS = [
  "starter_monthly",
  "starter_yearly",
  "pro_monthly",
  "pro_yearly",
  "scale_monthly",
  "scale_yearly",
  "business_monthly",
  "business_yearly",
] as const;

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({
      email: options.email,
      limit: 1,
    });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      priceId: string;
      quantity?: number;
      customerEmail?: string;
      userId?: string;
      returnUrl: string;
      environment: StripeEnv;
    }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) {
        throw new Error("Invalid priceId");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const customerId =
        data.customerEmail || data.userId
          ? await resolveOrCreateCustomer(stripe, {
              email: data.customerEmail,
              userId: data.userId,
            })
          : undefined;

      // Managed payments: Stripe handles end-to-end tax compliance, fraud,
      // disputes, and transactional support for buyers in supported countries
      // (+3.5% per tx). Incompatible with `automatic_tax`, so we drop it here.
      const session = await stripe.checkout.sessions.create({
        line_items: [
          { price: stripePrice.id, quantity: data.quantity || 1 },
        ],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        ...(customerId && { customer: customerId }),
        ...(data.userId && {
          metadata: { userId: data.userId, managed_payments: "true" },
          ...(isRecurring && {
            subscription_data: { metadata: { userId: data.userId } },
          }),
        }),
        managed_payments: { enabled: true },
      } as Stripe.Checkout.SessionCreateParams);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) {
      return { error: "No subscription found" };
    }
    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Legacy named exports kept so existing callers (dashboard) keep working.
export const openCustomerPortal = createPortalSession;

// Pulls the user's latest subscription from Stripe and upserts it into the
// `subscriptions` table. Used after returning from the Customer Portal so the
// UI reflects cancellations/payment-method updates without waiting on the
// webhook (which may also fire — the upsert is idempotent on
// stripe_subscription_id).
export const syncSubscriptionFromStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row?.stripe_customer_id) return { ok: false, reason: "no_customer" };

    try {
      const stripe = createStripeClient(data.environment);
      const list = await stripe.subscriptions.list({
        customer: row.stripe_customer_id as string,
        status: "all",
        limit: 1,
      });
      const subscription = list.data[0];
      if (!subscription) return { ok: false, reason: "no_subscription" };

      const item = subscription.items?.data?.[0];
      const priceId =
        (item?.price as any)?.lookup_key ||
        (item?.price as any)?.metadata?.lovable_external_id ||
        item?.price?.id ||
        "";
      const productId =
        typeof item?.price?.product === "string"
          ? item.price.product
          : (item?.price?.product as any)?.id ?? "";
      const periodStart =
        (item as any)?.current_period_start ??
        (subscription as any).current_period_start;
      const periodEnd =
        (item as any)?.current_period_end ??
        (subscription as any).current_period_end;

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer as string,
          product_id: productId,
          price_id: priceId,
          status: subscription.status,
          current_period_start: periodStart
            ? new Date(periodStart * 1000).toISOString()
            : null,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          environment: data.environment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stripe_subscription_id" },
      );
      return { ok: true, status: subscription.status };
    } catch (error) {
      return { ok: false, reason: getStripeErrorMessage(error) };
    }
  });

export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetPriceId: z.enum(PRICE_IDS),
        environment: z.enum(["sandbox", "live"]).default("sandbox"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, price_id, environment, status")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("No active subscription");
    if (sub.price_id === data.targetPriceId) {
      return { ok: true, unchanged: true };
    }

    const env = sub.environment as StripeEnv;
    const stripe = createStripeClient(env);

    const prices = await stripe.prices.list({
      lookup_keys: [data.targetPriceId],
    });
    if (!prices.data.length) throw new Error("Target price not found");
    const targetStripePrice = prices.data[0];

    const tierRank = (id: string): number => {
      if (id.startsWith("business_")) return 4;
      if (id.startsWith("scale_")) return 3;
      if (id.startsWith("pro_")) return 2;
      return 1;
    };
    const intervalRank = (id: string) => (id.endsWith("_yearly") ? 2 : 1);
    const currentTier = tierRank(sub.price_id as string);
    const targetTier = tierRank(data.targetPriceId);
    const isUpgrade =
      targetTier > currentTier ||
      (targetTier === currentTier &&
        intervalRank(data.targetPriceId) >
          intervalRank(sub.price_id as string));

    const subscription = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id as string,
    );
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) throw new Error("Subscription has no items");

    if (isUpgrade) {
      // Upgrade: switch immediately, prorate + invoice now so credits are
      // granted at the new tier right away (handled by the subscriptions
      // trigger -> profile.plan -> grant_ai_credits chain).
      const updated = await stripe.subscriptions.update(
        sub.stripe_subscription_id as string,
        {
          items: [{ id: itemId, price: targetStripePrice.id }],
          proration_behavior: "always_invoice",
        },
      );
      return { ok: true, isUpgrade: true, status: updated.status };
    }

    // Downgrade: defer the price change to the next renewal via a
    // subscription schedule. Current period stays on the current plan;
    // new plan + lower credits take effect at current_period_end.
    const currentItem = subscription.items.data[0];
    const periodEnd =
      currentItem?.current_period_end ??
      (subscription as unknown as { current_period_end?: number })
        .current_period_end;
    if (!periodEnd) throw new Error("Subscription has no current_period_end");

    let scheduleId = (subscription as unknown as { schedule?: string | null })
      .schedule;
    if (!scheduleId) {
      const created = await stripe.subscriptionSchedules.create({
        from_subscription: sub.stripe_subscription_id as string,
      });
      scheduleId = created.id;
    }

    await stripe.subscriptionSchedules.update(scheduleId as string, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentItem.price.id, quantity: 1 }],
          start_date: currentItem.current_period_start ?? "now",
          end_date: periodEnd,
          proration_behavior: "none",
        },
        {
          items: [{ price: targetStripePrice.id, quantity: 1 }],
          proration_behavior: "none",
        },
      ],
    });

    return { ok: true, isUpgrade: false, scheduledFor: periodEnd };
  });
