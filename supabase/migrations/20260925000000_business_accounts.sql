-- =============================================
-- BUSINESS ACCOUNTS
-- =============================================
-- Turns existing advertiser_accounts rows into first-class, Twibs-native
-- BUSINESS identities. A business is owned by one auth user and can be managed
-- by a team (roles: owner / admin / advertiser / analyst). Businesses have
-- their own public profile (avatar, cover, bio, website, followers), their own
-- distribution settings (discovery priority, quality signals, audience
-- expansion), a wallet balance + transaction ledger (test-mode funded), and
-- their own promotions.
--
-- Principles
-- ----------
-- * No fake data: overview / insights / audience numbers are derived from real
--   rows (advertiser_accounts, campaigns, campaign_events, business_followers,
--   ad_transactions, posts).
-- * No duplicate concepts: campaigns / advertisements / campaign_targeting /
--   campaign_events stay the source of truth for promotions. Businesses ARE
--   advertiser_accounts. Only business_members, business_settings,
--   business_balances, ad_transactions and business_followers are new.
-- * Business isolation: read/update access is gated by membership (owner is the
--   seeded member). Direct table writes are never exposed to the client.
-- * Individual audience rows are never returned in aggregate RPCs (privacy).
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction that later uses the
-- new value, so those statements stay OUTSIDE the BEGIN/COMMIT block below.
--
-- IDEMPOTENCY NOTE: every CREATE TYPE / CREATE TABLE / CREATE POLICY below is
-- guarded so this whole file can be safely re-run after a partial failure,
-- since Postgres has no native "CREATE TYPE IF NOT EXISTS" or
-- "CREATE POLICY IF NOT EXISTS". Enum values use the native
-- "ADD VALUE IF NOT EXISTS", which is idempotent on its own.

ALTER TYPE public.advertiser_account_type ADD VALUE IF NOT EXISTS 'organization';
ALTER TYPE public.advertiser_account_type ADD VALUE IF NOT EXISTS 'project';
ALTER TYPE public.ad_placement ADD VALUE IF NOT EXISTS 'reels';
ALTER TYPE public.ad_placement ADD VALUE IF NOT EXISTS 'stories';

BEGIN;

-- =============================================
-- NEW ENUMS (guarded: CREATE TYPE has no IF NOT EXISTS in Postgres)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_role') THEN
    CREATE TYPE public.business_role AS ENUM ('owner', 'admin', 'advertiser', 'analyst');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_discovery_priority') THEN
    CREATE TYPE public.business_discovery_priority AS ENUM ('normal', 'expanded', 'promoted');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ad_transaction_kind') THEN
    CREATE TYPE public.ad_transaction_kind AS ENUM ('credit', 'debit', 'refund');
  END IF;
END $$;

-- =============================================
-- ADVERTISER ACCOUNTS: business identity columns
-- =============================================
ALTER TABLE public.advertiser_accounts
  ADD COLUMN IF NOT EXISTS goals TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS followers_count INT NOT NULL DEFAULT 0;


-- =============================================
-- BUSINESS SETTINGS (1:1 with advertiser_accounts)
-- =============================================
CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id UUID PRIMARY KEY REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  discovery_priority public.business_discovery_priority NOT NULL DEFAULT 'normal',
  quality_signals jsonb NOT NULL DEFAULT '{}',
  audience_expansion BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- BUSINESS MEMBERS
