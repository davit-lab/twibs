-- ============================================================================
-- Twibs Marketplace — RLS, authorization and the order state machine
-- ----------------------------------------------------------------------------
-- Authorization model, reusing the helpers the rest of the platform already
-- uses instead of introducing a parallel one:
--
--   is_business_member_of(business_id, user_id)  -- "is this person in the biz"
--   can_admin_business(business_id)              -- owner or admin = may write
--
-- can_admin_business is the same predicate behind ROLE_CAN.canManage on the
-- frontend, so "can manage" means one thing across the app.
--
-- Three rules drive every policy below:
--
--   1. The client never chooses the owner. Product rows must carry the business
--      they claim, membership is proven server-side, and business_id cannot be
--      rewritten after insert.
--   2. The client never chooses the money. `orders` has no INSERT policy at
--      all: an order is created by the payment edge function with the service
--      role, after it has re-priced the cart from the catalogue. Money columns
--      are frozen once written.
--   3. The client never chooses the payment state. Only the Stripe webhook
--      (service role) may move payment_status, and order status may only move
--      along the legal edges.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Visibility helpers
-- ----------------------------------------------------------------------------

-- A product is publicly readable only if it is approved AND its business is
-- live. A suspended business must not keep selling, and a draft/rejected
-- product must never leak to a non-member.
CREATE OR REPLACE FUNCTION public.is_public_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.advertiser_accounts a ON a.id = p.business_id
    WHERE p.id = p_product_id
      AND p.status = 'approved'
      AND a.status = 'active'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_public_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_product(uuid) TO anon, authenticated, service_role;

-- Or the caller is allowed to see it anyway because they run the business.
CREATE OR REPLACE FUNCTION public.can_view_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = p_product_id
      AND public.is_business_member_of(p.business_id, auth.uid())
  ) OR public.is_public_product(p_product_id);
$function$;

REVOKE ALL ON FUNCTION public.can_view_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_product(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_touch ON public.products;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS product_variants_touch ON public.product_variants;
CREATE TRIGGER product_variants_touch BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS orders_touch ON public.orders;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS cart_items_touch ON public.cart_items;
CREATE TRIGGER cart_items_touch BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS business_store_settings_touch ON public.business_store_settings;
CREATE TRIGGER business_store_settings_touch BEFORE UPDATE ON public.business_store_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Ownership is immutable
-- ----------------------------------------------------------------------------
-- Without this, a business admin could move a product onto a business they do
-- not own (or hand a listing to a competitor) in a single UPDATE, because RLS
-- only checks the row being written.
CREATE OR REPLACE FUNCTION public.guard_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'A product cannot be moved to a different business'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'The authoring member cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_guard_ownership ON public.products;
CREATE TRIGGER products_guard_ownership BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_ownership();

-- A published product must always carry a published_at, and moderation status is
-- only advanced by the moderation path, never by the seller.
CREATE OR REPLACE FUNCTION public.guard_product_moderation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Sellers may draft and submit, but cannot approve themselves.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      IF current_setting('role', true) <> 'service_role' THEN
        RAISE EXCEPTION 'Only moderation can set a product to %', NEW.status
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('approved', 'pending_review') AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_guard_moderation ON public.products;
CREATE TRIGGER products_guard_moderation BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_moderation();

-- ----------------------------------------------------------------------------
-- 4. Order money + state machine
-- ----------------------------------------------------------------------------
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
     OR (OLD.status = 'ready'      AND NEW.status IN ('shipped', 'cancelled'))
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

DROP TRIGGER IF EXISTS orders_guard_invariants ON public.orders;
CREATE TRIGGER orders_guard_invariants BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_invariants();

-- ----------------------------------------------------------------------------
-- 5. Grant the policy helpers to every role that can reach the tables
-- ----------------------------------------------------------------------------
-- Postgres permission-checks a function referenced by an RLS policy at plan
-- time, for *every* role that queries the table -- not only the role whose
-- policy happens to match. `orders`, `order_items` and `product_events` all
-- have an admin-only SELECT policy that calls can_admin_business(), so without
-- this grant an anonymous read does not return "no rows", it raises:
--
--     ERROR: permission denied for function can_admin_business
--
-- which would turn a public page into a 500 instead of an empty list.
--
-- The grant is safe: the helpers are SECURITY DEFINER, they return a boolean,
-- and for an anonymous caller auth.uid() is NULL so the answer is always false.
GRANT EXECUTE ON FUNCTION public.can_admin_business(uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RLS — enable everywhere
-- ----------------------------------------------------------------------------
ALTER TABLE public.product_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6. Categories
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Categories are publicly readable" ON public.product_categories;
CREATE POLICY "Categories are publicly readable" ON public.product_categories
  FOR SELECT USING (is_active);

-- ----------------------------------------------------------------------------
-- 7. Products
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Approved products of active businesses are public" ON public.products;
CREATE POLICY "Approved products of active businesses are public" ON public.products
  FOR SELECT USING (
    status = 'approved'
    AND EXISTS (SELECT 1 FROM public.advertiser_accounts a
                 WHERE a.id = products.business_id AND a.status = 'active')
  );

DROP POLICY IF EXISTS "Business members see their own catalogue" ON public.products;
CREATE POLICY "Business members see their own catalogue" ON public.products
  FOR SELECT USING (public.is_business_member_of(business_id, auth.uid()));

-- INSERT: the row must name a business the caller actually belongs to. created_by
-- is pinned to the caller so authorship cannot be forged either.
DROP POLICY IF EXISTS "Business admins create products" ON public.products;
CREATE POLICY "Business admins create products" ON public.products
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.can_admin_business(business_id)
  );

DROP POLICY IF EXISTS "Business admins update products" ON public.products;
CREATE POLICY "Business admins update products" ON public.products
  FOR UPDATE USING (public.can_admin_business(business_id))
                 WITH CHECK (public.can_admin_business(business_id));

DROP POLICY IF EXISTS "Business admins delete products" ON public.products;
CREATE POLICY "Business admins delete products" ON public.products
  FOR DELETE USING (public.can_admin_business(business_id));

-- ----------------------------------------------------------------------------
-- 8. Product images and variants
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Visible products have visible images" ON public.product_images;
CREATE POLICY "Visible products have visible images" ON public.product_images
  FOR SELECT USING (public.can_view_product(product_id));

DROP POLICY IF EXISTS "Business admins manage product images" ON public.product_images;
CREATE POLICY "Business admins manage product images" ON public.product_images
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p
                   WHERE p.id = product_images.product_id
                     AND public.can_admin_business(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p
                       WHERE p.id = product_images.product_id
                         AND public.can_admin_business(p.business_id)));

