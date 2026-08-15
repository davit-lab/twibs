-- =============================================
-- ADVERTISING & POST-BOOSTING SYSTEM
-- =============================================
-- Adds professional advertiser identities, campaigns, advertisements,
-- audience targeting, event tracking, analytics, payments, and ad reports.
--
-- Design notes
-- ------------
-- * All privileged mutations go through SECURITY DEFINER functions so that
--   spend / impression / click counters can never be written by a client.
-- * Campaigns can only reach "active" through: payment confirmation
--   (provider or admin) -> admin approval. A user cannot self-activate.
-- * No fake data: every analytics number is derived from real rows in
--   campaign_events / campaign_daily_stats / campaigns.

BEGIN;

-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.advertiser_account_type AS ENUM ('personal', 'business', 'creator');
CREATE TYPE public.advertiser_status AS ENUM ('active', 'suspended');
CREATE TYPE public.campaign_objective AS ENUM ('reach', 'profile_visits', 'engagement', 'followers');
CREATE TYPE public.campaign_status AS ENUM (
  'draft', 'pending_payment', 'pending_review', 'scheduled',
  'active', 'paused', 'completed', 'cancelled', 'rejected'
);
CREATE TYPE public.campaign_budget_type AS ENUM ('daily', 'total');
CREATE TYPE public.ad_event_type AS ENUM (
  'impression', 'click', 'profile_visit', 'like', 'comment',
  'share', 'save', 'follow', 'website_click', 'conversion'
);
CREATE TYPE public.ad_placement AS ENUM ('feed', 'explore');
CREATE TYPE public.payment_provider AS ENUM ('stripe', 'manual');
CREATE TYPE public.payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE public.ad_report_status AS ENUM ('open', 'reviewing', 'dismissed', 'actioned');

-- =============================================
-- ADVERTISER ACCOUNTS
-- =============================================
CREATE TABLE public.advertiser_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type public.advertiser_account_type NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  website TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  location TEXT,
  status public.advertiser_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT advertiser_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT advertiser_username_length CHECK (char_length(username) BETWEEN 3 AND 30),
  CONSTRAINT advertiser_username_format CHECK (username ~ '^[a-zA-Z0-9_]+$'),
  CONSTRAINT advertiser_contact_email_format CHECK (
    contact_email IS NULL OR contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  CONSTRAINT advertiser_website_format CHECK (
    website IS NULL OR website ~ '^https?://'
  )
);

CREATE INDEX idx_advertiser_accounts_user ON public.advertiser_accounts(user_id);
CREATE INDEX idx_advertiser_accounts_type ON public.advertiser_accounts(account_type);
CREATE INDEX idx_advertiser_accounts_status ON public.advertiser_accounts(status);

ALTER TABLE public.advertiser_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advertiser accounts are viewable by signed-in users"
  ON public.advertiser_accounts FOR SELECT
  USING (status = 'active' OR user_id = auth.uid() OR public.is_admin_or_moderator());

CREATE POLICY "Owners can update their advertiser accounts"
  ON public.advertiser_accounts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can delete their advertiser accounts"
  ON public.advertiser_accounts FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- CAMPAIGNS
-- =============================================
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_id UUID NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  objective public.campaign_objective NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  budget_type public.campaign_budget_type NOT NULL DEFAULT 'total',
  total_budget_cents BIGINT NOT NULL,
  daily_budget_cents BIGINT,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  headline TEXT,
  description TEXT,
  cta TEXT,
  cta_url TEXT,
  -- Server-persisted audience estimate (from real platform data at submit time)
  estimated_reach_min INT,
  estimated_reach_max INT,
  estimated_impressions INT,
  cost_per_impression_cents BIGINT NOT NULL DEFAULT 0,
  -- Server-maintained spend / delivery counters (RPC only)
  spend_cents BIGINT NOT NULL DEFAULT 0,
  impressions_delivered INT NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  moderation_note TEXT,
  paid_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT campaign_budget_positive CHECK (total_budget_cents > 0),
  CONSTRAINT campaign_daily_budget_positive CHECK (daily_budget_cents IS NULL OR daily_budget_cents > 0),
  CONSTRAINT campaign_daily_within_total CHECK (daily_budget_cents IS NULL OR daily_budget_cents <= total_budget_cents),
  CONSTRAINT campaign_dates_valid CHECK (end_at > start_at),
  CONSTRAINT campaign_currency_code CHECK (char_length(currency) = 3)
);

CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_user ON public.campaigns(user_id);
CREATE INDEX idx_campaigns_advertiser ON public.campaigns(advertiser_id);
CREATE INDEX idx_campaigns_post ON public.campaigns(post_id);
CREATE INDEX idx_campaigns_dates ON public.campaigns(start_at, end_at);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaigns are readable by owner and staff"
  ON public.campaigns FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_moderator());

