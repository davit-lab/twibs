-- Contextual, paced Marketplace ad selection. Eligibility, spending and
-- targeting remain server-side; the client only supplies the current public
-- Marketplace context.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS marketplace_category_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS marketplace_frequency_cap integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS marketplace_delivery_strategy text NOT NULL DEFAULT 'paced';

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_marketplace_frequency_cap_check
    CHECK (marketplace_frequency_cap BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_marketplace_delivery_strategy_check
    CHECK (marketplace_delivery_strategy IN ('paced', 'accelerated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_marketplace_grid_product_check
    CHECK (marketplace_placement IS DISTINCT FROM 'product_grid' OR marketplace_destination_type = 'product');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ad_hidden_by_users (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertisement_id uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, advertisement_id)
);
ALTER TABLE public.ad_hidden_by_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their hidden ads" ON public.ad_hidden_by_users;
CREATE POLICY "Users manage their hidden ads" ON public.ad_hidden_by_users
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.ad_hidden_by_users TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ad_hidden_user_campaign
  ON public.ad_hidden_by_users(user_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_viewer_campaign_placement
  ON public.campaign_events(viewer_user_id, campaign_id, placement, created_at DESC);

CREATE OR REPLACE FUNCTION public.hide_marketplace_ad(p_advertisement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_campaign uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to hide an ad'; END IF;
  SELECT campaign_id INTO v_campaign FROM public.advertisements WHERE id = p_advertisement_id;
  IF v_campaign IS NULL THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
  INSERT INTO public.ad_hidden_by_users(user_id, advertisement_id, campaign_id)
  VALUES(auth.uid(), p_advertisement_id, v_campaign) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hide_marketplace_ad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_marketplace_ad(uuid) TO authenticated;

-- Preserve the public call shape while adding optional Marketplace context.
DROP FUNCTION IF EXISTS public.get_marketplace_ads(uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.get_marketplace_ads(
  p_viewer_id uuid,
  p_placement text DEFAULT 'showcase',
  p_category_id uuid DEFAULT NULL,
  p_search_context text DEFAULT NULL,
  p_session_key text DEFAULT NULL,
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
  product_currency text,
  why_text text,
  delivery_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH eligible AS (
  SELECT
    a.id advertisement_id, c.id campaign_id, c.marketplace_destination_type destination_type,
    c.destination_product_id product_id,
    COALESCE(a.headline, c.headline, p.name, aa.name) headline,
    COALESCE(a.description, c.description) description,
    COALESCE(a.cta, c.cta, CASE WHEN p.id IS NOT NULL THEN 'Shop now' ELSE 'Visit store' END) cta,
    COALESCE(a.creative_image_url, pi.url, aa.cover_url, aa.avatar_url) image_url,
    aa.id business_id, aa.name business_name, aa.username business_username,
    aa.avatar_url business_avatar_url, p.name product_name, p.price_cents product_price_cents,
    p.currency product_currency, p.category_id,
    ct.automatic, ct.locations, ct.languages,
    greatest(1, least(c.marketplace_frequency_cap, p_frequency_cap, 10)) effective_cap,
    CASE
      WHEN p_category_id IS NOT NULL AND p.category_id = p_category_id THEN 6.0
      WHEN p_category_id IS NOT NULL THEN 0.0
      ELSE 1.0
    END
    + CASE WHEN NULLIF(trim(p_search_context), '') IS NOT NULL AND (
        p.name ILIKE '%' || trim(p_search_context) || '%'
        OR COALESCE(p.description, '') ILIKE '%' || trim(p_search_context) || '%'
        OR EXISTS (SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE '%' || trim(p_search_context) || '%')
      ) THEN 5.0 ELSE 0.0 END
    + CASE WHEN p.category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.product_events pe
        JOIN public.products viewed ON viewed.id = pe.product_id
        WHERE pe.user_id = p_viewer_id AND viewed.category_id = p.category_id
          AND pe.created_at >= now() - interval '90 days'
      ) THEN 3.0 ELSE 0.0 END
    + CASE WHEN p.category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.saved_products sp
        JOIN public.products saved ON saved.id = sp.product_id
        WHERE sp.user_id = p_viewer_id AND saved.category_id = p.category_id
      ) THEN 2.0 ELSE 0.0 END
    + CASE WHEN cardinality(ct.locations) > 0 AND EXISTS (
        SELECT 1 FROM public.profiles viewer
        WHERE viewer.user_id = p_viewer_id
          AND EXISTS (SELECT 1 FROM unnest(ct.locations) wanted WHERE viewer.location ILIKE '%' || wanted || '%')
      ) THEN 2.0 ELSE 0.0 END
    + CASE WHEN COALESCE(a.creative_image_url, pi.url, aa.cover_url, aa.avatar_url) IS NOT NULL THEN 1.0 ELSE 0.0 END
    + least(2.0, COALESCE((
        SELECT count(*) FILTER (WHERE e.event_type = 'click')::numeric
          / NULLIF(count(*) FILTER (WHERE e.event_type = 'impression'), 0) * 10
        FROM public.campaign_events e WHERE e.campaign_id = c.id
      ), 0)) AS relevance_score,
    CASE
      WHEN c.marketplace_delivery_strategy = 'accelerated' THEN 1.0
      WHEN c.total_budget_cents <= 0 THEN 0.0
      WHEN c.spend_cents::numeric / c.total_budget_cents
        <= greatest(0.05, extract(epoch FROM (now() - c.start_at)) / NULLIF(extract(epoch FROM (c.end_at - c.start_at)), 0)) + 0.10 THEN 1.35
      WHEN c.spend_cents::numeric / c.total_budget_cents
        > extract(epoch FROM (now() - c.start_at)) / NULLIF(extract(epoch FROM (c.end_at - c.start_at)), 0) + 0.25 THEN 0.35
      ELSE 0.8
    END AS pacing_factor,
    CASE
      WHEN p_category_id IS NOT NULL AND p.category_id = p_category_id THEN 'Related to this Marketplace category'
      WHEN NULLIF(trim(p_search_context), '') IS NOT NULL AND p.name ILIKE '%' || trim(p_search_context) || '%' THEN 'Related to your Marketplace search'
      WHEN p.category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.product_events pe JOIN public.products viewed ON viewed.id=pe.product_id
        WHERE pe.user_id=p_viewer_id AND viewed.category_id=p.category_id AND pe.created_at>=now()-interval '90 days'
      ) THEN 'Related to products you viewed'
      WHEN cardinality(ct.locations) > 0 THEN 'Available in your region'
      ELSE 'Sponsored by a business on Twibs'
    END why_text,
    ((abs(mod(hashtextextended(c.id::text || p_viewer_id::text || COALESCE(p_session_key, current_date::text) || p_placement, 0), 1000000)) + 1)::numeric / 1000001) draw
  FROM public.campaigns c
  JOIN public.advertisements a ON a.campaign_id = c.id
  JOIN public.advertiser_accounts aa ON aa.id = c.advertiser_id AND aa.status = 'active'
  JOIN public.campaign_targeting ct ON ct.campaign_id = c.id
  LEFT JOIN public.products p ON p.id = c.destination_product_id
  LEFT JOIN LATERAL (
    SELECT i.url FROM public.product_images i WHERE i.product_id = p.id ORDER BY i.position, i.created_at LIMIT 1
  ) pi ON true
  WHERE auth.uid() IS NOT NULL AND p_viewer_id = auth.uid()
    AND p_placement IN ('showcase', 'product_grid')
    AND c.marketplace_placement = p_placement
    AND c.marketplace_destination_type IN ('product', 'store', 'business')
    AND (p_placement <> 'product_grid' OR c.marketplace_destination_type = 'product')
    AND c.status = 'active' AND c.paid_at IS NOT NULL
    AND c.start_at <= now() AND c.end_at >= now()
    AND c.spend_cents + c.cost_per_impression_cents <= c.total_budget_cents
    AND (c.daily_budget_cents IS NULL OR COALESCE((SELECT s.spend_cents FROM public.campaign_daily_stats s WHERE s.campaign_id=c.id AND s.stat_date=current_date),0) + c.cost_per_impression_cents <= c.daily_budget_cents)
    AND NOT public.is_business_member_of(aa.id, p_viewer_id)
    AND (c.marketplace_destination_type <> 'product' OR (
      p.status = 'approved' AND p.business_id = aa.id
      AND (NOT p.inventory_tracking OR EXISTS (
        SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id AND v.is_active
          AND (v.unlimited_stock OR COALESCE(v.inventory_count,0) > 0)
      ))
    ))
    AND (ct.automatic OR cardinality(ct.locations)=0 OR EXISTS (
      SELECT 1 FROM public.profiles viewer WHERE viewer.user_id=p_viewer_id
        AND EXISTS (SELECT 1 FROM unnest(ct.locations) wanted WHERE viewer.location ILIKE '%' || wanted || '%')
    ))
    AND NOT EXISTS (SELECT 1 FROM public.ad_hidden_by_users h WHERE h.user_id=p_viewer_id AND h.advertisement_id=a.id)
    AND NOT EXISTS (SELECT 1 FROM public.ad_reports r WHERE r.user_id=p_viewer_id AND r.advertisement_id=a.id)
    AND (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id=c.id AND e.viewer_user_id=p_viewer_id AND e.event_type='impression' AND e.placement='marketplace' AND e.created_at>=now()-interval '1 day')
      < greatest(1, least(c.marketplace_frequency_cap, p_frequency_cap, 10))
    AND NOT EXISTS (SELECT 1 FROM public.campaign_events recent WHERE recent.campaign_id=c.id AND recent.viewer_user_id=p_viewer_id AND recent.event_type='impression' AND recent.placement='marketplace' AND recent.created_at>=now()-interval '30 minutes')
), weighted AS (
  SELECT eligible.*,
    greatest(0.1, relevance_score * pacing_factor) delivery_score,
    -ln(greatest(draw, 0.000001)) / greatest(0.1, relevance_score * pacing_factor) selection_key
  FROM eligible
), diverse AS (
  SELECT weighted.*, row_number() OVER (PARTITION BY business_id ORDER BY selection_key) business_rank
  FROM weighted
)
SELECT advertisement_id, campaign_id, destination_type, product_id, headline, description, cta,
  image_url, business_id, business_name, business_username, business_avatar_url,
  product_name, product_price_cents, product_currency, why_text, delivery_score
FROM diverse
ORDER BY business_rank, selection_key
LIMIT greatest(0, least(p_limit, 5));
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_ads(uuid,text,uuid,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_ads(uuid,text,uuid,text,text,integer,integer) TO authenticated;
