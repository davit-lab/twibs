import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2023-10-16",
  });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    let event: Stripe.Event;

    // PRODUCTION: Always verify webhook signature
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }
    } else if (!webhookSecret) {
      // DEVELOPMENT ONLY: Allow without verification when no secret is configured
      console.warn("⚠️ STRIPE_WEBHOOK_SECRET not set - verification skipped (DEV ONLY)");
      event = JSON.parse(body);
    } else {
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    console.log("Processing webhook event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};

        if (metadata.type === "book_purchase") {          const bookId = metadata.book_id;
          const buyerId = metadata.buyer_id;
          const authorId = metadata.author_id;

          if (!bookId || !buyerId) {
            console.error("Missing book purchase metadata");
            break;
          }

          const { error: purchaseError } = await supabaseAdmin
            .from("book_purchases")
            .update({
              status: "completed",
              stripe_payment_intent_id: session.payment_intent as string,
            })
            .eq("stripe_session_id", session.id);

          if (purchaseError) {
            console.error("Error updating book purchase:", purchaseError);
          }

          const { data: purchase } = await supabaseAdmin
            .from("book_purchases")
            .select("amount_paid, platform_fee, author_earnings")
            .eq("stripe_session_id", session.id)
            .single();

          if (purchase) {
            const { data: existingEarnings } = await supabaseAdmin
              .from("author_earnings")
              .select("*")
              .eq("user_id", authorId)
              .maybeSingle();

            if (existingEarnings) {
              await supabaseAdmin
                .from("author_earnings")
                .update({
                  total_sales: existingEarnings.total_sales + 1,
                  total_revenue: existingEarnings.total_revenue + purchase.amount_paid,
                  total_platform_fees: existingEarnings.total_platform_fees + purchase.platform_fee,
                  total_author_earnings: existingEarnings.total_author_earnings + purchase.author_earnings,
                })
                .eq("user_id", authorId);
            } else {
              await supabaseAdmin
                .from("author_earnings")
                .insert({
                  user_id: authorId,
                  total_sales: 1,
                  total_revenue: purchase.amount_paid,
                  total_platform_fees: purchase.platform_fee,
                  total_author_earnings: purchase.author_earnings,
                });
            }
          }
          break;
        }

        if (metadata.campaign_id) {
          const { error: confirmError } = await supabaseAdmin.rpc(
            "confirm_campaign_payment",
            {
              p_campaign_id: metadata.campaign_id,
              p_provider: "stripe",
              p_provider_payment_id: session.payment_intent as string,
            }
          );

          if (confirmError) {
            console.error("Error confirming campaign payment:", confirmError);
          } else {
            console.log("Campaign payment confirmed:", metadata.campaign_id);
          }
          break;
        }

        const userId = metadata.supabase_user_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;

        const { data: plans } = await supabaseAdmin
          .from("subscription_plans")
          .select("id, stripe_price_id_monthly, stripe_price_id_yearly")
          .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`);

        const plan = plans?.[0];

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .upsert({
            user_id: userId,
            plan_id: plan?.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: subscription.status as any,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          }, { onConflict: "user_id" });

        if (error) console.error("Error upserting subscription:", error);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (existingSub) {
          const { error } = await supabaseAdmin
            .from("subscriptions")
            .update({
              status: subscription.status as any,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
            })
            .eq("user_id", existingSub.user_id);

          if (error) console.error("Error updating subscription:", error);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_customer_id", customerId);

        if (error) console.error("Error canceling subscription:", error);
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
