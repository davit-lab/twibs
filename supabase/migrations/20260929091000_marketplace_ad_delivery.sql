-- Marketplace promotions extend the existing campaign, targeting, payment,
-- moderation, event and analytics pipeline. No parallel ad system is created.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS marketplace_destination_type text,
  ADD COLUMN IF NOT EXISTS destination_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace_placement text;

ALTER TABLE public.advertisements
  ADD COLUMN IF NOT EXISTS creative_image_url text;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_marketplace_destination_check
    CHECK (marketplace_destination_type IS NULL OR marketplace_destination_type IN ('product', 'store', 'business'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_marketplace_placement_check
    CHECK (marketplace_placement IS NULL OR marketplace_placement IN ('showcase', 'product_grid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_marketplace_delivery
  ON public.campaigns (status, marketplace_placement, start_at, end_at)
  WHERE marketplace_placement IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_marketplace_campaign(
  p_advertiser_id uuid,
  p_destination_type text,
  p_product_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_total_budget_cents bigint DEFAULT NULL,
  p_budget_type public.campaign_budget_type DEFAULT 'total',
  p_daily_budget_cents bigint DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_targeting jsonb DEFAULT NULL,
  p_marketplace_placement text DEFAULT 'showcase'
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
  v_product public.products;
  v_image text;
  v_label text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_business_campaigns(p_advertiser_id) THEN
    RAISE EXCEPTION 'You do not have permission to promote this business';
  END IF;
  IF p_destination_type NOT IN ('product', 'store', 'business') THEN
    RAISE EXCEPTION 'Choose a supported Marketplace destination';
  END IF;
  IF p_marketplace_placement NOT IN ('showcase', 'product_grid') THEN
    RAISE EXCEPTION 'Unsupported Marketplace placement';
  END IF;

  IF p_destination_type = 'product' THEN
    SELECT * INTO v_product FROM public.products
      WHERE id = p_product_id AND business_id = p_advertiser_id;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product does not belong to this business'; END IF;
    IF v_product.status <> 'approved' THEN RAISE EXCEPTION 'Only a live, approved product can be promoted'; END IF;
    SELECT pi.url INTO v_image FROM public.product_images pi
      WHERE pi.product_id = v_product.id ORDER BY pi.position, pi.created_at LIMIT 1;
    v_label := v_product.name;
  ELSE
    SELECT COALESCE(aa.cover_url, aa.avatar_url), aa.name
      INTO v_image, v_label
    FROM public.advertiser_accounts aa WHERE aa.id = p_advertiser_id AND aa.status = 'active';
    IF v_label IS NULL THEN RAISE EXCEPTION 'Business is not active'; END IF;
  END IF;

  SELECT * INTO v_campaign FROM public.create_business_campaign(
    p_advertiser_id := p_advertiser_id,
    p_name := COALESCE(NULLIF(trim(p_name), ''), 'Marketplace: ' || v_label),
    p_objective := 'profile_visits',
    p_total_budget_cents := p_total_budget_cents,
    p_currency := 'USD',
    p_budget_type := p_budget_type,
    p_daily_budget_cents := p_daily_budget_cents,
    p_start_at := COALESCE(p_start_at, now()),
    p_end_at := p_end_at,
    p_description := left(NULLIF(trim(p_description), ''), 300),
    p_cta := CASE WHEN p_destination_type = 'product' THEN 'Shop now' ELSE 'Visit store' END,
    p_cta_url := NULL,
    p_targeting := p_targeting
  );

  UPDATE public.campaigns SET
    marketplace_destination_type = p_destination_type,
    destination_product_id = CASE WHEN p_destination_type = 'product' THEN p_product_id ELSE NULL END,
    marketplace_placement = p_marketplace_placement
  WHERE id = v_campaign.id RETURNING * INTO v_campaign;

  UPDATE public.advertisements SET creative_image_url = v_image WHERE campaign_id = v_campaign.id;
  RETURN v_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_campaign(uuid,text,uuid,text,text,bigint,public.campaign_budget_type,bigint,timestamptz,timestamptz,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_marketplace_campaign(uuid,text,uuid,text,text,bigint,public.campaign_budget_type,bigint,timestamptz,timestamptz,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_marketplace_ads(
  p_viewer_id uuid,
  p_limit integer DEFAULT 3,
  p_frequency_cap integer DEFAULT 3
)
RETURNS TABLE (
  advertisement_id uuid,
  campaign_id uuid,
  destination_type text,
  product_id uuid,
  headline text,
  description text,
  cta text,
  image_url text,
  business_id uuid,
  business_name text,
  business_username text,
  business_avatar_url text,
  product_name text,
  product_price_cents bigint,
  product_currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    c.id,
    c.marketplace_destination_type,
    c.destination_product_id,
    COALESCE(a.headline, c.headline, p.name, aa.name),
    COALESCE(a.description, c.description),
    COALESCE(a.cta, c.cta, CASE WHEN p.id IS NOT NULL THEN 'Shop now' ELSE 'Visit store' END),
    COALESCE(a.creative_image_url, pi.url, aa.cover_url, aa.avatar_url),
    aa.id,
    aa.name,
    aa.username,
    aa.avatar_url,
    p.name,
    p.price_cents,
    p.currency
  FROM public.campaigns c
  JOIN public.advertisements a ON a.campaign_id = c.id
  JOIN public.advertiser_accounts aa ON aa.id = c.advertiser_id AND aa.status = 'active'
  LEFT JOIN public.products p ON p.id = c.destination_product_id
  LEFT JOIN LATERAL (
    SELECT i.url FROM public.product_images i
    WHERE i.product_id = p.id ORDER BY i.position, i.created_at LIMIT 1
  ) pi ON true
  WHERE auth.uid() IS NOT NULL
    AND p_viewer_id = auth.uid()
    AND c.marketplace_placement = 'showcase'
    AND c.marketplace_destination_type IN ('product', 'store', 'business')
    AND c.status = 'active'
    AND c.paid_at IS NOT NULL
    AND c.start_at <= now() AND c.end_at >= now()
    AND c.spend_cents < c.total_budget_cents
    AND c.user_id <> p_viewer_id
    AND (c.marketplace_destination_type <> 'product' OR (p.status = 'approved' AND p.business_id = aa.id))
    AND (
      SELECT count(*) FROM public.campaign_events e
      WHERE e.campaign_id = c.id
        AND e.viewer_user_id = p_viewer_id
        AND e.event_type = 'impression'
        AND e.placement = 'marketplace'
        AND e.created_at >= now() - interval '1 day'
    ) < greatest(1, least(p_frequency_cap, 10))
  ORDER BY
    (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = c.id AND e.viewer_user_id = p_viewer_id) ASC,
    md5(c.id::text || p_viewer_id::text || current_date::text)
  LIMIT greatest(0, least(p_limit, 5));
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_ads(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_ads(uuid,integer,integer) TO authenticated;
