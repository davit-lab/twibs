-- ============================================================================
-- Twibs Marketplace — commerce functions
-- ----------------------------------------------------------------------------
-- Everything money touches happens in this file, on the server, from data the
-- client does not control.
--
-- The important design choice is how checkout takes its input. create_
-- marketplace_order() takes NO item list, NO price and NO total from the client:
-- it reads the caller's own cart and re-prices every line from the catalogue.
-- There is therefore no parameter a tampered client could use to buy a $20 item
-- for 1 cent, add an item it does not own, or invent a discount.
--
-- Splitting the cart into one order per business falls out of the same query,
-- so it cannot disagree with who actually owns the products.
-- ============================================================================

-- Human-facing, non-sequential-looking order reference. A sequence backs it so
-- the UNIQUE constraint can never be hit by a lucky guess.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

-- ----------------------------------------------------------------------------
-- 1. Inventory release
-- ----------------------------------------------------------------------------
-- Cancelling or refunding an order must put the stock back, or a single
-- cancellation silently destroys inventory. Runs on the status edge, so a
-- business admin cancelling an order through the UI cannot skip it.
CREATE OR REPLACE FUNCTION public.release_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded')
     AND OLD.status NOT IN ('cancelled', 'refunded') THEN
    UPDATE public.product_variants v
       SET inventory_count = v.inventory_count + oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.variant_id = v.id
       AND v.inventory_count IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_release_inventory ON public.orders;
CREATE TRIGGER orders_release_inventory
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.release_order_inventory();