DROP POLICY IF EXISTS "Visible products have visible variants" ON public.product_variants;
CREATE POLICY "Visible products have visible variants" ON public.product_variants
  FOR SELECT USING (public.can_view_product(product_id));

DROP POLICY IF EXISTS "Business admins manage variants" ON public.product_variants;
CREATE POLICY "Business admins manage variants" ON public.product_variants
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p
                   WHERE p.id = product_variants.product_id
                     AND public.can_admin_business(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p
                       WHERE p.id = product_variants.product_id
                         AND public.can_admin_business(p.business_id)));

-- ----------------------------------------------------------------------------
-- 9. Saved products (private)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers manage their own saved products" ON public.saved_products;
CREATE POLICY "Customers manage their own saved products" ON public.saved_products
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. Cart (private)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers manage their own cart" ON public.cart_items;
CREATE POLICY "Customers manage their own cart" ON public.cart_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. Orders
-- ----------------------------------------------------------------------------
-- Deliberately NO insert policy: an order is created server-side by the payment
-- edge function using the service role, after re-pricing from the catalogue.
-- A client therefore cannot forge an order, a total, or a paid status.

DROP POLICY IF EXISTS "Customers read their own orders" ON public.orders;
CREATE POLICY "Customers read their own orders" ON public.orders
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Business admins read their orders" ON public.orders;
CREATE POLICY "Business admins read their orders" ON public.orders
  FOR SELECT USING (public.can_admin_business(business_id));

-- Fulfilment updates only. The trigger refuses illegal transitions and refuses
-- any change to money or payment state, so this grant cannot be used to fake
-- a sale.
DROP POLICY IF EXISTS "Business admins update order fulfilment" ON public.orders;
CREATE POLICY "Business admins update order fulfilment" ON public.orders
  FOR UPDATE USING (public.can_admin_business(business_id))
                 WITH CHECK (public.can_admin_business(business_id));

