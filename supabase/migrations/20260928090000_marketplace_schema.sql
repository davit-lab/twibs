-- ============================================================================
-- Twibs Marketplace — foundation schema
-- ----------------------------------------------------------------------------
-- Audit result that drives this file (verified against the linked database):
--
--   * There is NO existing product / order / cart / inventory / variant /
--     review / payout table. `payments` is ad-campaign billing (it has
--     campaign_id and no order_id), which is a different domain from a customer
--     paying a business, so it is deliberately NOT reused here.
--   * `book_purchases` + `author_stripe_accounts` are the existing real-money
--     precedent (platform fee + Connect destination charge, see
--     supabase/functions/create-book-checkout). The Marketplace mirrors that
--     money model but is owned by a *business*, not a user, so seller payment
--     state lives in `business_stripe_accounts` below.
--   * The business identity table is `advertiser_accounts`; membership and
--     authorization already have canonical helpers `is_business_member_of()`
--     and `can_manage_asset_folder()`. Both are reused rather than reinvented.
--
-- Core rule enforced by the shape of this schema: a product is owned by
-- `business_id`. `created_by` records *which member typed it in* for audit and
-- is never used for authorization or attribution.
--
-- Money is stored as integer cents. No float, no client-supplied amount.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enumerations
-- ----------------------------------------------------------------------------

-- Moderation is a state machine, not a free-text flag, so an invalid state
-- cannot be stored. 'draft' and 'rejected'/'removed' are never publicly visible.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'product_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.product_status AS ENUM (
      'draft',           -- seller has not submitted it
      'pending_review',  -- submitted, awaiting moderation
      'approved',        -- publicly listable
      'rejected',        -- moderation refused; seller sees the reason
      'removed'          -- taken down after publication
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'fulfillment_mode' AND n.nspname = 'public') THEN
    CREATE TYPE public.fulfillment_mode AS ENUM ('shipping', 'pickup', 'both');
  END IF;

  -- Order lifecycle and money lifecycle are deliberately separate columns on
  -- `orders`: a business may ship an order that is still awaiting a payout
  -- webhook, and a payment may settle while the order is cancelled.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'order_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.order_status AS ENUM (
      'pending', 'paid', 'processing', 'ready', 'shipped', 'completed', 'cancelled', 'refunded'
    );
  END IF;

  -- Namespaced deliberately: the schema already has a `payment_status` enum
  -- (pending / succeeded / failed / refunded) belonging to `payments`, the
  -- ad-campaign billing table. Reusing it would merge ad spend and customer
  -- order money into one vocabulary and one status column, which is exactly the
  -- kind of conflation that later makes refunds and payouts unreadable.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'marketplace_payment_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.marketplace_payment_status AS ENUM (
      'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'product_event_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.product_event_type AS ENUM ('view', 'save', 'inquiry', 'share');
  END IF;
END;
$$;

-- Marketplace notifications. The existing enum is shared with social features,
-- so the new values are appended rather than replacing it.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_created';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_paid';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_status_changed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'refund_status';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_order';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'product_moderation';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'low_inventory';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'payout_update';

-- ----------------------------------------------------------------------------
-- 2. Centralised categories
-- ----------------------------------------------------------------------------
-- Seeded in the database rather than hardcoded in components, so the Marketplace
-- home, search, filters and the product form all read one list.
CREATE TABLE IF NOT EXISTS public.product_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_categories IS
  'Centralised Marketplace taxonomy. Filter UIs must read this table, never a hardcoded list.';

INSERT INTO public.product_categories (slug, name, sort_order) VALUES
  ('fashion',      'Fashion',     10),
  ('electronics',  'Electronics', 20),
  ('beauty',       'Beauty',      30),
  ('home',         'Home',        40),
  ('food',         'Food',        50),
  ('sports',       'Sports',      60),
  ('books',        'Books',       70),
  ('accessories',  'Accessories', 80),
  ('services',     'Services',    90),
  ('other',        'Other',      100)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- ----------------------------------------------------------------------------
