import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const secret = Deno.env.get('STRIPE_SECRET_KEY');
    const origin = Deno.env.get('APP_URL');
    if (!secret || !origin || !Deno.env.get('STRIPE_WEBHOOK_SECRET')) throw new Error('Marketplace payments are not configured');
    const stripe = new Stripe(secret, { apiVersion: '2023-10-16' });
    const url = Deno.env.get('SUPABASE_URL')!;
    const authorization = req.headers.get('Authorization') || '';
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error('Sign in to continue');
    const body = await req.json();
    const { action, businessId } = body;
    const check = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message); };
    let result: unknown;
    if (action === 'setup' || action === 'status' || action === 'dashboard') {
      const access = await client.rpc('can_admin_business', { p_business_id: businessId });
      check(access);
      if (!access.data) throw new Error('Only business owners and admins can manage payments');
      const stored = await admin.from('business_stripe_accounts').select('*').eq('business_id', businessId).maybeSingle(); check(stored);
      let accountId = stored.data?.stripe_account_id;
      if (!accountId && action === 'setup') {
        const account = await stripe.accounts.create({ type: 'express', email: user.email, metadata: { business_id: businessId }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } }, { idempotencyKey: `business-connect-${businessId}` });
        accountId = account.id;
        check(await admin.from('business_stripe_accounts').upsert({ business_id: businessId, stripe_account_id: accountId }));
      }
      if (!accountId) result = { configured: false };
      else {
        const account = await stripe.accounts.retrieve(accountId);
        const state = { charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled, onboarding_complete: account.details_submitted, currently_due: account.requirements?.currently_due ?? [], disabled_reason: account.requirements?.disabled_reason ?? null };
        check(await admin.from('business_stripe_accounts').update(state).eq('business_id', businessId));
        if (action === 'setup') result = await stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', return_url: `${origin}/b?tab=payments`, refresh_url: `${origin}/b?tab=payments` });
        else if (action === 'dashboard') result = await stripe.accounts.createLoginLink(accountId);
        else result = { configured: true, ...state };
      }
    } else if (action === 'checkout' || action === 'resume') {
      let orderId = body.orderId;
      if (action === 'checkout') {
        const prepared = await client.rpc('prepare_business_order', { p_business_id: businessId, p_request_id: body.requestId, p_fulfillment: body.fulfillment, p_shipping_address: body.address || null, p_customer_note: body.note || null });
        check(prepared); orderId = prepared.data?.[0]?.order_id;
      }
      const found = await admin.from('orders').select('*').eq('id', orderId).eq('customer_id', user.id).single(); check(found);
      const order = found.data;
      if (order.status !== 'pending') throw new Error('This order is no longer awaiting payment');
      const stored = await admin.from('business_stripe_accounts').select('*').eq('business_id', order.business_id).single(); check(stored);
      if (!stored.data.charges_enabled || !stored.data.payouts_enabled) throw new Error('Seller payment setup is incomplete');
      let session;
      if (order.stripe_checkout_session_id) session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      else {
        if (new Date(order.reservation_expires_at).getTime() <= Date.now()) {
          throw new Error('This reservation is being reconciled. Refresh your orders shortly.');
        }
        const items = await admin.from('order_items').select('*').eq('order_id', order.id); check(items);
        const lines = (items.data ?? []).map(item => ({ price_data: { currency: order.currency, unit_amount: item.unit_price_cents, product_data: { name: `${item.product_name}${item.variant_label ? ` · ${item.variant_label}` : ''}` } }, quantity: item.quantity }));
        if (lines.length === 0) throw new Error('This order has no purchasable items');
        if (order.shipping_cents) lines.push({ price_data: { currency: order.currency, unit_amount: order.shipping_cents, product_data: { name: 'Delivery' } }, quantity: 1 });
        session = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'], customer_email: user.email, line_items: lines, expires_at: Math.floor(new Date(order.created_at).getTime()/1000)+3600, payment_intent_data: { application_fee_amount: order.platform_fee_cents, transfer_data: { destination: stored.data.stripe_account_id }, metadata: { order_id: order.id, type: 'marketplace' } }, metadata: { type: 'marketplace', order_id: order.id }, success_url: `${origin}/orders?order=${order.id}`, cancel_url: `${origin}/orders?order=${order.id}` }, { idempotencyKey: `marketplace-order-${order.id}` });
        check(await admin.from('orders').update({ stripe_checkout_session_id: session.id, reservation_expires_at: new Date(session.expires_at*1000).toISOString() }).eq('id', order.id).eq('status','pending'));
      }
      if (session.status !== 'open' || !session.url) throw new Error('Payment is processing or the checkout has expired. Refresh your orders.');
      result = { url: session.url, orderId: order.id };
    } else throw new Error('Unknown commerce action');
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unable to complete request' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
