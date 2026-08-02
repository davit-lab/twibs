import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    const { bookId } = await req.json();

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
      .select("id, title, pdf_url, is_free, price, author_id")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found");
    }

    if (!book.pdf_url) {
      throw new Error("This book has no PDF");
    }

    // Check if user has access
    const isAuthor = book.author_id === user.id;
    const isFree = book.is_free || !book.price || book.price === 0;

    let hasPurchased = false;
    if (!isAuthor && !isFree) {
      const { data: purchase } = await supabaseAdmin
        .from("book_purchases")
        .select("id")
        .eq("book_id", bookId)
        .eq("buyer_id", user.id)
        .eq("status", "completed")
        .maybeSingle();

      hasPurchased = !!purchase;
    }

    if (!isAuthor && !isFree && !hasPurchased) {
      throw new Error("You don't have access to this book");
    }

    // Generate a signed URL for the PDF (valid for 1 hour)
    // Extract the path from the full URL
    const pdfPath = book.pdf_url.split("/book-pdfs/")[1];
    
    if (!pdfPath) {
      throw new Error("Invalid PDF URL format");
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
      .storage
      .from("book-pdfs")
      .createSignedUrl(pdfPath, 3600); // 1 hour

    if (signedUrlError) {
      console.error("Error creating signed URL:", signedUrlError);
      throw new Error("Failed to generate PDF access");
    }

    console.log("Generated signed URL for book:", bookId, "user:", user.id);

    return new Response(
      JSON.stringify({ 
        url: signedUrlData.signedUrl,
        title: book.title,
        expiresIn: 3600,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("PDF access error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