-- =============================================
-- CAMPAIGN TARGETING (1:1 with campaign)
-- =============================================
CREATE TABLE public.campaign_targeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
  automatic BOOLEAN NOT NULL DEFAULT true,
  locations TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  interests UUID[] NOT NULL DEFAULT '{}',
  min_age INT,
  max_age INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_targeting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign targeting readable by owner and staff"
  ON public.campaign_targeting FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.user_id = auth.uid() OR public.is_admin_or_moderator())
    )
  );

-- =============================================
-- ADVERTISEMENTS (1:1 with campaign)
-- =============================================
CREATE TABLE public.advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  headline TEXT,
  description TEXT,
  cta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advertisements_post ON public.advertisements(post_id);

ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advertisements readable by owner and staff"
  ON public.advertisements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.user_id = auth.uid() OR public.is_admin_or_moderator())
    )
  );

-- =============================================
-- CAMPAIGN EVENTS (real impression / interaction tracking)
-- =============================================
CREATE TABLE public.campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  advertisement_id UUID REFERENCES public.advertisements(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.ad_event_type NOT NULL,
  placement public.ad_placement NOT NULL DEFAULT 'feed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_events_campaign_type ON public.campaign_events(campaign_id, event_type);
CREATE INDEX idx_campaign_events_campaign_time ON public.campaign_events(campaign_id, created_at);
CREATE INDEX idx_campaign_events_ad ON public.campaign_events(advertisement_id);
CREATE INDEX idx_campaign_events_viewer ON public.campaign_events(viewer_user_id, created_at);

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign events readable by owner and staff"
  ON public.campaign_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.user_id = auth.uid() OR public.is_admin_or_moderator())
    )
  );

-- =============================================
-- CAMPAIGN DAILY STATS (server-aggregated)
-- =============================================
CREATE TABLE public.campaign_daily_stats (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  impressions INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  profile_visits INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  follows INT NOT NULL DEFAULT 0,
  website_clicks INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  spend_cents BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, stat_date)
);

CREATE INDEX idx_campaign_daily_stats_date ON public.campaign_daily_stats(stat_date);

ALTER TABLE public.campaign_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign daily stats readable by owner and staff"
  ON public.campaign_daily_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.user_id = auth.uid() OR public.is_admin_or_moderator())
    )
  );

-- =============================================
-- PAYMENTS
-- =============================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.payment_provider NOT NULL,
  provider_payment_id TEXT,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_campaign ON public.payments(campaign_id);
CREATE INDEX idx_payments_user ON public.payments(user_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments readable by owner and staff"
  ON public.payments FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_moderator());

-- =============================================
-- AD REPORTS
-- =============================================
CREATE TABLE public.ad_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id UUID NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status public.ad_report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (advertisement_id, user_id)
);

CREATE INDEX idx_ad_reports_status ON public.ad_reports(status);
CREATE INDEX idx_ad_reports_ad ON public.ad_reports(advertisement_id);

ALTER TABLE public.ad_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad reports readable by staff and reporter"
  ON public.ad_reports FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_moderator());

CREATE POLICY "Authenticated users can report ads"
  ON public.ad_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- GRANTS (authenticated, non-admin direct reads)
-- =============================================
GRANT SELECT ON public.advertiser_accounts, public.campaigns, public.campaign_targeting,
  public.advertisements, public.campaign_events, public.campaign_daily_stats,
  public.payments TO authenticated;
GRANT INSERT ON public.ad_reports TO authenticated;

-- =============================================
-- HELPERS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_campaign_or_null(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.campaigns WHERE id = p_campaign_id;
$$;

-- =============================================
-- AUDIENCE ESTIMATION ENGINE
-- Uses real platform data only:
--   * active profiles (not soft-deleted)
--   * real user interests (user_interests)
--   * real user language preference (user_preferences)
--   * real profile location
-- Returns a clearly-labeled preliminary range, never a guarantee.
-- =============================================
CREATE OR REPLACE FUNCTION public.estimate_audience(
  p_automatic BOOLEAN DEFAULT true,
  p_locations TEXT[] DEFAULT '{}',
  p_languages TEXT[] DEFAULT '{}',
  p_interests UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  total_active_users INT,
  matched_users INT,
  reach_min INT,
  reach_max INT,
  estimated_impressions INT,
  sufficient_data BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_matched INT;
  v_has_interest BOOLEAN;
  v_has_language BOOLEAN;
  v_has_location BOOLEAN;
BEGIN
  SELECT count(*) INTO v_total FROM public.profiles WHERE deleted_at IS NULL;

  v_has_interest := COALESCE(array_length(p_interests, 1), 0) > 0;
  v_has_language := COALESCE(array_length(p_languages, 1), 0) > 0;
  v_has_location := COALESCE(array_length(p_locations, 1), 0) > 0;

  IF p_automatic OR (NOT v_has_interest AND NOT v_has_language AND NOT v_has_location) THEN
    v_matched := v_total;
  ELSE
    SELECT count(*) INTO v_matched
    FROM public.profiles p
    WHERE p.deleted_at IS NULL
      AND (NOT v_has_interest OR EXISTS (
        SELECT 1 FROM public.user_interests ui
        WHERE ui.user_id = p.user_id AND ui.category_id = ANY(p_interests)
      ))
      AND (NOT v_has_language OR EXISTS (
        SELECT 1 FROM public.user_preferences up
        WHERE up.user_id = p.user_id AND up.language = ANY(p_languages)
      ))
      AND (NOT v_has_location OR (
        p.location IS NOT NULL
        AND p.location <> ''
        AND lower(p.location) = ANY (
          SELECT lower(x) FROM unnest(p_locations) AS x
        )
      ));
  END IF;

  total_active_users := v_total;
  matched_users := v_matched;

  -- Preliminary range based on the platform's current audience size and the
  -- available feed inventory. Deliberately conservative and clearly labeled
  -- as an estimate in the UI.
  reach_min := floor(v_matched * 0.15);
  reach_max := floor(v_matched * 0.40);
  estimated_impressions := floor(reach_max * 2.2);
  sufficient_data := v_total >= 10 AND v_matched > 0;

  RETURN NEXT;
END;
$$;

-- =============================================
-- PROFESSIONAL ACCOUNT RPCs
-- =============================================
CREATE OR REPLACE FUNCTION public.create_advertiser_account(
  p_account_type public.advertiser_account_type,
  p_name TEXT,
  p_username TEXT,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.advertiser_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF p_username IS NULL OR char_length(p_username) < 3 OR char_length(p_username) > 30
     OR p_username !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers or underscores';
  END IF;

  IF EXISTS (SELECT 1 FROM public.advertiser_accounts WHERE username = p_username) THEN
    RAISE EXCEPTION 'That username is already taken';
  END IF;

  IF p_website IS NOT NULL AND p_website <> '' AND p_website !~ '^https?://' THEN
    RAISE EXCEPTION 'Website must start with http:// or https://';
  END IF;

  IF p_contact_email IS NOT NULL AND p_contact_email <> '' AND p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Contact email is invalid';
  END IF;

  IF p_contact_phone IS NOT NULL AND p_contact_phone <> '' AND char_length(p_contact_phone) > 30 THEN
    RAISE EXCEPTION 'Contact phone is too long';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  INSERT INTO public.advertiser_accounts (
    user_id, account_type, name, username, category, description,
    avatar_url, cover_url, website, contact_email, contact_phone, location
  ) VALUES (
    auth.uid(), p_account_type, trim(p_name), p_username, p_category,
    NULLIF(trim(coalesce(p_description, '')), ''), p_avatar_url, p_cover_url,
    NULLIF(trim(coalesce(p_website, '')), ''), NULLIF(trim(coalesce(p_contact_email, '')), ''),
    NULLIF(trim(coalesce(p_contact_phone, '')), ''), NULLIF(trim(coalesce(p_location, '')), '')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_advertiser_account(
  p_account_id UUID,
  p_name TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.advertiser_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.advertiser_accounts
    WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Advertiser account not found or not owned by you';
  END IF;

  IF p_name IS NOT NULL AND (trim(p_name) = '' OR char_length(p_name) > 100) THEN
    RAISE EXCEPTION 'Name is invalid';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  IF p_website IS NOT NULL AND p_website <> '' AND p_website !~ '^https?://' THEN
    RAISE EXCEPTION 'Website must start with http:// or https://';
  END IF;

  UPDATE public.advertiser_accounts SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    category = COALESCE(NULLIF(trim(p_category), ''), category),
    description = COALESCE(NULLIF(trim(p_description), ''), description),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    cover_url = COALESCE(p_cover_url, cover_url),
    website = COALESCE(NULLIF(trim(p_website), ''), website),
    contact_email = COALESCE(NULLIF(trim(p_contact_email), ''), contact_email),
    contact_phone = COALESCE(NULLIF(trim(p_contact_phone), ''), contact_phone),
    location = COALESCE(NULLIF(trim(p_location), ''), location),
    updated_at = now()
  WHERE id = p_account_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- CAMPAIGN RPCs
-- =============================================
CREATE OR REPLACE FUNCTION public.create_campaign(
  p_advertiser_id UUID,
  p_name TEXT,
  p_objective public.campaign_objective,
  p_total_budget_cents BIGINT,
  p_currency TEXT DEFAULT 'USD',
  p_budget_type public.campaign_budget_type DEFAULT 'total',
  p_daily_budget_cents BIGINT DEFAULT NULL,
  p_start_at TIMESTAMPTZ DEFAULT NULL,
  p_end_at TIMESTAMPTZ DEFAULT NULL,
  p_is_scheduled BOOLEAN DEFAULT false,
  p_post_id UUID DEFAULT NULL,
  p_headline TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_cta TEXT DEFAULT NULL,
  p_cta_url TEXT DEFAULT NULL,
  p_targeting jsonb DEFAULT NULL
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_campaign public.campaigns;
  v_start TIMESTAMPTZ := COALESCE(p_start_at, now());
  v_end TIMESTAMPTZ := COALESCE(p_end_at, now() + interval '7 days');
  v_targeting jsonb := COALESCE(p_targeting, '{}'::jsonb);
  v_automatic BOOLEAN := COALESCE((v_targeting->>'automatic')::boolean, true);
  v_locations TEXT[] := COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_targeting->'locations', '[]'::jsonb)) x), '{}');
  v_languages TEXT[] := COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_targeting->'languages', '[]'::jsonb)) x), '{}');
  v_interests UUID[] := COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(coalesce(v_targeting->'interests', '[]'::jsonb)) x), '{}');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 OR char_length(p_name) > 120 THEN
    RAISE EXCEPTION 'Campaign name is required (max 120 characters)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.advertiser_accounts
    WHERE id = p_advertiser_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Advertiser account not found or not owned by you';
  END IF;

  IF p_total_budget_cents IS NULL OR p_total_budget_cents <= 0 THEN
    RAISE EXCEPTION 'Total budget must be greater than zero';
  END IF;

  IF p_daily_budget_cents IS NOT NULL AND (p_daily_budget_cents <= 0 OR p_daily_budget_cents > p_total_budget_cents) THEN
    RAISE EXCEPTION 'Daily budget must be positive and no greater than the total budget';
  END IF;

  IF v_end <= now() THEN
    RAISE EXCEPTION 'End date must be in the future';
  END IF;

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'End date must be after the start date';
  END IF;

  IF p_post_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.posts WHERE id = p_post_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Post not found or not owned by you';
  END IF;

  IF p_cta IS NOT NULL AND char_length(p_cta) > 40 THEN
    RAISE EXCEPTION 'CTA is too long';
  END IF;

  IF p_headline IS NOT NULL AND char_length(p_headline) > 120 THEN
    RAISE EXCEPTION 'Headline is too long';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 300 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  INSERT INTO public.campaigns (
    user_id, advertiser_id, name, objective, status, budget_type,
    total_budget_cents, daily_budget_cents, currency, start_at, end_at,
    is_scheduled, post_id, headline, description, cta, cta_url
  ) VALUES (
    v_user_id, p_advertiser_id, trim(p_name), p_objective, 'draft', p_budget_type,
    p_total_budget_cents, p_daily_budget_cents, p_currency, v_start, v_end,
    p_is_scheduled, p_post_id, p_headline, p_description, p_cta, p_cta_url
  )
  RETURNING * INTO v_campaign;

  INSERT INTO public.campaign_targeting (
    campaign_id, automatic, locations, languages, interests
  ) VALUES (
    v_campaign.id, v_automatic, v_locations, v_languages, v_interests
  );

  INSERT INTO public.advertisements (
    campaign_id, post_id, headline, description, cta
  ) VALUES (
    v_campaign.id, p_post_id, p_headline, p_description, p_cta
  );

  RETURN v_campaign;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
  v_targeting public.campaign_targeting;
  v_est RECORD;
  v_cpi BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Campaign not found or not owned by you';
  END IF;

  IF v_campaign.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft campaigns can be submitted';
  END IF;

  IF v_campaign.end_at <= now() OR v_campaign.end_at <= v_campaign.start_at THEN
    RAISE EXCEPTION 'Campaign dates are no longer valid';
  END IF;

  SELECT * INTO v_targeting FROM public.campaign_targeting WHERE campaign_id = p_campaign_id;

  SELECT * INTO v_est
  FROM public.estimate_audience(
    v_targeting.automatic,
    v_targeting.locations,
    v_targeting.languages,
    v_targeting.interests
  );

  IF NOT v_est.sufficient_data THEN
    RAISE EXCEPTION 'Not enough platform data to estimate an audience for this campaign';
  END IF;

  v_cpi := floor(v_campaign.total_budget_cents / greatest(v_est.estimated_impressions, 1));

  UPDATE public.campaigns SET
    status = 'pending_payment',
    estimated_reach_min = v_est.reach_min,
    estimated_reach_max = v_est.reach_max,
    estimated_impressions = v_est.estimated_impressions,
    cost_per_impression_cents = greatest(v_cpi, 1),
    updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;

  RETURN v_campaign;
END;
$$;

-- =============================================
-- PAYMENT CONFIRMATION
-- Only a real provider (Stripe webhook via service role) or an admin can
-- confirm a payment. Regular users can never self-activate.
-- =============================================
CREATE OR REPLACE FUNCTION public.confirm_campaign_payment(
  p_campaign_id UUID,
  p_provider public.payment_provider,
  p_provider_payment_id TEXT DEFAULT NULL
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Only payment providers or staff can confirm payments';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF v_campaign.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Campaign is not awaiting payment';
  END IF;

  INSERT INTO public.payments (campaign_id, user_id, provider, provider_payment_id, amount_cents, currency, status)
  VALUES (p_campaign_id, v_campaign.user_id, p_provider, p_provider_payment_id, v_campaign.total_budget_cents, v_campaign.currency, 'succeeded');

  UPDATE public.campaigns SET
    status = 'pending_review',
    paid_at = now(),
    updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;

  RETURN v_campaign;
END;
$$;

-- =============================================
-- ADMIN MODERATION
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_moderate_campaign(
  p_campaign_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF p_action = 'approve_payment' THEN
    IF v_campaign.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Campaign is not awaiting payment';
    END IF;
    INSERT INTO public.payments (campaign_id, user_id, provider, amount_cents, currency, status)
    VALUES (p_campaign_id, v_campaign.user_id, 'manual', v_campaign.total_budget_cents, v_campaign.currency, 'succeeded');
    v_campaign.status := 'pending_review';
    v_campaign.paid_at := now();
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'approve' THEN
    IF v_campaign.paid_at IS NULL THEN
      RAISE EXCEPTION 'Campaign has not been paid yet';
    END IF;
    IF v_campaign.status <> 'pending_review' THEN
      RAISE EXCEPTION 'Campaign is not pending review';
    END IF;
    v_campaign.status := CASE WHEN v_campaign.start_at > now() THEN 'scheduled' ELSE 'active' END;
    v_campaign.approved_at := now();
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'reject' THEN
    IF v_campaign.status IN ('active', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot reject a campaign in this state';
    END IF;
    v_campaign.status := 'rejected';
    v_campaign.rejection_reason := p_reason;
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'pause' THEN
    IF v_campaign.status <> 'active' THEN
      RAISE EXCEPTION 'Only active campaigns can be paused';
    END IF;
    v_campaign.status := 'paused';
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'resume' THEN
    IF v_campaign.status <> 'paused' THEN
      RAISE EXCEPTION 'Only paused campaigns can be resumed';
    END IF;
    v_campaign.status := 'active';
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'end' THEN
    IF v_campaign.status NOT IN ('active', 'paused', 'scheduled') THEN
      RAISE EXCEPTION 'Campaign cannot be ended in this state';
    END IF;
    v_campaign.status := 'completed';
    v_campaign.ended_at := now();
    v_campaign.moderation_note := p_reason;
  ELSE
    RAISE EXCEPTION 'Unknown moderation action';
  END IF;

  UPDATE public.campaigns SET
    status = v_campaign.status,
    paid_at = v_campaign.paid_at,
    approved_at = v_campaign.approved_at,
    ended_at = v_campaign.ended_at,
    rejection_reason = v_campaign.rejection_reason,
    moderation_note = v_campaign.moderation_note,
    updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;

  RETURN v_campaign;
END;
$$;

-- =============================================
-- ADVERTISER SELF-SERVICE STATUS ACTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.pause_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Campaign not found or not owned by you';
  END IF;
  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Only active campaigns can be paused';
  END IF;
  UPDATE public.campaigns SET status = 'paused', updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;
  RETURN v_campaign;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Campaign not found or not owned by you';
  END IF;
  IF v_campaign.status <> 'paused' THEN
    RAISE EXCEPTION 'Only paused campaigns can be resumed';
  END IF;
  IF v_campaign.end_at <= now() THEN
    RAISE EXCEPTION 'This campaign has ended';
  END IF;
  UPDATE public.campaigns SET status = 'active', updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;
  RETURN v_campaign;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Campaign not found or not owned by you';
  END IF;
  IF v_campaign.status NOT IN ('active', 'paused', 'scheduled', 'pending_review') THEN
    RAISE EXCEPTION 'Campaign cannot be ended in this state';
  END IF;
  UPDATE public.campaigns SET status = 'completed', ended_at = now(), updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;
  RETURN v_campaign;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL OR v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Campaign not found or not owned by you';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'pending_payment', 'pending_review', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign cannot be cancelled in this state';
  END IF;
  UPDATE public.campaigns SET status = 'cancelled', updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;
  RETURN v_campaign;
END;
$$;

-- =============================================
-- AD EVENT TRACKING
-- Idempotent (unique event_id). Spend / counters are only ever modified here,
-- never by the client. viewer_user_id always comes from the JWT.
-- =============================================
CREATE OR REPLACE FUNCTION public.record_ad_event(
  p_event_id TEXT,
  p_campaign_id UUID,
  p_advertisement_id UUID,
  p_event_type public.ad_event_type,
  p_placement public.ad_placement DEFAULT 'feed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer UUID := auth.uid();
  v_campaign public.campaigns;
  v_recorded BOOLEAN := false;
  v_impression_cost BIGINT;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN false;
  END IF;

  IF p_event_id IS NULL OR char_length(p_event_id) > 64 THEN
    RAISE EXCEPTION 'Invalid event id';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF p_advertisement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.advertisements WHERE id = p_advertisement_id AND campaign_id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Advertisement does not belong to this campaign';
  END IF;

  -- Advertisers do not get impressions on their own campaign.
  IF p_event_type = 'impression' AND v_campaign.user_id = v_viewer THEN
    RETURN false;
  END IF;

  INSERT INTO public.campaign_events (
    event_id, campaign_id, advertisement_id, viewer_user_id, event_type, placement
  ) VALUES (
    p_event_id, p_campaign_id, p_advertisement_id, v_viewer, p_event_type, p_placement
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_recorded := true;

  IF p_event_type = 'impression' THEN
    v_impression_cost := v_campaign.cost_per_impression_cents;
    UPDATE public.campaigns SET
      impressions_delivered = impressions_delivered + 1,
      spend_cents = spend_cents + v_impression_cost,
      updated_at = now()
    WHERE id = p_campaign_id;

    INSERT INTO public.campaign_daily_stats (campaign_id, stat_date, impressions, spend_cents)
    VALUES (p_campaign_id, now()::date, 1, v_impression_cost)
    ON CONFLICT (campaign_id, stat_date)
    DO UPDATE SET
      impressions = public.campaign_daily_stats.impressions + 1,
      spend_cents = public.campaign_daily_stats.spend_cents + v_impression_cost;
  ELSE
    INSERT INTO public.campaign_daily_stats (campaign_id, stat_date)
    VALUES (p_campaign_id, now()::date)
    ON CONFLICT (campaign_id, stat_date) DO NOTHING;

    UPDATE public.campaign_daily_stats SET
      clicks = clicks + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
      profile_visits = profile_visits + CASE WHEN p_event_type = 'profile_visit' THEN 1 ELSE 0 END,
      likes = likes + CASE WHEN p_event_type = 'like' THEN 1 ELSE 0 END,
      comments = comments + CASE WHEN p_event_type = 'comment' THEN 1 ELSE 0 END,
      shares = shares + CASE WHEN p_event_type = 'share' THEN 1 ELSE 0 END,
      saves = saves + CASE WHEN p_event_type = 'save' THEN 1 ELSE 0 END,
      follows = follows + CASE WHEN p_event_type = 'follow' THEN 1 ELSE 0 END,
      website_clicks = website_clicks + CASE WHEN p_event_type = 'website_click' THEN 1 ELSE 0 END,
      conversions = conversions + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END
    WHERE campaign_id = p_campaign_id AND stat_date = now()::date;
  END IF;

  RETURN v_recorded;
END;
$$;

-- =============================================
-- ANALYTICS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_campaign_analytics(p_campaign_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF v_campaign.user_id <> auth.uid() AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this campaign';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'impressions', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression'),
      'reach', (SELECT count(DISTINCT e.viewer_user_id) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression'),
      'clicks', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'click'),
      'profile_visits', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'profile_visit'),
      'follows', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'follow'),
      'likes', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'like'),
      'comments', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'comment'),
      'shares', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'share'),
      'saves', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'save'),
      'website_clicks', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'website_click'),
      'conversions', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type = 'conversion'),
      'engagements', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = p_campaign_id AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow')),
      'spend_cents', v_campaign.spend_cents
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', s.stat_date,
        'impressions', s.impressions,
        'clicks', s.clicks,
        'likes', s.likes,
        'comments', s.comments,
        'shares', s.shares,
        'saves', s.saves,
        'follows', s.follows,
        'profile_visits', s.profile_visits,
        'website_clicks', s.website_clicks,
        'conversions', s.conversions,
        'spend_cents', s.spend_cents
      ) ORDER BY s.stat_date)
      FROM public.campaign_daily_stats s WHERE s.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'audience', COALESCE((
      SELECT jsonb_build_object(
        'locations', (
          SELECT COALESCE(jsonb_agg(x ORDER BY x->>'count' DESC), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object('location', p.location, 'count', count(*)) AS x
            FROM public.campaign_events e
            JOIN public.profiles p ON p.user_id = e.viewer_user_id
            WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression'
              AND p.location IS NOT NULL AND p.location <> ''
            GROUP BY p.location
          ) t
        ),
        'languages', (
          SELECT COALESCE(jsonb_agg(x ORDER BY x->>'count' DESC), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object('language', up.language, 'count', count(*)) AS x
            FROM public.campaign_events e
            JOIN public.user_preferences up ON up.user_id = e.viewer_user_id
            WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression'
            GROUP BY up.language
          ) t
        ),
        'interests', (
          SELECT COALESCE(jsonb_agg(x ORDER BY x->>'count' DESC), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object('name', ic.name, 'count', count(*)) AS x
            FROM public.campaign_events e
            JOIN public.user_interests ui ON ui.user_id = e.viewer_user_id
            JOIN public.interest_categories ic ON ic.id = ui.category_id
            WHERE e.campaign_id = p_campaign_id AND e.event_type = 'impression'
            GROUP BY ic.name
          ) t
        )
      )
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ads_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'total_campaigns', (SELECT count(*) FROM public.campaigns c WHERE c.user_id = v_user_id),
    'active_campaigns', (SELECT count(*) FROM public.campaigns c WHERE c.user_id = v_user_id AND c.status = 'active'),
    'pending_review', (SELECT count(*) FROM public.campaigns c WHERE c.user_id = v_user_id AND c.status = 'pending_review'),
    'total_spend_cents', (SELECT COALESCE(sum(c.spend_cents), 0) FROM public.campaigns c WHERE c.user_id = v_user_id),
    'impressions', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'impression'),
    'reach', (SELECT count(DISTINCT e.viewer_user_id) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'impression'),
    'clicks', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'click'),
    'profile_visits', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'profile_visit'),
    'follows', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'follow'),
    'engagements', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow')),
    'website_clicks', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.user_id = v_user_id AND e.event_type = 'website_click')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- AD DELIVERY ENGINE
-- Server-side ad selection. Only eligible campaigns are returned:
--   * status = active
--   * advertiser active
--   * within date window
--   * budget not exhausted (spend + cost of next impression <= total)
--   * viewer is not the advertiser
--   * viewer has not blocked the advertiser
--   * viewer has not exceeded the daily frequency cap
--   * targeting matches (unless automatic)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_feed_ads(p_viewer_id UUID, p_limit INT DEFAULT 2)
RETURNS TABLE (
  advertisement_id UUID,
  campaign_id UUID,
  headline TEXT,
  description TEXT,
  cta TEXT,
  cta_url TEXT,
  objective public.campaign_objective,
  advertiser_id UUID,
  advertiser_type public.advertiser_account_type,
  advertiser_name TEXT,
  advertiser_username TEXT,
  advertiser_avatar_url TEXT,
  advertiser_is_verified BOOLEAN,
  advertiser_user_id UUID,
  profile_username TEXT,
  profile_privacy public.account_privacy,
  post_id UUID,
  post_content TEXT,
  post_created_at TIMESTAMPTZ,
  post_star_count INT,
  post_comment_count INT,
  post_media jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_interest BOOLEAN;
  v_has_language BOOLEAN;
  v_has_location BOOLEAN;
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Viewer required';
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      ad.id AS advertisement_id,
      c.id AS campaign_id,
      ad.headline,
      ad.description,
      ad.cta,
      c.cta_url,
      c.objective,
      a.id AS advertiser_id,
      a.account_type AS advertiser_type,
      a.name AS advertiser_name,
      a.username AS advertiser_username,
      a.avatar_url AS advertiser_avatar_url,
      pv.is_verified AS advertiser_is_verified,
      c.user_id AS advertiser_user_id,
      pv.username AS profile_username,
      pv.privacy AS profile_privacy,
      c.post_id,
      p.content AS post_content,
      p.created_at AS post_created_at,
      p.star_count AS post_star_count,
      p.comment_count AS post_comment_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pm.id, 'url', pm.url, 'type', pm.type, 'alt_text', pm.alt_text
        ) ORDER BY pm.position)
        FROM public.post_media pm WHERE pm.post_id = p.id
      ), '[]'::jsonb) AS post_media,
      t.automatic,
      t.locations,
      t.languages,
      t.interests,
      c.spend_cents,
      c.cost_per_impression_cents,
      c.total_budget_cents
    FROM public.campaigns c
    JOIN public.advertiser_accounts a ON a.id = c.advertiser_id
    JOIN public.advertisements ad ON ad.campaign_id = c.id
    JOIN public.profiles pv ON pv.user_id = c.user_id
    LEFT JOIN public.campaign_targeting t ON t.campaign_id = c.id
    LEFT JOIN public.posts p ON p.id = c.post_id
    WHERE c.status = 'active'
      AND a.status = 'active'
      AND pv.deleted_at IS NULL
      AND c.start_at <= now()
      AND c.end_at >= now()
      AND c.user_id <> p_viewer_id
      AND c.spend_cents + c.cost_per_impression_cents <= c.total_budget_cents
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = p_viewer_id AND b.blocked_id = c.user_id
      )
      AND (
        SELECT count(*) FROM public.campaign_events e
        WHERE e.campaign_id = c.id
          AND e.viewer_user_id = p_viewer_id
          AND e.event_type = 'impression'
          AND e.created_at >= (now() - interval '1 day')
      ) < 5
  )
  SELECT
    e.advertisement_id,
    e.campaign_id,
    e.headline,
    e.description,
    e.cta,
    e.cta_url,
    e.objective,
    e.advertiser_id,
    e.advertiser_type,
    e.advertiser_name,
    e.advertiser_username,
    e.advertiser_avatar_url,
    e.advertiser_is_verified,
    e.advertiser_user_id,
    e.profile_username,
    e.profile_privacy,
    e.post_id,
    e.post_content,
    e.post_created_at,
    e.post_star_count,
    e.post_comment_count,
    e.post_media
  FROM eligible e
  WHERE e.automatic
     OR (
        (COALESCE(array_length(e.interests, 1), 0) = 0 OR EXISTS (
          SELECT 1 FROM public.user_interests ui
          WHERE ui.user_id = p_viewer_id AND ui.category_id = ANY(e.interests)
        ))
        AND (COALESCE(array_length(e.languages, 1), 0) = 0 OR EXISTS (
          SELECT 1 FROM public.user_preferences up
          WHERE up.user_id = p_viewer_id AND up.language = ANY(e.languages)
        ))
        AND (COALESCE(array_length(e.locations, 1), 0) = 0 OR EXISTS (
          SELECT 1 FROM public.profiles vp
          WHERE vp.user_id = p_viewer_id
            AND vp.location IS NOT NULL
            AND vp.location <> ''
            AND lower(vp.location) = ANY (
              SELECT lower(x) FROM unnest(e.locations) AS x
            )
        ))
     )
  ORDER BY e.campaign_id
  LIMIT p_limit;
