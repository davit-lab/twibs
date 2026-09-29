-- Extend the existing commerce model; no replacement tables or enums.
ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_request_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_request ON public.orders(customer_id, checkout_request_id) WHERE checkout_request_id IS NOT NULL;

-- Product media limit is read by the client and enforced under a parent row lock.
CREATE OR REPLACE FUNCTION public.product_media_limit() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 10 $$;
GRANT EXECUTE ON FUNCTION public.product_media_limit() TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.guard_product_media_limit() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 PERFORM 1 FROM products WHERE id = NEW.product_id FOR UPDATE;
 IF (SELECT count(*) FROM product_images WHERE product_id = NEW.product_id AND id <> NEW.id) >= product_media_limit() THEN
   RAISE EXCEPTION 'Maximum product image count reached';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_media_limit_guard ON public.product_images;
CREATE TRIGGER product_media_limit_guard BEFORE INSERT OR UPDATE OF product_id ON public.product_images FOR EACH ROW EXECUTE FUNCTION public.guard_product_media_limit();

CREATE OR REPLACE FUNCTION public.reorder_product_images(p_product_id uuid, p_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM products WHERE id=p_product_id AND can_admin_business(business_id)) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM 1 FROM products WHERE id=p_product_id FOR UPDATE;
 IF cardinality(p_ids) <> (SELECT count(*) FROM product_images WHERE product_id=p_product_id)
 OR cardinality(p_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_ids) id)
 OR EXISTS (SELECT 1 FROM unnest(p_ids) AS wanted(image_id) WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.id=wanted.image_id AND i.product_id=p_product_id)) THEN RAISE EXCEPTION 'Reload the images before reordering'; END IF;
 UPDATE product_images i SET position=u.pos-1 FROM unnest(p_ids) WITH ORDINALITY u(id,pos) WHERE i.id=u.id AND i.product_id=p_product_id;