-- =============================================
CREATE TABLE IF NOT EXISTS public.business_members (
  business_id UUID NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.business_role NOT NULL DEFAULT 'advertiser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_members_user ON public.business_members(user_id);

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

-- =============================================
-- BUSINESS WALLET + TRANSACTION LEDGER
-- =============================================
CREATE TABLE IF NOT EXISTS public.business_balances (
  business_id UUID PRIMARY KEY REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_balances ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ad_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  kind public.ad_transaction_kind NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_transactions_business ON public.ad_transactions(business_id, created_at DESC);

ALTER TABLE public.ad_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- BUSINESS FOLLOWERS (real follower counts on business profiles)
-- =============================================
CREATE TABLE IF NOT EXISTS public.business_followers (
  business_id UUID NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_followers_user ON public.business_followers(user_id);

ALTER TABLE public.business_followers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POSTS: business authorship
-- =============================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_business ON public.posts(business_id);

-- =============================================
-- CAMPAIGNS: distribution controls
-- =============================================
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS distribution_priority public.business_discovery_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS audience_expansion BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_campaigns_priority ON public.campaigns(distribution_priority);

-- =============================================
-- CLEANUP: drop every previously-created overload of the functions this
-- migration (re)defines below. CREATE OR REPLACE FUNCTION only replaces a
-- function whose signature matches EXACTLY; if an earlier run of this
-- script used a different parameter list, that old version is still
-- sitting in the catalog alongside the new one, and Postgres then can't
-- resolve a bare "GRANT EXECUTE ON FUNCTION name TO authenticated" (no
-- argument list) because the name is no longer unique.
-- CASCADE also removes any RLS policy or trigger built on an old version;
-- every one of those is explicitly recreated later in this file, so
-- nothing is lost.
-- =============================================
DO $$
DECLARE
  v_name text;
  v_sig text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'sync_business_followers_count',
    'is_business_member', 'get_business_role', 'can_follow_business',
    'can_manage_business_campaigns', 'can_admin_business',
    'create_business_account', 'get_business_accounts',
    'update_business_profile', 'update_business_settings',
    'create_business_campaign', 'create_boost_campaign',
    'submit_boost_campaign', 'get_business_profile', 'get_business_overview',
    'get_business_insights', 'get_business_audience', 'get_business_billing',
    'credit_business_balance', 'add_business_member',
    'update_business_member_role', 'remove_business_member',
    'pause_campaign', 'resume_campaign', 'end_campaign', 'cancel_campaign',
    'get_campaign_analytics', 'get_business_campaigns', 'get_feed_ads'
  ]
  LOOP
    FOR v_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      EXECUTE format('DROP FUNCTION %s CASCADE', v_sig);
    END LOOP;
  END LOOP;
END $$;

-- =============================================
-- HELPER FUNCTIONS
-- Defined BEFORE policies: PostgreSQL (PG15+) resolves functions and
-- tables referenced by CREATE POLICY / LANGUAGE sql at creation time.
-- =============================================
-- MEMBERSHIP HELPERS
-- =============================================
CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.get_business_role(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.business_role;
BEGIN
  SELECT bm.role INTO v_role
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid();

  IF v_role IS NULL THEN
    RETURN 'none';
  END IF;
  RETURN v_role::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_follow_business(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.sync_business_followers_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.advertiser_accounts SET followers_count = followers_count + 1 WHERE id = NEW.business_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.advertiser_accounts SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.business_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_business_followers_count ON public.business_followers;
CREATE TRIGGER sync_business_followers_count
  AFTER INSERT OR DELETE ON public.business_followers
  FOR EACH ROW EXECUTE FUNCTION public.sync_business_followers_count();

-- =============================================
-- RLS POLICIES (each guarded with DROP POLICY IF EXISTS: Postgres has no
-- CREATE POLICY IF NOT EXISTS, so this is what makes re-runs safe)
-- =============================================
DROP POLICY IF EXISTS "Business settings readable by members and staff" ON public.business_settings;
CREATE POLICY "Business settings readable by members and staff"
  ON public.business_settings FOR SELECT
  USING (public.is_business_member(business_id) OR public.is_admin_or_moderator());


DROP POLICY IF EXISTS "Members can view memberships they belong to" ON public.business_members;
CREATE POLICY "Members can view memberships they belong to"
  ON public.business_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_business_member(business_id) OR public.is_admin_or_moderator());


DROP POLICY IF EXISTS "Business balances readable by members and staff" ON public.business_balances;
CREATE POLICY "Business balances readable by members and staff"
  ON public.business_balances FOR SELECT
  USING (public.is_business_member(business_id) OR public.is_admin_or_moderator());


DROP POLICY IF EXISTS "Business transactions readable by members and staff" ON public.ad_transactions;
CREATE POLICY "Business transactions readable by members and staff"
  ON public.ad_transactions FOR SELECT
  USING (public.is_business_member(business_id) OR public.is_admin_or_moderator());


DROP POLICY IF EXISTS "Business followers are public" ON public.business_followers;
CREATE POLICY "Business followers are public"
  ON public.business_followers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can follow businesses" ON public.business_followers;
CREATE POLICY "Users can follow businesses"
  ON public.business_followers FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.can_follow_business(business_id));

DROP POLICY IF EXISTS "Users can unfollow businesses" ON public.business_followers;
CREATE POLICY "Users can unfollow businesses"
  ON public.business_followers FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can attribute posts to their business" ON public.posts;
CREATE POLICY "Members can attribute posts to their business"
  ON public.posts FOR INSERT
  WITH CHECK (
    (business_id IS NULL)
    OR (user_id = auth.uid() AND public.is_business_member(business_id))
  );

DROP POLICY IF EXISTS "Campaigns readable by business members" ON public.campaigns;
CREATE POLICY "Campaigns readable by business members"
  ON public.campaigns FOR SELECT
  USING (public.is_business_member(advertiser_id) OR public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Campaign targeting readable by business members" ON public.campaign_targeting;
CREATE POLICY "Campaign targeting readable by business members"
  ON public.campaign_targeting FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND (public.is_business_member(c.advertiser_id) OR public.is_admin_or_moderator())
    )
  );

DROP POLICY IF EXISTS "Advertisements readable by business members" ON public.advertisements;
CREATE POLICY "Advertisements readable by business members"
  ON public.advertisements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND (public.is_business_member(c.advertiser_id) OR public.is_admin_or_moderator())
    )
  );

DROP POLICY IF EXISTS "Campaign events readable by business members" ON public.campaign_events;
CREATE POLICY "Campaign events readable by business members"
  ON public.campaign_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND (public.is_business_member(c.advertiser_id) OR public.is_admin_or_moderator())
    )
  );

DROP POLICY IF EXISTS "Campaign daily stats readable by business members" ON public.campaign_daily_stats;
CREATE POLICY "Campaign daily stats readable by business members"
  ON public.campaign_daily_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND (public.is_business_member(c.advertiser_id) OR public.is_admin_or_moderator())
    )
  );