-- 3. Products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Authoritative commerce owner. Everything (moderation, inventory, orders,
  -- revenue) keys off this, never off the owner's personal user id.
  business_id   uuid NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  -- Audit only: which member authored the listing.
  created_by    uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 140),
  description   text CHECK (description IS NULL OR char_length(description) <= 8000),
  category_id   uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  tags          text[] NOT NULL DEFAULT '{}',

  price_cents   bigint NOT NULL CHECK (price_cents >= 0),
  currency      text NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),

  status        public.product_status NOT NULL DEFAULT 'draft',
  -- A moderation rejection reason is shown to the seller, never to shoppers.
  moderation_note text,

  fulfillment   public.fulfillment_mode NOT NULL DEFAULT 'shipping',
  shipping_price_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_price_cents >= 0),
  -- NULL = never free-shipping. Guarded so it can only be raised above zero.
  free_shipping_threshold_cents bigint CHECK (free_shipping_threshold_cents IS NULL OR free_shipping_threshold_cents > 0),

  inventory_tracking boolean NOT NULL DEFAULT true,
  -- City / region the business chooses to expose. Deliberately coarse: no
  -- precise private address is ever published here.
  location      text,

  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Server-owned timestamps: a draft must never look published.
  CONSTRAINT products_published_at_check
    CHECK (status = 'draft' OR published_at IS NOT NULL)
);

COMMENT ON COLUMN public.products.business_id IS
  'Authoritative commerce owner. A product belongs to a business identity, not to a personal user.';
COMMENT ON COLUMN public.products.created_by IS
  'Authoring member, for audit only. Never used for ownership or attribution.';

CREATE INDEX IF NOT EXISTS idx_products_business        ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_status          ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_category        ON public.products(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_published       ON public.products(published_at DESC NULLS LAST);
-- Discovery reads are "approved products, newest first", optionally scoped to a
-- category or business, so this is the index the Marketplace home rides on.
CREATE INDEX IF NOT EXISTS idx_products_marketplace
  ON public.products(status, published_at DESC)
  WHERE status = 'approved';

-- Search support. The existing app filters with ILIKE, so a trigram index backs
-- substring matching; the tsvector backs ranked whole-word matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

-- Business name search (Marketplace search returns businesses as well as
-- products) is indexed on the business table itself.
CREATE INDEX IF NOT EXISTS idx_advertiser_accounts_name_trgm
  ON public.advertiser_accounts USING gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. Product images
-- ----------------------------------------------------------------------------
-- Several per product, ordered. `storage_path` is the authoritative key and
-- `url` the renderable public URL, so a CDN change does not rewrite the table.
CREATE TABLE IF NOT EXISTS public.product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url         text NOT NULL,
  alt_text    text,
  width       integer CHECK (width IS NULL OR width > 0),
  height      integer CHECK (height IS NULL OR height > 0),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON public.product_images(product_id, position);

-- ----------------------------------------------------------------------------
-- 5. Variants
-- ----------------------------------------------------------------------------
-- price_cents NULL means "inherit the product price"; inventory_count NULL
-- combined with unlimited_stock means "not tracked". Keeping NULL meaningful
-- avoids storing a duplicated copy of the parent price that can drift.
CREATE TABLE IF NOT EXISTS public.product_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- e.g. 'Size' / 'Color' / 'Model'
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  value         text NOT NULL CHECK (char_length(btrim(value)) BETWEEN 1 AND 60),
  sku           text,
  price_cents   bigint CHECK (price_cents IS NULL OR price_cents >= 0),
  -- Only meaningful when the parent tracks inventory and this variant does not
  -- run unlimited.
  inventory_count integer CHECK (inventory_count IS NULL OR inventory_count >= 0),
  unlimited_stock  boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_variants_name_value_key UNIQUE (product_id, name, value)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants(product_id, position);

-- ----------------------------------------------------------------------------
-- 6. Business store settings
-- ----------------------------------------------------------------------------
-- A store is opt-in per business, so switching it on does not imply the business
-- has products, and existing profiles are unaffected.
CREATE TABLE IF NOT EXISTS public.business_store_settings (
  business_id   uuid PRIMARY KEY REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  is_store_enabled boolean NOT NULL DEFAULT false,
  tagline       text CHECK (tagline IS NULL OR char_length(tagline) <= 140),
  about         text CHECK (about IS NULL OR char_length(about) <= 4000),
  hero_image_url text,
  shipping_note text,
  pickup_note   text,
  -- Where a business asks to be found. Coarse by design.
  city          text,
  region        text,
  country       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. Business payout onboarding
-- ----------------------------------------------------------------------------
-- Mirrors author_stripe_accounts, but keyed by business_id: a marketplace seller
-- is the business, so payout state must not be a property of the human who
-- happens to own the account today.
CREATE TABLE IF NOT EXISTS public.business_stripe_accounts (
  business_id        uuid PRIMARY KEY REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  stripe_account_id  text NOT NULL,
  onboarding_complete boolean NOT NULL DEFAULT false,
  charges_enabled    boolean NOT NULL DEFAULT false,
  payouts_enabled    boolean NOT NULL DEFAULT false,
  -- Stripe's own requirements, surfaced verbatim in Business Setup rather than
  -- invented by Twibs.
  currently_due      jsonb,
  disabled_reason    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_stripe_accounts IS
  'Stripe Connect onboarding state for a business seller. Own account of the business, not of a user.';

-- ----------------------------------------------------------------------------
-- 8. Cart
-- ----------------------------------------------------------------------------
-- One row per (user, product, variant). Grouping by business, and therefore the
-- one-order-per-business split at checkout, is derived from the product rather
-- than stored, so it cannot disagree with the catalogue.
CREATE TABLE IF NOT EXISTS public.cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity    integer NOT NULL CHECK (quantity > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- variant_id is nullable, so a plain unique() would not dedupe the
-- "no variant selected" case: NULLs are distinct in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_line
  ON public.cart_items(user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items(user_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- 9. Orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human reference shown in the UI and in support conversations.
  order_number  text NOT NULL UNIQUE,
  business_id   uuid NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE RESTRICT,
  customer_id   uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

  status        public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.marketplace_payment_status NOT NULL DEFAULT 'unpaid',

  currency      text NOT NULL DEFAULT 'usd',
  -- Every one of these is computed server-side at order creation. There is no
  -- path by which a client can write a total.
  subtotal_cents   bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents   bigint NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents        bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  discount_cents   bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents      bigint NOT NULL CHECK (total_cents >= 0),
  -- Platform fee / seller split, mirroring book_purchases so money reporting
  -- is consistent across the platform.
  platform_fee_cents  bigint NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  business_earnings_cents bigint NOT NULL DEFAULT 0 CHECK (business_earnings_cents >= 0),

  fulfillment   public.fulfillment_mode NOT NULL DEFAULT 'shipping',
  -- Collected only to the depth the buyer must supply for fulfilment.
  shipping_address jsonb,
  customer_note text,

  stripe_checkout_session_id text,
  stripe_payment_intent_id  text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz,
  completed_at  timestamptz,

  -- The stored total must equal the sum of its parts, so a bug in the
  -- calculation cannot produce an order that disagrees with its own line items.
  CONSTRAINT orders_total_check
    CHECK (total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents),
  CONSTRAINT orders_earnings_check
    CHECK (platform_fee_cents + business_earnings_cents = total_cents)
);

CREATE INDEX IF NOT EXISTS idx_orders_business  ON public.orders(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer  ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON public.orders(business_id, status, created_at DESC);
-- The webhook looks orders up by Stripe session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session
  ON public.orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Line items snapshot name, variant and unit price at purchase time. A later
-- product edit must not rewrite the history of what was actually bought.
CREATE TABLE IF NOT EXISTS public.order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE RESTRICT,
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id    uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  variant_label text,
  image_url     text,
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  quantity      integer NOT NULL CHECK (quantity > 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order    ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_business ON public.order_items(business_id);

-- ----------------------------------------------------------------------------
-- 10. Saves
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_products_unique UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_products_user ON public.saved_products(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 11. Reviews
-- ----------------------------------------------------------------------------
-- Eligibility is not a UI concern: a review requires a completed order for this
-- customer and this product, enforced by the policy and by
-- create_product_review() in the commerce migration.
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  -- Set only when the author really completed a purchase of this product.
  order_id    uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text CHECK (body IS NULL OR char_length(body) <= 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_reviews_unique_author UNIQUE (product_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON public.product_reviews(product_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 12. Product events (real analytics only)
-- ----------------------------------------------------------------------------
-- Append-only. Every row is a real interaction, so a sales figure can always be
-- traced back to orders and these events can never be fabricated by seeding.
CREATE TABLE IF NOT EXISTS public.product_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  event_type  public.product_event_type NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_product  ON public.product_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_business ON public.product_events(business_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 13. Product image storage
-- ----------------------------------------------------------------------------
-- Folder layout is "<business_id>/<file>" so can_manage_asset_folder() applies
-- unchanged: it already treats a leading business id as "business admins only".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