END $$;
REVOKE ALL ON FUNCTION public.reorder_product_images(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_product_images(uuid,uuid[]) TO authenticated;

-- Only rows actually reserved by checkout may be restocked; repeated webhook deliveries are harmless.
CREATE OR REPLACE FUNCTION public.release_order_inventory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status <> 'cancelled' THEN
  WITH released AS (UPDATE order_items SET inventory_reserved=false WHERE order_id=NEW.id AND inventory_reserved RETURNING variant_id,quantity)
  UPDATE product_variants v SET inventory_count=v.inventory_count+r.quantity FROM released r WHERE v.id=r.variant_id;
 END IF;
 RETURN NEW;
END $$;
-- Retire the old non-idempotent manual restock endpoint.
REVOKE ALL ON FUNCTION public.release_order_inventory_now(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.create_marketplace_order(public.fulfillment_mode,jsonb,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.prepare_business_order(
  p_business_id uuid,
  p_request_id uuid,
  p_fulfillment      public.fulfillment_mode DEFAULT 'shipping',
  p_shipping_address jsonb DEFAULT NULL,
  p_customer_note    text DEFAULT NULL
)
RETURNS TABLE (
  order_id      uuid,
  order_number  text,
  business_id   uuid,
  business_name text,
  subtotal_cents bigint,
  shipping_cents bigint,
  total_cents   bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_lines   integer;
  v_bus     record;
  v_subtotal bigint;
  v_ship_sum  bigint;
  v_threshold bigint;
  v_shipping  bigint;
  v_total     bigint;
  v_fee       bigint;
  v_order_id  uuid;
  v_order_no  text;
  v_fulfill   public.fulfillment_mode := p_fulfillment;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to check out' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Checkout request is required'; END IF;
  IF EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=v_user AND o.checkout_request_id=p_request_id) THEN
   RETURN QUERY SELECT o.id,o.order_number,o.business_id,a.name,o.subtotal_cents,o.shipping_cents,o.total_cents FROM orders o JOIN advertiser_accounts a ON a.id=o.business_id WHERE o.customer_id=v_user AND o.checkout_request_id=p_request_id;
   RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM business_stripe_accounts ba WHERE ba.business_id=p_business_id AND ba.charges_enabled AND ba.payouts_enabled) THEN RAISE EXCEPTION 'This business must complete payment setup'; END IF;
  PERFORM 1 FROM cart_items WHERE user_id=v_user ORDER BY id FOR UPDATE;
  PERFORM 1 FROM products WHERE id IN (SELECT product_id FROM cart_items WHERE user_id=v_user) ORDER BY id FOR SHARE;
  -- 'both' describes what a product supports, not what the buyer chose, so a
  -- caller cannot pass it through as a fulfilment method.
  IF v_fulfill NOT IN ('shipping', 'pickup') THEN
    RAISE EXCEPTION 'Choose delivery or collection' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_lines
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
   WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id);
  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Your cart is empty' USING ERRCODE = 'P0001';
  END IF;

  IF v_fulfill = 'shipping'
     AND (p_shipping_address IS NULL OR p_shipping_address = '{}'::jsonb) THEN
    RAISE EXCEPTION 'A delivery address is required' USING ERRCODE = '22023';
  END IF;

  -- Lock every variant this checkout will touch, ordered by id so concurrent
  -- checkouts queue instead of deadlocking. Taken before any stock is read.
  PERFORM 1
    FROM public.product_variants v
   WHERE v.id IN (
           SELECT ci.variant_id FROM public.cart_items ci
            WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id) AND ci.variant_id IS NOT NULL)
   ORDER BY v.id
   FOR UPDATE;

  -- Validate the whole cart before writing anything, so a failure halfway
  -- through cannot leave a partial order behind.
  FOR v_bus IN
    SELECT ci.id, p.id AS product_id, p.name, p.status AS product_status,
           p.fulfillment AS product_fulfillment, p.inventory_tracking,
           a.status AS business_status, a.name AS business_name,
           v.id AS variant_id, v.is_active AS variant_active,
           v.inventory_count, v.unlimited_stock
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      JOIN public.advertiser_accounts a ON a.id = p.business_id
      LEFT JOIN public.product_variants v ON v.id = ci.variant_id
     WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id)
     ORDER BY ci.id
  LOOP
    IF v_bus.product_status <> 'approved' THEN
      RAISE EXCEPTION '"%" is no longer available', v_bus.name USING ERRCODE = '22023';
    END IF;
    IF v_bus.business_status <> 'active' THEN
      RAISE EXCEPTION '"%" is not currently trading', v_bus.business_name USING ERRCODE = '22023';
    END IF;
    IF v_bus.variant_id IS NOT NULL AND NOT coalesce(v_bus.variant_active, false) THEN
      RAISE EXCEPTION 'An option for "%" is no longer available', v_bus.name USING ERRCODE = '22023';
    END IF;
    -- A variant must actually belong to the product it was sold with.
    IF v_bus.variant_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.product_variants v
                        WHERE v.id = v_bus.variant_id AND v.product_id = v_bus.product_id) THEN
      RAISE EXCEPTION 'Invalid option for "%"', v_bus.name USING ERRCODE = '22023';
    END IF;
    -- Stock tracking needs somewhere to keep the stock. A tracked product with
    -- no variant would make overselling unavoidable, so it is refused rather
    -- than quietly treated as unlimited.
    IF coalesce(v_bus.inventory_tracking, true) AND v_bus.variant_id IS NULL THEN
      RAISE EXCEPTION '"%" needs a variant before it can be sold', v_bus.name
        USING ERRCODE = '22023';
    END IF;
    IF v_fulfill = 'pickup' AND v_bus.product_fulfillment = 'shipping' THEN
      RAISE EXCEPTION '"%" cannot be collected', v_bus.name USING ERRCODE = '22023';
    END IF;
    IF v_fulfill = 'shipping' AND v_bus.product_fulfillment = 'pickup' THEN
      RAISE EXCEPTION '"%" is collection only', v_bus.name USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- One order per business, so a single checkout spanning two sellers produces
  -- two orders with two payouts rather than one unsplittable order.
  FOR v_bus IN
    SELECT p.business_id, a.name AS business_name, p.currency
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      JOIN public.advertiser_accounts a ON a.id = p.business_id
     WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id)
     GROUP BY p.business_id, a.name, p.currency
     ORDER BY p.business_id
  LOOP
    IF v_bus.currency <> 'usd' THEN
      RAISE EXCEPTION 'Currency % is not supported yet', v_bus.currency USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(sum(coalesce(v.price_cents, p.price_cents) * ci.quantity), 0),
           coalesce(sum(p.shipping_price_cents), 0),
           min(p.free_shipping_threshold_cents)
      INTO v_subtotal, v_ship_sum, v_threshold
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      LEFT JOIN public.product_variants v ON v.id = ci.variant_id
     WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id) AND p.business_id = v_bus.business_id;

    -- Free shipping is a per-business threshold on that business's own subtotal.
    v_shipping := CASE
                   WHEN v_fulfill = 'pickup' THEN 0
                   WHEN v_threshold IS NOT NULL AND v_subtotal >= v_threshold THEN 0
                   ELSE v_ship_sum
                 END;

    v_total := v_subtotal + v_shipping;
    -- Same 20% platform fee the book marketplace already charges, so revenue
    -- reporting is consistent across the platform.
    v_fee   := round(v_total * 0.20);
    v_order_no := 'TW-' || lpad(nextval('public.order_number_seq')::text, 9, '0');

    INSERT INTO public.orders (
      order_number, business_id, customer_id, status, payment_status, currency,
      subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents,
      platform_fee_cents, business_earnings_cents,
      fulfillment, shipping_address, customer_note, checkout_request_id, reservation_expires_at)
    VALUES (
      v_order_no, v_bus.business_id, v_user, 'pending', 'unpaid', v_bus.currency,
      v_subtotal, v_shipping, 0, 0, v_total,
      v_fee, v_total - v_fee,
      v_fulfill, CASE WHEN v_fulfill = 'shipping' THEN p_shipping_address END,
      left(coalesce(p_customer_note, ''), 1000), p_request_id, now()+interval '65 minutes')
    RETURNING id INTO v_order_id;

    -- Line items snapshot the name, option, price and image as they were at
    -- purchase, so editing the product later cannot rewrite order history.
    INSERT INTO public.order_items (
      order_id, business_id, product_id, variant_id, product_name, variant_label,
      image_url, unit_price_cents, quantity, line_total_cents, inventory_reserved)
    SELECT v_order_id, p.business_id, p.id, v.id, p.name,
           CASE WHEN v.id IS NULL THEN NULL ELSE v.name || ': ' || v.value END,
           (SELECT coalesce(pi.thumbnail_url,pi.url) FROM public.product_images pi
             WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at LIMIT 1),
           coalesce(v.price_cents, p.price_cents), ci.quantity,
           coalesce(v.price_cents, p.price_cents) * ci.quantity, p.inventory_tracking AND v.id IS NOT NULL AND NOT v.unlimited_stock
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      LEFT JOIN public.product_variants v ON v.id = ci.variant_id
     WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id) AND p.business_id = v_bus.business_id;

    -- Reserve stock. The rows are already locked, so this is a safe read-modify.
    -- Shortfall is checked here too: the lock guarantees nothing else took the
    -- units between the check above and this update.
    IF EXISTS (
      SELECT 1
        FROM public.cart_items ci
        JOIN public.products p ON p.id = ci.product_id
        JOIN public.product_variants v ON v.id = ci.variant_id
       WHERE ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id)
         AND p.business_id = v_bus.business_id
         AND coalesce(p.inventory_tracking, true)
         AND NOT v.unlimited_stock
         AND (v.inventory_count IS NULL OR v.inventory_count < ci.quantity)) THEN
      RAISE EXCEPTION 'Not enough stock left for one of the items in your cart'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.product_variants v
       SET inventory_count = v.inventory_count - ci.quantity
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
     WHERE ci.variant_id = v.id
       AND ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id)
       AND p.business_id = v_bus.business_id
       AND coalesce(p.inventory_tracking, true)
       AND NOT v.unlimited_stock;

    -- The purchased lines leave the cart, so a retry after a payment failure
    -- cannot silently order twice.
    DELETE FROM public.cart_items ci
     USING public.products p
     WHERE ci.product_id = p.id
       AND ci.user_id = v_user AND p_business_id = (SELECT owner_product.business_id FROM public.products owner_product WHERE owner_product.id=ci.product_id)
       AND p.business_id = v_bus.business_id;

    order_id      := v_order_id;
    order_number  := v_order_no;
    business_id   := v_bus.business_id;
    business_name := v_bus.business_name;
    subtotal_cents := v_subtotal;
    shipping_cents := v_shipping;
    total_cents   := v_total;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_business_order(uuid,uuid,public.fulfillment_mode,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_business_order(uuid,uuid,public.fulfillment_mode,jsonb,text) TO authenticated;

-- Protect every order field, including provider references and purchase snapshots.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE(status) ON public.orders TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_paid_order_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('role',true) <> 'service_role' AND NEW.status='cancelled' THEN
  RAISE EXCEPTION 'Paid orders require a provider refund before cancellation';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_guard_cancellation ON public.orders;
CREATE TRIGGER orders_guard_cancellation BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_paid_order_cancellation();
CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_query        text DEFAULT NULL,
  p_category_id  uuid DEFAULT NULL,
  p_business_id  uuid DEFAULT NULL,
  p_fulfillment  public.fulfillment_mode DEFAULT NULL,
  p_min_cents    bigint DEFAULT NULL,
  p_max_cents    bigint DEFAULT NULL,
  p_sort         text DEFAULT 'recent',
  p_limit        integer DEFAULT 24,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  product_id      uuid,
  business_id     uuid,
  business_name   text,
  name            text,
  description     text,
  price_cents     bigint,
  currency        text,
  fulfillment     public.fulfillment_mode,
  image_url       text,
  rating_avg      numeric,
  review_count    bigint,
  location        text,
  published_at    timestamptz,
  is_public       boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH v_limit  AS (SELECT least(greatest(coalesce(p_limit, 24), 1), 60) AS n),
       v_offset AS (SELECT greatest(coalesce(p_offset, 0), 0) AS n),
       v_q      AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS t)
  SELECT p.id,
         p.business_id,
         a.name,
         p.name,
         p.description,
         p.price_cents,
         p.currency,
         p.fulfillment,
         (SELECT coalesce(pi.thumbnail_url,pi.url) FROM public.product_images pi
           WHERE pi.product_id = p.id
           ORDER BY pi.position, pi.created_at LIMIT 1),
         (SELECT round(avg(r.rating)::numeric, 2) FROM public.product_reviews r
           WHERE r.product_id = p.id),
         (SELECT count(*) FROM public.product_reviews r WHERE r.product_id = p.id),
         p.location,
         p.published_at,
         (p.status = 'approved' AND a.status = 'active') AS is_public
    FROM public.products p
    JOIN public.advertiser_accounts a ON a.id = p.business_id
   CROSS JOIN v_q
   WHERE p.status = 'approved' AND a.status = 'active'
     AND (v_q.t IS NULL
          OR p.name ILIKE '%' || v_q.t || '%'
          OR p.description ILIKE '%' || v_q.t || '%'
          OR EXISTS (SELECT 1 FROM unnest(p.tags) tg WHERE tg ILIKE '%' || v_q.t || '%')
          OR a.name ILIKE '%' || v_q.t || '%'
          OR EXISTS (SELECT 1 FROM product_categories c WHERE c.id=p.category_id AND c.name ILIKE '%' || v_q.t || '%'))
     AND (p_category_id IS NULL OR p.category_id = p_category_id)
     AND (p_business_id IS NULL OR p.business_id = p_business_id)
     -- A product tagged 'pickup' also satisfies a pickup search.
     AND (p_fulfillment IS NULL
          OR p.fulfillment = p_fulfillment OR p.fulfillment = 'both')
     AND (p_min_cents IS NULL OR p.price_cents >= p_min_cents)
     AND (p_max_cents IS NULL OR p.price_cents <= p_max_cents)
   ORDER BY
     CASE WHEN p_sort = 'price_asc'  THEN p.price_cents END ASC NULLS LAST,
     CASE WHEN p_sort = 'price_desc' THEN p.price_cents END DESC NULLS LAST,
     -- Trigram ranking makes "hoodies" find "Vintage Hoodie" as well as a typo.
     CASE WHEN v_q.t IS NOT NULL AND p_sort = 'relevance'
          THEN similarity(p.name, v_q.t) END DESC NULLS LAST,
     p.published_at DESC NULLS LAST,
     p.id
   LIMIT (SELECT n FROM v_limit) OFFSET (SELECT n FROM v_offset);