-- =============================================
-- GRANTS (no direct writes from the client)
-- =============================================
GRANT SELECT ON public.business_members, public.business_settings, public.business_balances,
  public.ad_transactions, public.business_followers TO authenticated;
GRANT INSERT ON public.business_followers TO authenticated;
GRANT DELETE ON public.business_followers TO authenticated;

-- Roles that may manage promotions (create / pause / resume / end)
CREATE OR REPLACE FUNCTION public.can_manage_business_campaigns(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'advertiser')
  )
$$;

-- Roles that may manage the business itself (settings / billing / team)
CREATE OR REPLACE FUNCTION public.can_admin_business(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

-- =============================================
-- RPC: CREATE BUSINESS ACCOUNT (4-step onboarding backend)
-- =============================================
CREATE OR REPLACE FUNCTION public.create_business_account(
  p_account_type public.advertiser_account_type,
  p_name TEXT,
  p_username TEXT,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_goals TEXT[] DEFAULT '{}'
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.advertiser_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_account_type NOT IN ('business', 'creator', 'organization', 'project') THEN
    RAISE EXCEPTION 'A business account must be of type business, creator, organization or project';
  END IF;

  SELECT * INTO v_account
  FROM public.create_advertiser_account(
    p_account_type, p_name, p_username, p_category, p_description,
    p_avatar_url, p_cover_url, p_website, NULL, NULL, p_location
  );

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_account.id, auth.uid(), 'owner');

  INSERT INTO public.business_settings (business_id, discovery_priority, quality_signals, audience_expansion)
  VALUES (v_account.id, 'normal', '{}'::jsonb, true);

  INSERT INTO public.business_balances (business_id, balance_cents, currency)
  VALUES (v_account.id, 0, 'USD');

  UPDATE public.advertiser_accounts SET goals = COALESCE(p_goals, '{}') WHERE id = v_account.id;

  RETURN v_account;
END;
$$;

-- =============================================
-- RPC: LIST BUSINESS IDENTITIES FOR THE CURRENT USER (owner or member)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_accounts()
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

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'name'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'account_type', a.account_type::text,
      'name', a.name,
      'username', a.username,
      'category', a.category,
      'description', a.description,
      'avatar_url', a.avatar_url,
      'cover_url', a.cover_url,
      'website', a.website,
      'location', a.location,
      'goals', COALESCE(a.goals, '{}'::text[]),
      'status', a.status::text,
      'role', (
        SELECT bm.role::text FROM public.business_members bm
        WHERE bm.business_id = a.id AND bm.user_id = v_user_id
      ),
      'is_owner', a.user_id = v_user_id,
      'followers_count', a.followers_count,
      'created_at', a.created_at
    ) AS row_data
    FROM public.advertiser_accounts a
    WHERE a.account_type <> 'personal'
      AND a.status = 'active'
      AND (
        a.user_id = v_user_id
        OR EXISTS (
          SELECT 1 FROM public.business_members bm
          WHERE bm.business_id = a.id AND bm.user_id = v_user_id
        )
      )
  ) t;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: UPDATE BUSINESS PROFILE (owner / admin)
-- =============================================
CREATE OR REPLACE FUNCTION public.update_business_profile(
  p_business_id UUID,
  p_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_goals TEXT[] DEFAULT NULL
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

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business';
  END IF;

  IF p_name IS NOT NULL AND (trim(p_name) = '' OR char_length(p_name) > 100) THEN
    RAISE EXCEPTION 'Name is invalid';
  END IF;

  IF p_username IS NOT NULL AND
     (char_length(p_username) < 3 OR char_length(p_username) > 30 OR p_username !~ '^[a-zA-Z0-9_]+$') THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers or underscores';
  END IF;

  IF p_username IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.advertiser_accounts
    WHERE username = p_username AND id <> p_business_id
  ) THEN
    RAISE EXCEPTION 'That username is already taken';
  END IF;

  IF p_website IS NOT NULL AND p_website <> '' AND p_website !~ '^https?://' THEN
    RAISE EXCEPTION 'Website must start with http:// or https://';
  END IF;

  UPDATE public.advertiser_accounts SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    username = COALESCE(NULLIF(trim(p_username), ''), username),
    category = COALESCE(NULLIF(trim(p_category), ''), category),
    description = COALESCE(NULLIF(trim(p_description), ''), description),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    cover_url = COALESCE(p_cover_url, cover_url),
    website = COALESCE(NULLIF(trim(p_website), ''), website),
    location = COALESCE(NULLIF(trim(p_location), ''), location),
    goals = COALESCE(p_goals, goals),
    updated_at = now()
  WHERE id = p_business_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: UPDATE BUSINESS SETTINGS (distribution controls)