DROP POLICY IF EXISTS "Visible orders have visible items" ON public.order_items;
CREATE POLICY "Visible orders have visible items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o
             WHERE o.id = order_items.order_id
               AND (o.customer_id = auth.uid() OR public.can_admin_business(o.business_id)))
  );

-- ----------------------------------------------------------------------------
-- 12. Reviews
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Reviews are public" ON public.product_reviews;
CREATE POLICY "Reviews are public" ON public.product_reviews
  FOR SELECT USING (true);

-- Verified purchase is enforced against real orders, so a review cannot exist
-- for someone who never bought the product.
DROP POLICY IF EXISTS "Verified buyers can review" ON public.product_reviews;
CREATE POLICY "Verified buyers can review" ON public.product_reviews
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND public.is_public_product(product_id)
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.product_id = product_reviews.product_id
        AND o.customer_id = auth.uid()
        AND o.status IN ('completed', 'shipped', 'paid', 'processing', 'ready')
    )
  );

DROP POLICY IF EXISTS "Authors manage their own reviews" ON public.product_reviews;
CREATE POLICY "Authors manage their own reviews" ON public.product_reviews
  FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authors delete their own reviews" ON public.product_reviews;
CREATE POLICY "Authors delete their own reviews" ON public.product_reviews
  FOR DELETE USING (author_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 13. Product events
-- ----------------------------------------------------------------------------
-- business_id is pinned to the product's real owner in the policy, so a client
-- cannot attribute a view or a sale to somebody else's analytics.
DROP POLICY IF EXISTS "Anyone records a product event" ON public.product_events;
CREATE POLICY "Anyone records a product event" ON public.product_events
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.products p
                 WHERE p.id = product_events.product_id
                   AND p.business_id = product_events.business_id
                   AND p.status = 'approved')
  );

DROP POLICY IF EXISTS "Business admins read their product events" ON public.product_events;
CREATE POLICY "Business admins read their product events" ON public.product_events
  FOR SELECT USING (public.can_admin_business(business_id));

-- ----------------------------------------------------------------------------
-- 14. Store settings
-- ----------------------------------------------------------------------------
-- The store header is public (a business profile shows a Store tab) but the
-- enable/disable switch and every other field is business-admin only.
DROP POLICY IF EXISTS "Store settings are publicly readable" ON public.business_store_settings;
CREATE POLICY "Store settings are publicly readable" ON public.business_store_settings
  FOR SELECT USING (
    is_store_enabled
    AND EXISTS (SELECT 1 FROM public.advertiser_accounts a
                 WHERE a.id = business_store_settings.business_id AND a.status = 'active')
  );

DROP POLICY IF EXISTS "Business admins read their store settings" ON public.business_store_settings;
CREATE POLICY "Business admins read their store settings" ON public.business_store_settings
  FOR SELECT USING (public.can_admin_business(business_id));

DROP POLICY IF EXISTS "Business admins manage their store settings" ON public.business_store_settings;
CREATE POLICY "Business admins manage their store settings" ON public.business_store_settings
  FOR ALL USING (public.can_admin_business(business_id))
              WITH CHECK (public.can_admin_business(business_id));

-- ----------------------------------------------------------------------------
-- 15. Business payout accounts
-- ----------------------------------------------------------------------------
-- Read-only to business admins, and deliberately no INSERT/UPDATE policy:
-- only the Stripe onboarding edge function may create or advance a connected
-- account. A client that could write charges_enabled would be able to declare
-- itself paid out.
DROP POLICY IF EXISTS "Business admins read their payout account" ON public.business_stripe_accounts;
CREATE POLICY "Business admins read their payout account" ON public.business_stripe_accounts
  FOR SELECT USING (public.can_admin_business(business_id));

-- ----------------------------------------------------------------------------
-- 16. Product image storage
-- ----------------------------------------------------------------------------
-- Folder layout is "<business_id>/...", so can_manage_asset_folder() — which
-- already understands a leading business id — is the whole policy. This mirrors
-- the avatars/covers precedent exactly.
DROP POLICY IF EXISTS "Product images are publicly readable" ON storage.objects;
CREATE POLICY "Product images are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Business admins upload product images" ON storage.objects;
CREATE POLICY "Business admins upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Business admins update product images" ON storage.objects;
CREATE POLICY "Business admins update product images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS "Business admins delete product images" ON storage.objects;
CREATE POLICY "Business admins delete product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );
