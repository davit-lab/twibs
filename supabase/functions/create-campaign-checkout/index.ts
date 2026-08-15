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

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user");
    }

    const { campaignId } = await req.json();

    if (!campaignId) {
      throw new Error("Campaign ID is required");
    }

    // Verify the campaign belongs to this user and is awaiting payment
    const { data: campaign, error: campaignError } = await supabaseClient
      .from("campaigns")
      .select("id, name, total_budget_cents, currency, status")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.user_id !== user.id) {
      throw new Error("Not your campaign");
    }

    if (campaign.status !== "pending_payment") {
      throw new Error("Campaign is not awaiting payment");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (campaign.currency || "USD").toLowerCase(),
            product_data: { name: `Twibsers ad campaign: ${campaign.name}` },
            unit_amount: campaign.total_budget_cents,
          },
        },
      ],
      success_url: `${req.headers.get("origin")}/ads/campaigns/${campaign.id}?paid=true`,
      cancel_url: `${req.headers.get("origin")}/ads/campaigns/${campaign.id}`,
      metadata: {
        campaign_id: campaign.id,
        supabase_user_id: user.id,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Campaign checkout error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