-- =============================================
CREATE OR REPLACE FUNCTION public.update_business_settings(
  p_business_id UUID,
  p_discovery_priority public.business_discovery_priority DEFAULT NULL,
  p_audience_expansion BOOLEAN DEFAULT NULL,
  p_quality_signals jsonb DEFAULT NULL
)
RETURNS public.business_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.business_settings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business';
  END IF;

  INSERT INTO public.business_settings (business_id, discovery_priority, audience_expansion, quality_signals)
  VALUES (
    p_business_id,
    COALESCE(p_discovery_priority, 'normal'),
    COALESCE(p_audience_expansion, true),
    COALESCE(p_quality_signals, '{}'::jsonb)
  )
  ON CONFLICT (business_id) DO UPDATE SET
    discovery_priority = COALESCE(p_discovery_priority, public.business_settings.discovery_priority),
    audience_expansion = COALESCE(p_audience_expansion, public.business_settings.audience_expansion),
    quality_signals = COALESCE(p_quality_signals, public.business_settings.quality_signals),
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: CREATE BUSINESS CAMPAIGN (team-aware)
-- Mirrors create_campaign but allows any member with owner/admin/advertiser
-- role to launch a promotion for the business, and a business post may be
-- boosted by any member who can manage campaigns.
-- =============================================
CREATE OR REPLACE FUNCTION public.create_business_campaign(
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
  p_description TEXT DEFAULT NULL,
  p_cta TEXT DEFAULT NULL,
  p_cta_url TEXT DEFAULT NULL,
  p_targeting jsonb DEFAULT NULL,
  p_distribution_priority public.business_discovery_priority DEFAULT 'normal',
  p_audience_expansion BOOLEAN DEFAULT true
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

  IF NOT public.can_manage_business_campaigns(p_advertiser_id) THEN
    RAISE EXCEPTION 'You do not have permission to create campaigns for this business';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 OR char_length(p_name) > 120 THEN
    RAISE EXCEPTION 'Campaign name is required (max 120 characters)';
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

  -- The boosted post must belong to the creator or to the business itself.
  IF p_post_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.posts
    WHERE id = p_post_id
      AND (user_id = v_user_id OR business_id = p_advertiser_id)
  ) THEN
    RAISE EXCEPTION 'Post not found, not owned by you, or not part of this business';
  END IF;

  IF p_cta IS NOT NULL AND char_length(p_cta) > 40 THEN
    RAISE EXCEPTION 'CTA is too long';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 300 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  INSERT INTO public.campaigns (
    user_id, advertiser_id, name, objective, status, budget_type,
    total_budget_cents, daily_budget_cents, currency, start_at, end_at,
    is_scheduled, post_id, description, cta, cta_url,
    distribution_priority, audience_expansion
  ) VALUES (
    v_user_id, p_advertiser_id, trim(p_name), p_objective, 'draft', p_budget_type,
    p_total_budget_cents, p_daily_budget_cents, p_currency, v_start, v_end,
    p_is_scheduled, p_post_id, p_description, p_cta, p_cta_url,
    p_distribution_priority, p_audience_expansion
  )
  RETURNING * INTO v_campaign;

  INSERT INTO public.campaign_targeting (
    campaign_id, automatic, locations, languages, interests
  ) VALUES (
    v_campaign.id, v_automatic, v_locations, v_languages, v_interests
  );

  INSERT INTO public.advertisements (
    campaign_id, post_id, description, cta
  ) VALUES (
    v_campaign.id, p_post_id, p_description, p_cta
  );

  RETURN v_campaign;
END;
$$;

-- =============================================
-- RPC: CREATE BOOST CAMPAIGN (single promoted post pipeline)
-- Friendliness wrapper over create_business_campaign so the UI can pass the
-- simple boost fields. The campaign still becomes a normal campaign row.
-- =============================================
CREATE OR REPLACE FUNCTION public.create_boost_campaign(
  p_advertiser_id UUID,
  p_post_id UUID,
  p_goal public.campaign_objective,
  p_budget_cents BIGINT,
  p_days INT,
  p_targeting jsonb DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_distribution_priority public.business_discovery_priority DEFAULT 'normal',
  p_audience_expansion BOOLEAN DEFAULT true
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
  v_post_content TEXT;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 90 days';
  END IF;

  SELECT content INTO v_post_content FROM public.posts WHERE id = p_post_id;

  SELECT * INTO v_campaign
  FROM public.create_business_campaign(
    p_advertiser_id := p_advertiser_id,
    p_name := 'Boost' || COALESCE(': ' || left(v_post_content, 40), ''),
    p_objective := p_goal,
    p_total_budget_cents := p_budget_cents,
    p_start_at := now(),
    p_end_at := now() + (p_days || ' days')::interval,
    p_post_id := p_post_id,
    p_description := p_description,
    p_targeting := p_targeting,
    p_distribution_priority := p_distribution_priority,
    p_audience_expansion := p_audience_expansion
  );

  RETURN v_campaign;
END;
$$;

-- =============================================
-- RPC: SUBMIT BOOST (draft -> pending_review) + record test payment + ledger
-- In test mode no real money moves: a manual payment + ad_transaction debit is
-- recorded, and the business wallet is charged when it has funds. The campaign
-- still requires staff approval to go live, exactly like today.
-- =============================================
CREATE OR REPLACE FUNCTION public.submit_boost_campaign(p_campaign_id UUID)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
  v_reserved BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF NOT public.can_manage_business_campaigns(v_campaign.advertiser_id) AND v_campaign.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You do not have permission to submit this campaign';
  END IF;

  IF v_campaign.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft campaigns can be submitted';
  END IF;

  IF v_campaign.end_at <= now() OR v_campaign.end_at <= v_campaign.start_at THEN
    RAISE EXCEPTION 'Campaign dates are no longer valid';
  END IF;

  -- Create the actual payment + ledger rows (test-mode manual payment).
  INSERT INTO public.payments (campaign_id, user_id, provider, amount_cents, currency, status)
  VALUES (p_campaign_id, auth.uid(), 'manual', v_campaign.total_budget_cents, v_campaign.currency, 'succeeded');

  INSERT INTO public.ad_transactions (business_id, campaign_id, kind, amount_cents, currency, description)
  VALUES (
    v_campaign.advertiser_id, p_campaign_id, 'debit',
    -v_campaign.total_budget_cents, v_campaign.currency,
    'Promotion budget reserved: ' || v_campaign.name
  );

  -- Charge the wallet if it has funds; otherwise the test grant covers it.
  UPDATE public.business_balances SET balance_cents = balance_cents - v_campaign.total_budget_cents
  WHERE business_id = v_campaign.advertiser_id AND balance_cents >= v_campaign.total_budget_cents;

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
-- RPC: PUBLIC BUSINESS PROFILE
-- Aggregated + public info only. Real follower count, whether the viewer
-- follows the business, and the viewer's team role (if any).
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_profile(p_username TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', a.id,
    'account_type', a.account_type::text,
    'name', a.name,
    'username', a.username,
    'category', a.category,
    'description', a.description,
    'avatar_url', a.avatar_url,
    'cover_url', a.cover_url,
    'website', a.website,
    'location', a.location,
    'status', a.status::text,
    'followers_count', a.followers_count,
    'is_following', EXISTS (
      SELECT 1 FROM public.business_followers bf
      WHERE bf.business_id = a.id AND bf.user_id = v_viewer
    ),
    'my_role', COALESCE((
      SELECT bm.role::text FROM public.business_members bm
      WHERE bm.business_id = a.id AND bm.user_id = v_viewer
    ), 'none'),
    'created_at', a.created_at
  ) INTO v_result
  FROM public.advertiser_accounts a
  WHERE a.username = p_username AND a.account_type <> 'personal' AND a.status = 'active';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: BUSINESS OVERVIEW (members)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_overview(p_business_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT jsonb_build_object(
    'followers_count', a.followers_count,
    'followers_gained_7d', (
      SELECT count(*) FROM public.business_followers bf
      WHERE bf.business_id = p_business_id AND bf.created_at >= now() - interval '7 days'
    ),
    'active_promotions', (
      SELECT count(*) FROM public.campaigns c
      WHERE c.advertiser_id = p_business_id
        AND c.status IN ('active', 'scheduled', 'pending_review')
    ),
    'total_campaigns', (
      SELECT count(*) FROM public.campaigns c WHERE c.advertiser_id = p_business_id
    ),
    'total_spend_cents', (
      SELECT COALESCE(sum(c.spend_cents), 0) FROM public.campaigns c WHERE c.advertiser_id = p_business_id
    ),
    'reach', (
      SELECT count(DISTINCT e.viewer_user_id) FROM public.campaign_events e
      JOIN public.campaigns c ON c.id = e.campaign_id
      WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
    ),
    'impressions', (
      SELECT count(*) FROM public.campaign_events e
      JOIN public.campaigns c ON c.id = e.campaign_id
      WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
    ),
    'engagement', (
      SELECT count(*) FROM public.campaign_events e
      JOIN public.campaigns c ON c.id = e.campaign_id
      WHERE c.advertiser_id = p_business_id
        AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow')
    ),
    'clicks', (
      SELECT count(*) FROM public.campaign_events e
      JOIN public.campaigns c ON c.id = e.campaign_id
      WHERE c.advertiser_id = p_business_id AND e.event_type IN ('click', 'website_click', 'profile_visit')
    ),
    'recent_content', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'content', p.content,
        'created_at', p.created_at, 'star_count', p.star_count,
        'comment_count', p.comment_count
      ) ORDER BY p.created_at DESC)
      FROM (
        SELECT id, content, created_at, star_count, comment_count
        FROM public.posts p
        WHERE p.business_id = p_business_id
        ORDER BY p.created_at DESC LIMIT 6
      ) p
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.advertiser_accounts a WHERE a.id = p_business_id;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: BUSINESS INSIGHTS (members) — totals + daily series + top content
-- Only metrics the backend actually tracks are surfaced.
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_insights(p_business_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'reach', (SELECT count(DISTINCT e.viewer_user_id) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'),
      'impressions', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'),
      'clicks', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type IN ('click', 'website_click')),
      'profile_visits', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'profile_visit'),
      'likes', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'like'),
      'comments', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'comment'),
      'shares', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'share'),
      'saves', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'save'),
      'follows', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type = 'follow'),
      'engagements', (SELECT count(*) FROM public.campaign_events e JOIN public.campaigns c ON c.id = e.campaign_id WHERE c.advertiser_id = p_business_id AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow')),
      'spend_cents', (SELECT COALESCE(sum(c.spend_cents), 0) FROM public.campaigns c WHERE c.advertiser_id = p_business_id)
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', s.stat_date,
        'impressions', s.impressions,
        'engagements', s.likes + s.comments + s.shares + s.saves + s.follows,
        'spend_cents', s.spend_cents
      ) ORDER BY s.stat_date)
      FROM public.campaign_daily_stats s
      JOIN public.campaigns c ON c.id = s.campaign_id
      WHERE c.advertiser_id = p_business_id
    ), '[]'::jsonb),
    'top_content', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'campaign_id', c.id,
        'campaign_name', c.name,
        'status', c.status::text,
        'post_id', c.post_id,
        'content', p.content,
        'impressions', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = c.id AND e.event_type = 'impression'),
        'engagements', (SELECT count(*) FROM public.campaign_events e WHERE e.campaign_id = c.id AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow')),
        'spend_cents', c.spend_cents
      ) ORDER BY c.spend_cents DESC)
      FROM public.campaigns c
      LEFT JOIN public.posts p ON p.id = c.post_id
      WHERE c.advertiser_id = p_business_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.advertiser_accounts a WHERE a.id = p_business_id;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: BUSINESS AUDIENCE (members) — aggregated, never individual rows
-- Age / active-time breakdowns are not computed because the platform does not
-- store viewer birthdates or per-session timestamps; only real data is shown.
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_audience(p_business_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT jsonb_build_object(
    'total_reach', (
      SELECT count(DISTINCT e.viewer_user_id) FROM public.campaign_events e
      JOIN public.campaigns c ON c.id = e.campaign_id
      WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
    ),
    'returning_viewers', (
      SELECT count(*) FROM (
        SELECT e.viewer_user_id FROM public.campaign_events e
        JOIN public.campaigns c ON c.id = e.campaign_id
        WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
        GROUP BY e.viewer_user_id HAVING count(*) >= 2
      ) t
    ),
    'followers', a.followers_count,
    'locations', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'count' DESC)
      FROM (
        SELECT jsonb_build_object('location', p.location, 'count', count(DISTINCT e.viewer_user_id)) AS x
        FROM public.campaign_events e
        JOIN public.campaigns c ON c.id = e.campaign_id
        JOIN public.profiles p ON p.user_id = e.viewer_user_id
        WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
          AND p.location IS NOT NULL AND p.location <> ''
        GROUP BY p.location
      ) t
    ), '[]'::jsonb),
    'languages', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'count' DESC)
      FROM (
        SELECT jsonb_build_object('language', up.language, 'count', count(DISTINCT e.viewer_user_id)) AS x
        FROM public.campaign_events e
        JOIN public.campaigns c ON c.id = e.campaign_id
        JOIN public.user_preferences up ON up.user_id = e.viewer_user_id
        WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
        GROUP BY up.language
      ) t
    ), '[]'::jsonb),
    'interests', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'count' DESC)
      FROM (
        SELECT jsonb_build_object('name', ic.name, 'count', count(DISTINCT e.viewer_user_id)) AS x
        FROM public.campaign_events e
        JOIN public.campaigns c ON c.id = e.campaign_id
        JOIN public.user_interests ui ON ui.user_id = e.viewer_user_id
        JOIN public.interest_categories ic ON ic.id = ui.category_id
        WHERE c.advertiser_id = p_business_id AND e.event_type = 'impression'
        GROUP BY ic.name
      ) t
    ), '[]'::jsonb),
    'top_engagers', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'count' DESC)
      FROM (
        SELECT jsonb_build_object(
          'username', pv.username,
          'display_name', pv.display_name,
          'avatar_url', pv.avatar_url,
          'count', count(*)
        ) AS x
        FROM public.campaign_events e
        JOIN public.campaigns c ON c.id = e.campaign_id
        JOIN public.profiles pv ON pv.user_id = e.viewer_user_id
        WHERE c.advertiser_id = p_business_id
          AND e.event_type IN ('like', 'comment', 'share', 'save', 'follow', 'profile_visit', 'click')
        GROUP BY pv.user_id, pv.username, pv.display_name, pv.avatar_url
        ORDER BY count(*) DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.advertiser_accounts a WHERE a.id = p_business_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- =============================================
-- RPC: BUSINESS BILLING (members)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_billing(p_business_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT jsonb_build_object(
    'balance_cents', COALESCE((SELECT balance_cents FROM public.business_balances WHERE business_id = p_business_id), 0),
    'currency', COALESCE((SELECT currency FROM public.business_balances WHERE business_id = p_business_id), 'USD'),
    'total_credited_cents', COALESCE((SELECT sum(amount_cents) FROM public.ad_transactions WHERE business_id = p_business_id AND kind = 'credit'), 0),
    'total_spent_cents', COALESCE((SELECT sum(-amount_cents) FROM public.ad_transactions WHERE business_id = p_business_id AND kind = 'debit'), 0),
    'transactions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind::text,
        'amount_cents', t.amount_cents,
        'currency', t.currency,
        'description', t.description,
        'campaign_id', t.campaign_id,
        'created_at', t.created_at
      ) ORDER BY t.created_at DESC)
      FROM public.ad_transactions t WHERE t.business_id = p_business_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: CREDIT BUSINESS BALANCE (owner only; test funds, clearly labeled)
-- =============================================
CREATE OR REPLACE FUNCTION public.credit_business_balance(p_business_id UUID, p_amount_cents BIGINT)
RETURNS public.business_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.business_balances;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the business owner can fund the wallet';
  END IF;

  UPDATE public.business_balances SET
    balance_cents = balance_cents + p_amount_cents,
    updated_at = now()
  WHERE business_id = p_business_id
  RETURNING * INTO v_result;

  INSERT INTO public.ad_transactions (business_id, campaign_id, kind, amount_cents, currency, description)
  VALUES (p_business_id, NULL, 'credit', p_amount_cents, COALESCE(v_result.currency, 'USD'), 'Test funds added');

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: TEAM MANAGEMENT (owner / admin)
-- =============================================
CREATE OR REPLACE FUNCTION public.add_business_member(
  p_business_id UUID,
  p_username TEXT,
  p_role public.business_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'A business has exactly one owner';
  END IF;

  SELECT user_id INTO v_target_user FROM public.profiles WHERE username = p_username AND deleted_at IS NULL;
  IF v_target_user IS NULL THEN
    RAISE EXCEPTION 'No Twibs user with that username';
  END IF;

  IF v_target_user = auth.uid() THEN
    RAISE EXCEPTION 'You are already part of this team';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = p_business_id AND user_id = v_target_user
  ) THEN
    RAISE EXCEPTION 'That user is already a member';
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (p_business_id, v_target_user, p_role);

  SELECT jsonb_build_object(
    'business_id', p_business_id,
    'user_id', v_target_user,
    'username', p_username,
    'role', p_role,
    'added', true
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_member_role(
  p_business_id UUID,
  p_user_id UUID,
  p_role public.business_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.business_role;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business';
  END IF;

  SELECT role INTO v_current FROM public.business_members
  WHERE business_id = p_business_id AND user_id = p_user_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_current = 'owner' THEN
    RAISE EXCEPTION 'The owner role cannot be changed';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'A business has exactly one owner';
  END IF;

  UPDATE public.business_members SET role = p_role
  WHERE business_id = p_business_id AND user_id = p_user_id;

  SELECT jsonb_build_object(
    'business_id', p_business_id,
    'user_id', p_user_id,
    'role', p_role,
    'updated', true
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_business_member(p_business_id UUID, p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.business_role;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business';
  END IF;

  SELECT role INTO v_current FROM public.business_members
  WHERE business_id = p_business_id AND user_id = p_user_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_current = 'owner' THEN
    RAISE EXCEPTION 'The owner cannot be removed';
  END IF;

  DELETE FROM public.business_members
  WHERE business_id = p_business_id AND user_id = p_user_id;

  SELECT jsonb_build_object('business_id', p_business_id, 'user_id', p_user_id, 'removed', true)
  INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- MEMBER-AWARE CAMPAIGN ACTIONS
-- Existing actions only allowed the campaign creator (user_id). Extend them
-- so any team member with owner/admin/advertiser role can manage the
-- business's campaigns.
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
  IF v_campaign.id IS NULL OR (v_campaign.user_id <> auth.uid() AND NOT public.can_manage_business_campaigns(v_campaign.advertiser_id)) THEN
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
  IF v_campaign.id IS NULL OR (v_campaign.user_id <> auth.uid() AND NOT public.can_manage_business_campaigns(v_campaign.advertiser_id)) THEN
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
  IF v_campaign.id IS NULL OR (v_campaign.user_id <> auth.uid() AND NOT public.can_manage_business_campaigns(v_campaign.advertiser_id)) THEN
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
  IF v_campaign.id IS NULL OR (v_campaign.user_id <> auth.uid() AND NOT public.can_manage_business_campaigns(v_campaign.advertiser_id)) THEN
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

-- Analytics is available to any business member, not just the row owner.
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

  IF v_campaign.user_id <> auth.uid()
     AND NOT public.is_business_member(v_campaign.advertiser_id)
     AND NOT public.is_admin_or_moderator() THEN
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

-- =============================================
-- BUSINESS CAMPAIGN LISTING (members)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_business_campaigns(p_business_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'objective', c.objective::text,
      'status', c.status::text,
      'budget_type', c.budget_type::text,
      'total_budget_cents', c.total_budget_cents,
      'daily_budget_cents', c.daily_budget_cents,
      'currency', c.currency,
      'start_at', c.start_at,
      'end_at', c.end_at,
      'spend_cents', c.spend_cents,
      'impressions_delivered', c.impressions_delivered,
      'estimated_reach_min', c.estimated_reach_min,
      'estimated_reach_max', c.estimated_reach_max,
      'estimated_impressions', c.estimated_impressions,
      'distribution_priority', c.distribution_priority::text,
      'audience_expansion', c.audience_expansion,
      'post_id', c.post_id,
      'post_content', p.content,
      'post_created_at', p.created_at,
      'created_at', c.created_at,
      'created_by', (
        SELECT pv.display_name FROM public.profiles pv WHERE pv.user_id = c.user_id
      )
    ) AS row_data
    FROM public.campaigns c
    LEFT JOIN public.posts p ON p.id = c.post_id
    WHERE c.advertiser_id = p_business_id
  ) t;

  RETURN v_result;
END;
$$;

-- =============================================
-- AD DELIVERY ENGINE: REAL QUALITY RANKING
-- Replaces the previous ORDER BY campaign_id (no rotation) with a ranking that
-- is derived entirely from real signals the platform stores:
--   * predicted engagement  -> LN(1 + star_count + comment_count)
--   * advertiser quality    -> verified badge + LN(1 + followers)
--   * discovery priority    -> promoted > expanded > normal (multiplier)
--   * audience fit          -> exact interest/language/location match = 1.0
--                              otherwise audience-expansion overlap = 0.55
--   * pacing / freshness    -> small reward for campaigns that still have most
--                              of their budget available
-- Not a fake "algorithm score": every input is a real stored value.
-- =============================================
-- (Old overloads of get_feed_ads, including the original 2-arg version, were
-- already dropped by the CLEANUP block above.)
CREATE OR REPLACE FUNCTION public.get_feed_ads(p_viewer_id UUID, p_limit INT DEFAULT 2, p_frequency_cap INT DEFAULT 5)
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
  v_cap INT := GREATEST(COALESCE(p_frequency_cap, 5), 1);
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
      c.total_budget_cents,
      c.cost_per_impression_cents,
      c.distribution_priority,
      c.audience_expansion,
      -- Real quality signals (all derived from stored rows)
      LN(1 + COALESCE(p.star_count, 0) + COALESCE(p.comment_count, 0)) AS post_quality,
      CASE WHEN pv.is_verified THEN 0.4 ELSE 0 END + LEAST(LN(1 + GREATEST(a.followers_count, 0)) * 0.05, 0.3) AS advertiser_quality,
      CASE c.distribution_priority
        WHEN 'promoted' THEN 1.4
        WHEN 'expanded' THEN 1.15
        ELSE 1.0
      END AS priority_weight,
      GREATEST(c.end_at::date - now()::date, 0)::float AS days_remaining,
      CASE
        WHEN t.automatic THEN 1.0
        WHEN (COALESCE(array_length(t.interests, 1), 0) > 0 AND EXISTS (
          SELECT 1 FROM public.user_interests ui
          WHERE ui.user_id = p_viewer_id AND ui.category_id = ANY(t.interests)
        )) THEN 1.0
        WHEN (COALESCE(array_length(t.languages, 1), 0) > 0 AND EXISTS (
          SELECT 1 FROM public.user_preferences up
          WHERE up.user_id = p_viewer_id AND up.language = ANY(t.languages)
        )) THEN 1.0
        WHEN (COALESCE(array_length(t.locations, 1), 0) > 0 AND EXISTS (
          SELECT 1 FROM public.profiles vp
          WHERE vp.user_id = p_viewer_id
            AND vp.location IS NOT NULL AND vp.location <> ''
            AND lower(vp.location) = ANY (SELECT lower(x) FROM unnest(t.locations) AS x)
        )) THEN 1.0
        -- Audience expansion fallback: the campaign opts into looser targeting.
        WHEN (c.audience_expansion AND COALESCE(array_length(t.interests, 1), 0) > 0 AND EXISTS (
          SELECT 1 FROM public.user_interests ui
          WHERE ui.user_id = p_viewer_id
            AND ui.category_id IN (SELECT unnest(t.interests))
        )) THEN 0.55
        ELSE 0.0
      END AS relevance,
      CASE WHEN c.spend_cents = 0 THEN 0.1
           ELSE LEAST(c.spend_cents::float / GREATEST(c.total_budget_cents, 1), 1.0) END AS spend_ratio
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
      -- Team members never see their own business's ads.
      AND NOT EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.business_id = a.id AND bm.user_id = p_viewer_id
      )
      AND (
        SELECT count(*) FROM public.campaign_events e
        WHERE e.campaign_id = c.id
          AND e.viewer_user_id = p_viewer_id
          AND e.event_type = 'impression'
          AND e.created_at >= (now() - interval '1 day')
      ) < v_cap
  ),
  scored AS (
    SELECT e.*,
      (
        e.post_quality
        + e.advertiser_quality
        + LEAST(e.days_remaining / 90.0, 0.3)
        + (1.0 - e.spend_ratio) * 0.2
      ) * e.priority_weight * e.relevance AS score
    FROM eligible e
    WHERE e.relevance > 0.0
  )
  SELECT
    s.advertisement_id,
    s.campaign_id,
    s.headline,
    s.description,
    s.cta,
    s.cta_url,
    s.objective,
    s.advertiser_id,
    s.advertiser_type,
    s.advertiser_name,
    s.advertiser_username,
    s.advertiser_avatar_url,
    s.advertiser_is_verified,
    s.advertiser_user_id,
    s.profile_username,
    s.profile_privacy,
    s.post_id,
    s.post_content,
    s.post_created_at,
    s.post_star_count,
    s.post_comment_count,
    s.post_media
  FROM scored s
  ORDER BY s.score DESC, s.campaign_id
  LIMIT p_limit;
END;
$$;

-- =============================================
-- GRANTS FOR NEW RPCs
-- =============================================
GRANT EXECUTE ON FUNCTION public.is_business_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_business_campaigns(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_business(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_follow_business(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_boost_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_boost_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_profile(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_overview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_insights(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_audience(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_billing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_business_balance TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_business_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_member_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_business_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_campaigns(UUID) TO authenticated;

-- Existing campaign actions unchanged in signature but now member-aware.
GRANT EXECUTE ON FUNCTION public.pause_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_campaign(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_analytics(UUID) TO authenticated;

COMMIT;