$function$;

REVOKE ALL ON FUNCTION public.search_marketplace(text, uuid, uuid, public.fulfillment_mode, bigint, bigint, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace(text, uuid, uuid, public.fulfillment_mode, bigint, bigint, text, integer, integer)
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_business_checkout_quote(p_business_id uuid, p_fulfillment public.fulfillment_mode) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE subtotal bigint; shipping bigint; threshold bigint; ready boolean; valid boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in'; END IF;
 SELECT coalesce(sum(q.line_total_cents),0), coalesce(sum(p.shipping_price_cents),0), min(p.free_shipping_threshold_cents), bool_and(q.is_available AND (p.fulfillment='both' OR p.fulfillment=p_fulfillment))
 INTO subtotal,shipping,threshold,valid FROM get_cart_quote() q JOIN products p ON p.id=q.product_id WHERE q.business_id=p_business_id;
 IF p_fulfillment='pickup' OR (threshold IS NOT NULL AND subtotal>=threshold) THEN shipping:=0; END IF;
 SELECT charges_enabled AND payouts_enabled INTO ready FROM business_stripe_accounts WHERE business_id=p_business_id;
 RETURN jsonb_build_object('subtotal',subtotal,'shipping',shipping,'total',subtotal+shipping,'currency','usd','ready',coalesce(ready,false),'valid',coalesce(valid,false));
END $$;
REVOKE ALL ON FUNCTION public.get_business_checkout_quote(uuid,public.fulfillment_mode) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_checkout_quote(uuid,public.fulfillment_mode) TO authenticated;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS context_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS context_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.open_commerce_conversation(p_business_id uuid, p_product_id uuid DEFAULT NULL, p_order_id uuid DEFAULT NULL, p_as_business boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE customer uuid:=auth.uid(); thread uuid;
BEGIN
 IF customer IS NULL THEN RAISE EXCEPTION 'Sign in'; END IF;
 IF p_order_id IS NOT NULL THEN
  SELECT customer_id INTO customer FROM orders WHERE id=p_order_id AND business_id=p_business_id AND (customer_id=auth.uid() OR (p_as_business AND can_message_business(p_business_id)));
  IF customer IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
 ELSIF p_as_business THEN RAISE EXCEPTION 'Choose a customer order to start a business conversation'; END IF;
 IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE id=p_product_id AND business_id=p_business_id AND is_public_product(id)) THEN RAISE EXCEPTION 'Product unavailable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM advertiser_accounts WHERE id=p_business_id AND status='active') THEN RAISE EXCEPTION 'Business unavailable'; END IF;
 IF NOT p_as_business AND is_business_member_of(p_business_id,auth.uid()) THEN RAISE EXCEPTION 'Open your business inbox to respond to customers'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(customer::text||p_business_id::text,0));
 SELECT c.id INTO thread FROM conversations c JOIN conversation_participants cp ON cp.conversation_id=c.id WHERE c.type='business' AND c.business_id=p_business_id AND cp.user_id=customer AND cp.role='member' ORDER BY c.created_at LIMIT 1;
 IF thread IS NULL THEN
  INSERT INTO conversations(type,business_id) VALUES('business',p_business_id) RETURNING id INTO thread;
  INSERT INTO conversation_participants(conversation_id,user_id,business_id) VALUES(thread,customer,NULL),(thread,NULL,p_business_id);
 END IF;
 UPDATE conversations SET context_product_id=coalesce(p_product_id,context_product_id),context_order_id=coalesce(p_order_id,context_order_id) WHERE id=thread;
 RETURN thread;
