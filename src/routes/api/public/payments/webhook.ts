import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") === "live" ? "live" : "sandbox") as PaddleEnv;

        let event;
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("Webhook signature verification failed", e);
          return new Response("Invalid signature", { status: 401 });
        }

        if (!event) return new Response("ok");

        try {
          switch (event.eventType) {
            case EventName.SubscriptionCreated:
            case EventName.SubscriptionUpdated: {
              const sub: any = event.data;
              const item = sub.items?.[0];
              const importMeta = item?.price?.importMeta || {};
              const productImportMeta = item?.product?.importMeta || {};
              const priceExternalId = importMeta.externalId;
              const productExternalId = productImportMeta.externalId;
              const userId = sub.customData?.userId;

              if (!priceExternalId || !productExternalId) {
                console.warn("missing importMeta.externalId — skipping", sub.id);
                break;
              }
              if (!userId) {
                console.warn("missing customData.userId — skipping", sub.id);
                break;
              }

              await supabaseAdmin.from("subscriptions").upsert(
                {
                  user_id: userId,
                  paddle_subscription_id: sub.id,
                  paddle_customer_id: sub.customerId,
                  product_id: productExternalId,
                  price_id: priceExternalId,
                  status: sub.status,
                  current_period_start: sub.currentBillingPeriod?.startsAt ?? null,
                  current_period_end: sub.currentBillingPeriod?.endsAt ?? null,
                  cancel_at_period_end: !!sub.scheduledChange && sub.scheduledChange.action === "cancel",
                  environment: env,
                },
                { onConflict: "paddle_subscription_id" }
              );
              break;
            }
            case EventName.SubscriptionCanceled: {
              const sub: any = event.data;
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  status: "canceled",
                  cancel_at_period_end: true,
                  current_period_end: sub.currentBillingPeriod?.endsAt ?? null,
                })
                .eq("paddle_subscription_id", sub.id);
              break;
            }
            default:
              break;
          }
        } catch (e) {
          console.error("Webhook handler error", e);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
