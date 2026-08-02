import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_FEE_PERCENT = 20; // 20% platform fee

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

    const { bookId, successUrl, cancelUrl } = await req.json();

    if (!bookId) {
      throw new Error("Book ID is required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get book details
    const { data: book, error: bookError } = await supabaseAdmin
      .from("books")
      .select("id, title, price, is_free, author_id, cover_url")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found");
    }

    if (book.is_free || !book.price || book.price === 0) {
      throw new Error("This book is free");
    }

    if (book.author_id === user.id) {
      throw new Error("You cannot buy your own book");
    }

    // Check if already purchased
    const { data: existingPurchase } = await supabaseAdmin
      .from("book_purchases")
      .select("id")
      .eq("book_id", bookId)
      .eq("buyer_id", user.id)
      .eq("status", "completed")
      .maybeSingle();

    if (existingPurchase) {
      throw new Error("You already own this book");
    }

    // Get author's Stripe Connect account
    const { data: authorAccount } = await supabaseAdmin
      .from("author_stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("user_id", book.author_id)
      .maybeSingle();

    if (!authorAccount || !authorAccount.charges_enabled) {
      throw new Error("Author has not set up payments yet");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Price is stored in cents
    const amountInCents = Math.round(book.price * 100);
    const platformFee = Math.round(amountInCents * (PLATFORM_FEE_PERCENT / 100));

    // Create checkout session with Connect
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: book.title,
              images: book.cover_url ? [book.cover_url] : [],
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: authorAccount.stripe_account_id,
        },
        metadata: {
          book_id: bookId,
          buyer_id: user.id,
          author_id: book.author_id,
        },
      },
      success_url: successUrl || `${req.headers.get("origin")}/library/book/${bookId}?purchased=true`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/library/book/${bookId}?canceled=true`,
      metadata: {
        book_id: bookId,
        buyer_id: user.id,
        author_id: book.author_id,
        type: "book_purchase",
      },
    });

    // Create pending purchase record
    await supabaseAdmin
      .from("book_purchases")
      .insert({
        book_id: bookId,
        buyer_id: user.id,
        author_id: book.author_id,
        amount_paid: amountInCents,
        platform_fee: platformFee,
        author_earnings: amountInCents - platformFee,
        stripe_session_id: session.id,
        status: "pending",
      });

    console.log("Created book checkout session:", session.id);

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Book checkout error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