END $$;
REVOKE ALL ON FUNCTION public.open_commerce_conversation(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_commerce_conversation(uuid,uuid,uuid,boolean) TO authenticated;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notifications_identity ON public.notifications(user_id,business_id,created_at DESC);
-- A removed team member must not retain access to business notification bodies.
DROP POLICY IF EXISTS "Notification identity membership" ON public.notifications;
CREATE POLICY "Notification identity membership" ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
USING (business_id IS NULL OR public.is_business_member_of(business_id,auth.uid()))
WITH CHECK (business_id IS NULL OR public.is_business_member_of(business_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.notify_commerce_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
  INSERT INTO notifications(user_id,type,title,body,target_type,target_id) VALUES(NEW.customer_id,'system','Order '||NEW.order_number,NEW.status::text||' · Payment: '||NEW.payment_status::text,'order',NEW.id);
  INSERT INTO notifications(user_id,business_id,type,title,body,target_type,target_id)
  SELECT DISTINCT member_id,NEW.business_id,'system'::public.notification_type,'Order '||NEW.order_number,NEW.status::text||' · Payment: '||NEW.payment_status::text,'order',NEW.id
  FROM (SELECT user_id member_id FROM advertiser_accounts WHERE id=NEW.business_id UNION SELECT user_id FROM business_members WHERE business_id=NEW.business_id AND role IN ('owner','admin')) members;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commerce_order_notification ON public.orders;
CREATE TRIGGER commerce_order_notification AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_commerce_order();

CREATE OR REPLACE FUNCTION public.notify_on_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE business uuid; sender_name text;
BEGIN
 SELECT business_id INTO business FROM conversations WHERE id=NEW.conversation_id;
 IF NEW.sender_business_id IS NOT NULL THEN
  SELECT name INTO sender_name FROM advertiser_accounts WHERE id=NEW.sender_business_id;
 ELSE
  SELECT display_name INTO sender_name FROM profiles WHERE user_id=NEW.sender_id;
 END IF;
 INSERT INTO notifications(user_id,business_id,type,title,body,actor_id,target_type,target_id,message_id)
 SELECT cp.user_id,CASE WHEN business IS NOT NULL AND cp.role<>'member' THEN business END,'message'::public.notification_type,'New message from '||coalesce(sender_name,'Someone'),left(NEW.content,100),CASE WHEN NEW.sender_business_id IS NULL THEN NEW.sender_id END,'conversation',NEW.conversation_id,NEW.id
 FROM conversation_participants cp WHERE cp.conversation_id=NEW.conversation_id AND cp.user_id IS NOT NULL AND cp.user_id<>NEW.sender_id AND NOT cp.muted;
 RETURN NEW;
END $$;
-- Classify existing business inbox notifications without changing customer notifications.
UPDATE public.notifications n SET business_id=c.business_id
FROM public.conversations c, public.conversation_participants cp
WHERE n.target_type='conversation' AND n.target_id=c.id AND c.type='business'
AND cp.conversation_id=c.id AND cp.user_id=n.user_id AND cp.role<>'member' AND n.business_id IS NULL;

-- Read-only analysts cannot respond as the business. Existing owner/admin/advertiser roles remain.
CREATE OR REPLACE FUNCTION public.can_message_business(p_business_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM advertiser_accounts a WHERE a.id=p_business_id AND a.status='active' AND
 (a.user_id=auth.uid() OR EXISTS (SELECT 1 FROM business_members m WHERE m.business_id=a.id AND m.user_id=auth.uid() AND m.role::text IN ('owner','admin','advertiser'))));
$$;
CREATE OR REPLACE FUNCTION public.guard_message_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE business uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.sender_business_id IS DISTINCT FROM OLD.sender_business_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN RAISE EXCEPTION 'Message authorship is immutable'; END IF;
 IF TG_OP='INSERT' AND current_setting('role',true)<>'service_role' THEN
  SELECT business_id INTO business FROM conversations WHERE id=NEW.conversation_id;
  IF business IS NOT NULL AND is_business_member_of(business,auth.uid()) THEN
   IF NEW.sender_business_id IS DISTINCT FROM business OR NOT can_message_business(business) THEN RAISE EXCEPTION 'Reply using an authorized business identity'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS message_identity_guard ON public.messages;
CREATE TRIGGER message_identity_guard BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.guard_message_identity();

CREATE OR REPLACE FUNCTION public.validate_product_submission() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status IN ('pending_review','approved') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
  IF NEW.price_cents<=0 OR NOT EXISTS(SELECT 1 FROM product_images WHERE product_id=NEW.id) THEN RAISE EXCEPTION 'Add a price above zero and at least one product photo before publishing'; END IF;
  IF NEW.inventory_tracking AND NOT EXISTS(SELECT 1 FROM product_variants WHERE product_id=NEW.id AND is_active AND (unlimited_stock OR inventory_count IS NOT NULL)) THEN RAISE EXCEPTION 'Add a stock option before publishing'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_submission_validation ON public.products;
CREATE TRIGGER products_submission_validation BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_product_submission();

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS business_inbox_state text NOT NULL DEFAULT 'lead' CHECK(business_inbox_state IN ('lead','customer','archived'));
CREATE OR REPLACE FUNCTION public.set_business_inbox_state(p_conversation_id uuid,p_state text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_state NOT IN ('lead','customer','archived') THEN RAISE EXCEPTION 'Invalid inbox state'; END IF;
 UPDATE conversations SET business_inbox_state=p_state WHERE id=p_conversation_id AND can_message_business(business_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_business_inbox_state(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_business_inbox_state(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_message_notification_on_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.content IS DISTINCT FROM OLD.content THEN
  UPDATE notifications SET body=left(NEW.content,100) WHERE message_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_order_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_is_service boolean := coalesce(current_setting('role', true), '') = 'service_role';
BEGIN
  -- The total must always equal the sum of the parts. A webhook that corrects an
  -- amount has to correct the parts too; it cannot smuggle a total past this.
  IF NEW.total_cents <> NEW.subtotal_cents + NEW.shipping_cents + NEW.tax_cents - NEW.discount_cents THEN
    RAISE EXCEPTION 'Order total does not equal subtotal + shipping + tax - discount'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.platform_fee_cents + NEW.business_earnings_cents <> NEW.total_cents THEN
    RAISE EXCEPTION 'Order fee split does not equal the order total'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Money is frozen the moment the order exists. Corrections happen by
    -- cancelling and re-ordering, never by silently editing a total.
    IF NOT v_is_service AND (
         NEW.subtotal_cents    IS DISTINCT FROM OLD.subtotal_cents
      OR NEW.shipping_cents    IS DISTINCT FROM OLD.shipping_cents
      OR NEW.tax_cents         IS DISTINCT FROM OLD.tax_cents
      OR NEW.discount_cents    IS DISTINCT FROM OLD.discount_cents
      OR NEW.total_cents       IS DISTINCT FROM OLD.total_cents
      OR NEW.platform_fee_cents IS DISTINCT FROM OLD.platform_fee_cents
      OR NEW.business_earnings_cents IS DISTINCT FROM OLD.business_earnings_cents
      OR NEW.customer_id       IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id       IS DISTINCT FROM OLD.business_id
      OR NEW.currency          IS DISTINCT FROM OLD.currency
    ) THEN
      RAISE EXCEPTION 'Order amounts, customer and business are immutable after creation'
        USING ERRCODE = '42501';
    END IF;

    -- Only the payment webhook may assert that money moved.
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NOT v_is_service THEN
      RAISE EXCEPTION 'Only the payment provider can set payment status'
        USING ERRCODE = '42501';
    END IF;

    -- Fulfillment may only walk the legal edges, and the two actors get
    -- different whitelists.
    --
    -- A business admin drives *fulfilment* only. It must not be able to assert
    -- that money arrived: "paid" and "refunded" are facts about Stripe, not
    -- about a seller's opinion of their own order, so those edges belong to
    -- the webhook alone.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_service THEN
      IF NOT (
        (OLD.status = 'paid'       AND NEW.status IN ('processing', 'cancelled'))
     OR (OLD.status = 'processing' AND NEW.status IN ('ready', 'cancelled'))
     OR (OLD.status = 'ready' AND (NEW.status = 'shipped' OR (NEW.status='completed' AND OLD.fulfillment='pickup')))
     OR (OLD.status = 'shipped'    AND NEW.status = 'completed')
      ) THEN
        RAISE EXCEPTION 'A business cannot move an order from % to %', OLD.status, NEW.status
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_identity_conversation_summaries(p_business_id uuid DEFAULT NULL)
RETURNS TABLE(conversation_id uuid,last_message jsonb,unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,
 (SELECT jsonb_build_object('id',m.id,'content',m.content,'sender_id',m.sender_id,'created_at',m.created_at) FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1),
 (SELECT count(*) FROM messages m WHERE m.conversation_id=c.id AND m.created_at>coalesce(cp.last_read_at,'epoch'::timestamptz)
 AND CASE WHEN p_business_id IS NOT NULL THEN m.sender_business_id IS DISTINCT FROM p_business_id ELSE m.sender_id<>auth.uid() END)
 FROM conversations c JOIN conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=auth.uid()
 WHERE CASE WHEN p_business_id IS NOT NULL THEN c.business_id=p_business_id AND is_business_member_of(p_business_id,auth.uid()) ELSE c.type<>'business' OR cp.role='member' END
 ORDER BY c.updated_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_identity_conversation_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_identity_conversation_summaries(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS messages_conversation_recency ON public.messages(conversation_id,created_at DESC);

-- Direct clients cannot forge order/business notifications; trusted triggers run
-- under their SECURITY DEFINER owner and continue to emit real events.
CREATE OR REPLACE FUNCTION public.guard_commerce_notification_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (NEW.business_id IS NOT NULL OR NEW.target_type='order') THEN RAISE EXCEPTION 'Commerce notifications are created by the server'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commerce_notification_origin ON public.notifications;
CREATE TRIGGER commerce_notification_origin BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_notification_origin();