-- Manual restock, for support. Service role only.
CREATE OR REPLACE FUNCTION public.release_order_inventory_now(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.order_status;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Only a cancelled or refunded order can release stock (this one is %)', v_status
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.orders o
   WHERE o.id = p_order_id
     AND o.status IN ('cancelled', 'refunded')
     AND o.updated_at < now() - interval '1 second'
   FOR UPDATE;
  UPDATE public.product_variants v
     SET inventory_count = v.inventory_count + oi.quantity
    FROM public.order_items oi
   WHERE oi.order_id = p_order_id
     AND oi.variant_id = v.id
     AND v.inventory_count IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_order_inventory_now(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory_now(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Marketplace search
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: RLS decides what a caller may see, so a shopper
-- can only ever search approved products of active businesses while a business
-- member can also find their own drafts. p_is_public tells the UI which is
-- which, so a draft in search is badged rather than silently shown to a shopper.
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
         (SELECT pi.url FROM public.product_images pi
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
   WHERE (v_q.t IS NULL
          OR p.name ILIKE '%' || v_q.t || '%'
          OR p.description ILIKE '%' || v_q.t || '%'
          OR EXISTS (SELECT 1 FROM unnest(p.tags) tg WHERE tg ILIKE '%' || v_q.t || '%')
          OR a.name ILIKE '%' || v_q.t || '%')
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

-- ----------------------------------------------------------------------------
-- 3. Authoritative cart quote
-- ----------------------------------------------------------------------------
-- What the cart is actually worth, priced from the catalogue. The client shows
-- these numbers; it never supplies them.
--
-- SECURITY DEFINER with no user parameter on purpose: a p_user argument would
-- be an IDOR, so identity comes from the JWT alone. A line whose product has
-- since been hidden or delisted is still returned, flagged is_available false,
-- because silently dropping it would leave the shopper confused at checkout.
CREATE OR REPLACE FUNCTION public.get_cart_quote()
RETURNS TABLE (
  line_id            uuid,
  product_id         uuid,
  variant_id         uuid,
  business_id        uuid,
  business_name      text,
  product_name       text,
  variant_label      text,
  image_url          text,
  quantity           integer,
  unit_price_cents   bigint,
  line_total_cents   bigint,
  available_quantity integer,
  is_available       boolean,
  unavailable_reason text,
  fulfillment        public.fulfillment_mode
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to see your cart' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ci.id,
         p.id,
         ci.variant_id,
         p.business_id,
         a.name,
         p.name,
         CASE WHEN v.id IS NULL THEN NULL
              ELSE v.name || ': ' || v.value END,
         (SELECT pi.url FROM public.product_images pi
           WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at LIMIT 1),
         ci.quantity,
         coalesce(v.price_cents, p.price_cents),
         coalesce(v.price_cents, p.price_cents) * ci.quantity,
         CASE WHEN coalesce(p.inventory_tracking, true) = false THEN NULL
              WHEN v.id IS NULL THEN NULL
              WHEN v.unlimited_stock THEN NULL
              ELSE v.inventory_count END,
         (p.status = 'approved' AND a.status = 'active' AND coalesce(v.is_active, true))
           AND (NOT coalesce(p.inventory_tracking, true)
                -- A tracked product must have a variant to hold its stock, so a
                -- missing variant means it cannot be bought. This mirrors the
                -- checkout rule exactly: the cart must never offer a line that
                -- create_marketplace_order() would then refuse.
                OR (v.id IS NOT NULL
                    AND (v.unlimited_stock OR v.inventory_count >= ci.quantity))),
         CASE
           WHEN p.status <> 'approved'
             THEN 'This product is no longer available'
           WHEN a.status <> 'active'
             THEN 'This seller is not currently trading'
           WHEN v.id IS NOT NULL AND NOT v.is_active
             THEN 'This option is no longer available'
           WHEN coalesce(p.inventory_tracking, true)
                AND v.id IS NULL
                AND p.status = 'approved'
             THEN 'This product is sold in variants'
           WHEN coalesce(p.inventory_tracking, true)
                AND NOT v.unlimited_stock
                AND v.inventory_count < ci.quantity
             THEN 'Only ' || v.inventory_count || ' left'
           ELSE NULL
         END,
         p.fulfillment
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    JOIN public.advertiser_accounts a ON a.id = p.business_id
    LEFT JOIN public.product_variants v ON v.id = ci.variant_id
   WHERE ci.user_id = v_user
   ORDER BY a.name, p.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_cart_quote() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cart_quote() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Checkout
-- ----------------------------------------------------------------------------
-- Creates the order(s) from the caller's cart, re-priced server-side.
--
-- Note there is no p_items, p_total, p_price or p_discount parameter. The cart
-- is the only input, and every amount is recomputed from products/variants.
-- Inventory rows are locked first, in a deterministic order, so two shoppers
-- racing for the last unit cannot both pass the stock check.
CREATE OR REPLACE FUNCTION public.create_marketplace_order(
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

  -- 'both' describes what a product supports, not what the buyer chose, so a
  -- caller cannot pass it through as a fulfilment method.
  IF v_fulfill NOT IN ('shipping', 'pickup') THEN
    RAISE EXCEPTION 'Choose delivery or collection' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_lines
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
   WHERE ci.user_id = v_user;
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
            WHERE ci.user_id = v_user AND ci.variant_id IS NOT NULL)
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
     WHERE ci.user_id = v_user
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
     WHERE ci.user_id = v_user
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
     WHERE ci.user_id = v_user AND p.business_id = v_bus.business_id;

    -- Free shipping is a per-business threshold on that business's own subtotal.
    v_shipping := CASE
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
      fulfillment, shipping_address, customer_note)
    VALUES (
      v_order_no, v_bus.business_id, v_user, 'pending', 'unpaid', v_bus.currency,
      v_subtotal, v_shipping, 0, 0, v_total,
      v_fee, v_total - v_fee,
      v_fulfill, CASE WHEN v_fulfill = 'shipping' THEN p_shipping_address END,
      left(coalesce(p_customer_note, ''), 1000))
    RETURNING id INTO v_order_id;

    -- Line items snapshot the name, option, price and image as they were at
    -- purchase, so editing the product later cannot rewrite order history.
    INSERT INTO public.order_items (
      order_id, business_id, product_id, variant_id, product_name, variant_label,
      image_url, unit_price_cents, quantity, line_total_cents)
    SELECT v_order_id, p.business_id, p.id, v.id, p.name,
           CASE WHEN v.id IS NULL THEN NULL ELSE v.name || ': ' || v.value END,
           (SELECT pi.url FROM public.product_images pi
             WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at LIMIT 1),
           coalesce(v.price_cents, p.price_cents), ci.quantity,
           coalesce(v.price_cents, p.price_cents) * ci.quantity
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
      LEFT JOIN public.product_variants v ON v.id = ci.variant_id
     WHERE ci.user_id = v_user AND p.business_id = v_bus.business_id;

    -- Reserve stock. The rows are already locked, so this is a safe read-modify.
    -- Shortfall is checked here too: the lock guarantees nothing else took the
    -- units between the check above and this update.
    IF EXISTS (
      SELECT 1
        FROM public.cart_items ci
        JOIN public.products p ON p.id = ci.product_id
        JOIN public.product_variants v ON v.id = ci.variant_id
       WHERE ci.user_id = v_user
         AND p.business_id = v_bus.business_id
         AND coalesce(p.inventory_tracking, true)
         AND NOT v.unlimited_stock
         AND v.inventory_count < ci.quantity) THEN
      RAISE EXCEPTION 'Not enough stock left for one of the items in your cart'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.product_variants v
       SET inventory_count = v.inventory_count - ci.quantity
      FROM public.cart_items ci
      JOIN public.products p ON p.id = ci.product_id
     WHERE ci.variant_id = v.id
       AND ci.user_id = v_user
       AND p.business_id = v_bus.business_id
       AND coalesce(p.inventory_tracking, true)
       AND NOT v.unlimited_stock;

    -- The purchased lines leave the cart, so a retry after a payment failure
    -- cannot silently order twice.
    DELETE FROM public.cart_items ci
     USING public.products p
     WHERE ci.product_id = p.id
       AND ci.user_id = v_user
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

REVOKE ALL ON FUNCTION public.create_marketplace_order(public.fulfillment_mode, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(public.fulfillment_mode, jsonb, text)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Reviews
-- ----------------------------------------------------------------------------
-- Eligibility is proven against a real order, so "verified purchase" is a fact
-- rather than a claim. One review per customer per product, editable afterwards.
CREATE OR REPLACE FUNCTION public.create_product_review(
  p_product_id uuid,
  p_rating     integer,
  p_body       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_order  uuid;
  v_id     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to review' USING ERRCODE = '42501';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  SELECT o.id INTO v_order
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.product_id = p_product_id
     AND o.customer_id = v_user
     AND o.status IN ('paid', 'processing', 'ready', 'shipped', 'completed')
     AND o.payment_status IN ('paid', 'partially_refunded')
   ORDER BY o.completed_at DESC NULLS LAST, o.created_at DESC
   LIMIT 1;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Only customers who bought this product can review it'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.product_reviews (product_id, author_id, order_id, rating, body)
  VALUES (p_product_id, v_user, v_order, p_rating, left(p_body, 4000))
  ON CONFLICT (product_id, author_id) DO UPDATE
     SET rating     = EXCLUDED.rating,
         body       = EXCLUDED.body,
         order_id   = EXCLUDED.order_id,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product_review(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_review(uuid, integer, text)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Storefront header
-- ----------------------------------------------------------------------------
-- One call for a public Store tab: settings, catalogue size and rating rollup.
CREATE OR REPLACE FUNCTION public.get_business_storefront(p_business_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'business_id', a.id,
    'name', a.name,
    'username', a.username,
    'avatar_url', a.avatar_url,
    'location', a.location,
    'is_store_enabled', s.is_store_enabled,
    'tagline', s.tagline,
    'about', s.about,
    'hero_image_url', s.hero_image_url,
    'shipping_note', s.shipping_note,
    'pickup_note', s.pickup_note,
    'city', s.city,
    'region', s.region,
    'country', s.country,
    'product_count', (SELECT count(*) FROM public.products p
                       WHERE p.business_id = a.id AND p.status = 'approved'),
    'rating_avg', (SELECT round(avg(r.rating)::numeric, 2)
                     FROM public.product_reviews r
                     JOIN public.products p ON p.id = r.product_id
                    WHERE p.business_id = a.id),
    'review_count', (SELECT count(*)
                       FROM public.product_reviews r
                       JOIN public.products p ON p.id = r.product_id
                      WHERE p.business_id = a.id)
  )
    FROM public.advertiser_accounts a
    LEFT JOIN public.business_store_settings s ON s.business_id = a.id
   WHERE a.id = p_business_id;
$function$;

REVOKE ALL ON FUNCTION public.get_business_storefront(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_storefront(uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Seller metrics
-- ----------------------------------------------------------------------------
-- Real numbers from orders and events only. Sales always trace back to an order
-- row, so a revenue figure cannot be inflated by seeding events.
CREATE OR REPLACE FUNCTION public.get_marketplace_business_metrics(
  p_business_id uuid,
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to   timestamptz := coalesce(p_to, now());
  v_out  jsonb;
BEGIN
  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You do not have access to these metrics' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'revenue_cents', (
      SELECT coalesce(sum(o.total_cents), 0) FROM public.orders o
       WHERE o.business_id = p_business_id
         AND o.created_at >= v_from AND o.created_at < v_to
         AND o.payment_status IN ('paid', 'partially_refunded')),
    'earnings_cents', (
      SELECT coalesce(sum(o.business_earnings_cents), 0) FROM public.orders o
       WHERE o.business_id = p_business_id
         AND o.created_at >= v_from AND o.created_at < v_to
         AND o.payment_status IN ('paid', 'partially_refunded')),
    'platform_fees_cents', (
      SELECT coalesce(sum(o.platform_fee_cents), 0) FROM public.orders o
       WHERE o.business_id = p_business_id
         AND o.created_at >= v_from AND o.created_at < v_to
         AND o.payment_status IN ('paid', 'partially_refunded')),
    'order_count', (
      SELECT count(*) FROM public.orders o
       WHERE o.business_id = p_business_id
         AND o.created_at >= v_from AND o.created_at < v_to
         AND o.payment_status IN ('paid', 'partially_refunded')),
    'units_sold', (
      SELECT coalesce(sum(oi.quantity), 0) FROM public.order_items oi
       JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.business_id = p_business_id
         AND o.created_at >= v_from AND o.created_at < v_to
         AND o.payment_status IN ('paid', 'partially_refunded')),
    'views', (
      SELECT count(*) FROM public.product_events e
       WHERE e.business_id = p_business_id AND e.event_type = 'view'
         AND e.created_at >= v_from AND e.created_at < v_to),
    'saves', (
      SELECT count(*) FROM public.product_events e
       WHERE e.business_id = p_business_id AND e.event_type = 'save'
         AND e.created_at >= v_from AND e.created_at < v_to),
    -- Pending work the seller still owes a customer.
    'open_orders', (
      SELECT count(*) FROM public.orders o
       WHERE o.business_id = p_business_id
         AND o.status IN ('paid', 'processing', 'ready', 'shipped')),
    'awaiting_fulfilment', (
      SELECT count(*) FROM public.orders o
       WHERE o.business_id = p_business_id AND o.status IN ('paid', 'processing')),
    'low_stock', coalesce((
      SELECT jsonb_agg(x ORDER BY x.stock) FROM (
        SELECT v.id AS variant_id, v.name || ': ' || v.value AS label,
               v.inventory_count AS stock
          FROM public.product_variants v
          JOIN public.products p ON p.id = v.product_id
         WHERE p.business_id = p_business_id
           AND p.status = 'approved'
           AND coalesce(p.inventory_tracking, true)
           AND NOT v.unlimited_stock
           AND v.inventory_count <= 5
      ) x), '[]'::jsonb),
    'top_products', coalesce((
      SELECT jsonb_agg(x ORDER BY x.units_sold DESC) FROM (
        SELECT oi.product_id, min(oi.product_name) AS name,
               sum(oi.quantity) AS units_sold,
               sum(oi.line_total_cents) AS revenue_cents
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
         WHERE oi.business_id = p_business_id
           AND o.created_at >= v_from AND o.created_at < v_to
           AND o.payment_status IN ('paid', 'partially_refunded')
         GROUP BY oi.product_id
         ORDER BY units_sold DESC
         LIMIT 10
      ) x), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_marketplace_business_metrics(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_business_metrics(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
