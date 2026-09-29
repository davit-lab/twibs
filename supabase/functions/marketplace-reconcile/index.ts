import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// Schedule every five minutes using the service-role bearer token. Never public.
serve(async req => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || req.headers.get('Authorization') !== `Bearer ${key}`) return new Response('Unauthorized', { status: 401 });
  try {
    const secret = Deno.env.get('STRIPE_SECRET_KEY'); if (!secret) throw new Error('Stripe is not configured');
    const stripe = new Stripe(secret, { apiVersion: '2023-10-16' });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key);
    const pending = await admin.from('orders').select('*').eq('status','pending').lt('reservation_expires_at',new Date().toISOString()).order('created_at').limit(100);
    if(pending.error) throw pending.error;
    let processed = 0; const failed: string[] = [];
    for (const order of pending.data) {
      try {
        let session: Stripe.Checkout.Session | undefined;
        if (order.stripe_checkout_session_id) session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
        else {
          // Recover a provider session created before an interrupted database write.
          // A provider/network error aborts this order; stock is never released on a guess.
          for await (const candidate of stripe.checkout.sessions.list({ created: { gte: Math.floor(new Date(order.created_at).getTime()/1000)-60 }, limit: 100 })) {
            if(candidate.metadata?.type === 'marketplace' && candidate.metadata?.order_id === order.id) { session=candidate; break; }
          }
        }
        if(session?.status === 'open') session = await stripe.checkout.sessions.expire(session.id);
        let patch: Record<string,unknown>;
        if(session?.payment_status === 'paid') {
          if(session.amount_total !== order.total_cents || session.currency !== order.currency) throw new Error('Amount mismatch');
          patch = { status:'paid',payment_status:'paid',paid_at:new Date().toISOString(),stripe_checkout_session_id:session.id,stripe_payment_intent_id:session.payment_intent };
        } else if (!session || session.status === 'expired') patch = { status:'cancelled',payment_status:'failed' };
        else continue; // In-flight payments retain their reservation.
        const result = await admin.from('orders').update(patch).eq('id',order.id).eq('status','pending');
        if(result.error) throw result.error;
        processed++;
      } catch { failed.push(order.id); }
    }
    return Response.json({ processed,failed }, { status:failed.length ? 500 : 200 });
  } catch(e) { return Response.json({ error:e instanceof Error ? e.message : 'Reconciliation failed' },{status:500}); }
});