END;
$$;

-- =============================================
-- AD REPORTING
-- =============================================
CREATE OR REPLACE FUNCTION public.report_ad(
  p_advertisement_id UUID,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS public.ad_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_ad public.advertisements;
  v_report public.ad_reports;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ad FROM public.advertisements WHERE id = p_advertisement_id;
  IF v_ad.id IS NULL THEN
    RAISE EXCEPTION 'Advertisement not found';
  END IF;

  IF p_reason IS NULL OR char_length(p_reason) > 200 THEN
    RAISE EXCEPTION 'A valid reason is required';
  END IF;

  IF p_details IS NOT NULL AND char_length(p_details) > 1000 THEN
    RAISE EXCEPTION 'Details are too long';
  END IF;

  INSERT INTO public.ad_reports (advertisement_id, campaign_id, user_id, reason, details, status)
  VALUES (p_advertisement_id, v_ad.campaign_id, v_user, p_reason, p_details, 'open')
  ON CONFLICT (advertisement_id, user_id)
  DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open', created_at = now()
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;

-- =============================================
-- ADMIN REPORT REVIEW
-- =============================================
CREATE OR REPLACE FUNCTION public.update_ad_report_status(
  p_report_id UUID,
  p_new_status public.ad_report_status
)
RETURNS public.ad_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.ad_reports;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;
  UPDATE public.ad_reports SET status = p_new_status WHERE id = p_report_id
  RETURNING * INTO v_report;
  RETURN v_report;
END;
$$;

-- =============================================
-- MAINTAINANCE / AUTO-COMPLETION
-- A scheduled job can call this to transition campaigns that have ended or
-- exhausted their budget out of "active".
-- =============================================
CREATE OR REPLACE FUNCTION public.complete_expired_campaigns()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.campaigns SET
    status = 'completed',
    ended_at = now(),
    updated_at = now()
  WHERE status = 'active'
    AND (end_at <= now() OR spend_cents >= total_budget_cents);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================
-- EXECUTE GRANTS FOR RPC FUNCTIONS
-- =============================================
GRANT EXECUTE ON FUNCTION public.estimate_audience(BOOLEAN, TEXT[], TEXT[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_advertiser_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_advertiser_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_analytics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ads_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feed_ads(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_ad TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_campaign_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ad_report_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_expired_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_or_null(UUID) TO authenticated;

COMMIT;
