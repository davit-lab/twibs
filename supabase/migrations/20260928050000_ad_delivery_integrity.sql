-- ============================================================================
-- Ad delivery integrity + measurement safety
-- ============================================================================
-- Context
--   The delivery pipeline (get_feed_ads -> record_ad_event ->
--   refresh_campaign_daily_stats) is real and functional, but three integrity
--   gaps made its numbers untrustworthy:
--
--   1. record_ad_event() validated only that the campaign existed and that the
--      advertisement belonged to it. Any signed-in user who learned (or
--      brute-forced) a campaign_id + advertisement_id pair could fire unlimited
--      impressions against a draft, completed or never-delivered campaign.
--      Because record_ad_event() is the ONLY writer of campaigns.spend_cents and
--      campaigns.impressions_delivered, that made both reported metrics
--      attacker-manipulable and could push spend past the total budget, which
--      then permanently blocks the campaign from delivery.
--
--   2. get_feed_ads() was left executable by PUBLIC with no auth.uid() check,
--      so any caller (including anon) could pass an arbitrary p_viewer_id and
--      read another user's ad-personalised result set. It also trusted an
--      unclamped p_limit.
--
--   3. get_feed_ads() joined the promoted post without checking
--      posts.visibility / posts.hidden. Because the function is SECURITY
--      DEFINER it bypassed the is_post_visible RLS policy, so a private or
--      staff-hidden post's content and media URLs could be served as an ad.
--
--   4. Campaign identity was read from campaigns.user_id (the creating auth
--      user) rather than the business, so a business promotion linked to the
--      individual's personal profile.
--
--   5. 'scheduled' campaigns were never promoted to 'active'.
--      admin_moderate_campaign sets 'scheduled' when start_at > now(), but
--      complete_expired_campaigns() only ever touched status = 'active', and
--      resume_campaign() only accepts 'paused'. A future-dated approved
--      campaign therefore never went live and was never delivered.
--
-- This migration fixes all five. It does not change the measurement rule: an
-- impression is still counted only when a real, eligible viewer actually sees
-- the ad and the client reports it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. record_ad_event(): enforce delivery eligibility server-side
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_event(
  p_event_id          TEXT,
  p_campaign_id        UUID,
  p_advertisement_id   UUID,
  p_event_type         public.ad_event_type,
  p_placement          public.ad_placement DEFAULT 'feed'::public.ad_placement
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_campaign   public.campaigns;
  v_advertiser public.advertiser_accounts;
  v_viewer     UUID := auth.uid();
  v_impression_cost BIGINT;
  v_impressions INTEGER;
  v_cap        INTEGER := 5;
BEGIN
  IF p_event_id IS NULL OR p_campaign_id IS NULL OR p_event_type IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF p_advertisement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.advertisements
    WHERE id = p_advertisement_id AND campaign_id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Advertisement does not belong to this campaign';
  END IF;

  -- An anonymous viewer can be served an ad in principle, but a signed-in
  -- viewer must be the one reporting the event. Otherwise any user could
  -- attribute events to somebody else.
  v_viewer := COALESCE(auth.uid(), v_campaign.user_id);

  SELECT * INTO v_advertiser
  FROM public.advertiser_accounts
  WHERE id = v_campaign.advertiser_id;

  IF v_advertiser.id IS NULL OR v_advertiser.status <> 'active' THEN
    RAISE EXCEPTION 'Advertiser is not active';
  END IF;

  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Campaign is not active';
  END IF;

  IF v_campaign.start_at > now() OR v_campaign.end_at < now() THEN
    RAISE EXCEPTION 'Campaign is outside its delivery window';
  END IF;

  -- Advertisers never generate impressions against their own campaign.
  IF p_event_type = 'impression' AND v_campaign.user_id = v_viewer THEN
    RETURN false;
  END IF;

  -- The React client de-dupes impressions per session, but that is a client-side
  -- courtesy only. Re-check the real frequency cap here so the limit holds even
  -- if the client is bypassed.
  IF p_event_type = 'impression' THEN
    SELECT count(*) INTO v_impressions
    FROM public.campaign_events e
    WHERE e.campaign_id = p_campaign_id
      AND e.viewer_user_id = v_viewer
      AND e.event_type = 'impression'
      AND e.created_at >= (now() - interval '1 day');

    IF v_impressions >= v_cap THEN
      RETURN false;
    END IF;

    -- Budget is enforced on delivery spend. Refuse the impression rather than
    -- letting recorded spend run past the cap.
    IF v_campaign.spend_cents + v_campaign.cost_per_impression_cents > v_campaign.total_budget_cents THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.campaign_events (event_id, campaign_id, advertisement_id, viewer_user_id, event_type, placement)
  VALUES (p_event_id, p_campaign_id, p_advertisement_id, v_viewer, p_event_type, p_placement)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_event_type = 'impression' THEN
    v_impression_cost := v_campaign.cost_per_impression_cents;

    UPDATE public.campaigns SET
      impressions_delivered = impressions_delivered + 1,
      spend_cents           = spend_cents + v_impression_cost,
      updated_at            = now()
    WHERE id = p_campaign_id;

    INSERT INTO public.campaign_daily_stats (campaign_id, stat_date, impressions, spend_cents)
    VALUES (p_campaign_id, now()::date, 1, v_impression_cost)
    ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
      impressions = public.campaign_daily_stats.impressions + 1,
      spend_cents = public.campaign_daily_stats.spend_cents + v_impression_cost;
  END IF;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_ad_event(TEXT, UUID, UUID, public.ad_event_type, public.ad_placement) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ad_event(TEXT, UUID, UUID, public.ad_event_type, public.ad_placement) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2 + 3 + 4. get_feed_ads(): auth, clamped limit, post visibility, business identity
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_feed_ads(
  p_viewer_id      UUID,
  p_limit          INT DEFAULT 2,
  p_frequency_cap  INT DEFAULT 5
)
RETURNS TABLE (
  advertisement_id        UUID,
  campaign_id             UUID,
  headline                TEXT,
  description             TEXT,
  cta                     TEXT,
  cta_url                 TEXT,
  objective               public.campaign_objective,
  advertiser_id           UUID,
  advertiser_type         public.advertiser_account_type,
  advertiser_name         TEXT,
  advertiser_username     TEXT,
  advertiser_avatar_url   TEXT,
  advertiser_is_verified  BOOLEAN,
  advertiser_user_id      UUID,
  profile_username        TEXT,
  profile_privacy         public.account_privacy,
  post_id                 UUID,
  post_content            TEXT,
  post_created_at         TIMESTAMPTZ,
  post_star_count         INTEGER,
  post_comment_count      INTEGER,
  post_media              JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viewer UUID;
  v_limit  INT;
  v_cap    INT;
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Viewer required';
  END IF;

  -- A signed-in caller may only ever request ads for themselves. Anonymous
  -- callers may not request a personalised set at all.
  IF auth.uid() IS NOT NULL THEN
    IF p_viewer_id <> auth.uid() THEN
      RAISE EXCEPTION 'Viewer must be the authenticated user';
    END IF;
    v_viewer := auth.uid();
  ELSE
    RETURN;  -- no audience data for anonymous traffic
  END IF;

  -- Clamp both knobs so a caller cannot request an unbounded result set or
  -- disable the frequency cap.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 2), 1), 10);
  v_cap   := LEAST(GREATEST(COALESCE(p_frequency_cap, 5), 1), 50);

  RETURN QUERY
  WITH eligible AS (
    SELECT
      ad.id AS ad_id,
      c.id AS c_id,
      c.user_id AS c_user_id,
      c.spend_cents AS c_spend,
      c.cost_per_impression_cents AS c_cpi,
      c.total_budget_cents AS c_total,
      c.start_at AS c_start,
      c.end_at AS c_end,
      c.distribution_priority AS c_priority,
      c.objective AS c_objective,
      c.cta AS c_cta,
      c.cta_url AS c_cta_url,
      c.headline AS c_headline,
      c.description AS c_description,
      a.id AS a_id,
      a.account_type AS a_type,
      a.name AS a_name,
      a.username AS a_username,
      a.avatar_url AS a_avatar,
      a.user_id AS a_user_id,
      a.followers_count AS a_followers,
      p.id AS p_id,
      p.user_id AS p_user_id,
      p.content AS p_content,
      p.created_at AS p_created,
      p.star_count AS p_stars,
      p.comment_count AS p_comments,
      LN(1 + COALESCE(p.star_count, 0) + COALESCE(p.comment_count, 0)) AS p_quality
    FROM public.campaigns c
    JOIN public.advertisements ad ON ad.campaign_id = c.id
    JOIN public.advertiser_accounts a ON a.id = c.advertiser_id
    LEFT JOIN public.posts p ON p.id = c.post_id
    LEFT JOIN public.campaign_targeting t ON t.campaign_id = c.id
    -- advertiser_accounts has no is_verified column; a business inherits the
    -- verification state of the profile that owns it.
    LEFT JOIN public.profiles pv ON pv.user_id = a.user_id
    WHERE c.status = 'active'
      AND a.status = 'active'
      AND c.start_at <= now()
      AND c.end_at >= now()
      AND c.user_id <> v_viewer
      -- The promoted post must be publicly viewable. SECURITY DEFINER bypasses
      -- the is_post_visible RLS policy, so the check has to be explicit here or
      -- private/hidden post content leaks through ad delivery.
      AND (p.id IS NULL OR (p.visibility = 'public' AND p.hidden = false))
      AND c.spend_cents + c.cost_per_impression_cents <= c.total_budget_cents
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE b.blocker_id = v_viewer AND b.blocked_id = c.user_id
      )
      -- Team members never see their own business's ads.
      AND NOT EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.business_id = a.id AND bm.user_id = v_viewer
      )
      AND (
        SELECT count(*) FROM public.campaign_events e
        WHERE e.campaign_id = c.id
          AND e.viewer_user_id = v_viewer
          AND e.event_type = 'impression'
          AND e.created_at >= (now() - interval '1 day')
      ) < v_cap
  ),
  scored AS (
    SELECT e.*,
      (
        e.p_quality
        + CASE WHEN pv.is_verified THEN LN(1 + e.a_followers) ELSE 0 END
        + LEAST(EXTRACT(DAY FROM (e.c_end - now())) / 90.0, 0.3)
        + (1.0 - (e.c_spend::NUMERIC / GREATEST(e.c_total, 1))) * 0.2
      ) * (CASE e.c_priority
             WHEN 'promoted' THEN 1.4
             WHEN 'expanded' THEN 1.15
             ELSE 1.0
           END)
      * (
        CASE
          WHEN t.automatic THEN 1.0
          WHEN (COALESCE(array_length(t.interests, 1), 0) > 0 AND EXISTS (
            SELECT 1 FROM public.user_interests ui
            WHERE ui.user_id = v_viewer AND ui.category_id = ANY(t.interests)
          )) THEN 1.0
          WHEN (COALESCE(array_length(t.languages, 1), 0) > 0 AND EXISTS (
            SELECT 1 FROM public.user_preferences up
            WHERE up.user_id = v_viewer AND up.language = ANY(t.languages)
          )) THEN 1.0
          WHEN (COALESCE(array_length(t.locations, 1), 0) > 0 AND EXISTS (
            SELECT 1 FROM public.profiles vp
            WHERE vp.user_id = v_viewer
              AND vp.location IS NOT NULL AND vp.location <> ''
              AND lower(vp.location) = ANY (SELECT lower(x) FROM unnest(t.locations) AS x)
          )) THEN 1.0
          ELSE 0.0
        END
      ) AS relevance
    FROM eligible e
    LEFT JOIN public.campaign_targeting t ON t.campaign_id = e.c_id
    LEFT JOIN public.profiles pv ON pv.user_id = e.a_user_id
  )
  SELECT
    s.ad_id,
    s.c_id,
    COALESCE(s.c_headline, s.a_name),
    COALESCE(s.c_description, left(s.p_content, 180)),
    COALESCE(s.c_cta, 'Visit Profile'),
    s.c_cta_url,
    s.c_objective,
    s.a_id,
    s.a_type,
    s.a_name,
    s.a_username,
    s.a_avatar,
    COALESCE(pv.is_verified, false),
    s.a_user_id,
    -- Business identity, not the creating individual's personal profile.
    s.a_username,
    COALESCE(pv.privacy, 'public'::public.account_privacy),
    s.p_id,
    s.p_content,
    s.p_created,
    COALESCE(s.p_stars, 0),
    COALESCE(s.p_comments, 0),
    COALESCE(pm.media, '[]'::jsonb)
  FROM scored s
  LEFT JOIN public.profiles pv ON pv.user_id = s.a_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id', m.id, 'url', m.url, 'type', m.type)) AS media
    FROM public.post_media m
    WHERE m.post_id = s.p_id
  ) pm ON true
  WHERE s.relevance > 0.0
  ORDER BY s.relevance DESC, s.c_id
  LIMIT v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_feed_ads(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed_ads(UUID, INT, INT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. complete_expired_campaigns(): also promote due 'scheduled' campaigns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_expired_campaigns()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  -- A scheduled campaign whose start time has arrived becomes active, otherwise
  -- it would sit in 'scheduled' forever and never be delivered.
  UPDATE public.campaigns
  SET status = 'active', updated_at = now()
  WHERE status = 'scheduled' AND start_at <= now();

  UPDATE public.campaigns
  SET status = 'completed', ended_at = now(), updated_at = now()
  WHERE status = 'active'
    AND (end_at <= now() OR spend_cents >= total_budget_cents);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- The maintenance jobs are for pg_cron / service use, not for end users.
REVOKE ALL ON FUNCTION public.complete_expired_campaigns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_expired_campaigns() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_expired_campaigns() TO service_role;


-- ----------------------------------------------------------------------------
-- 6. Drop the explicit `anon` grants
-- ----------------------------------------------------------------------------
-- REVOKE FROM PUBLIC alone is not enough here: these functions carry an
-- additional explicit EXECUTE grant for `anon`, so anonymous callers could
-- still invoke them (and, for the SECURITY DEFINER ones, reach data the anon
-- role has no direct RLS access to).
REVOKE ALL ON FUNCTION public.get_feed_ads(UUID, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.record_ad_event(TEXT, UUID, UUID, public.ad_event_type, public.ad_placement) FROM anon;
REVOKE ALL ON FUNCTION public.complete_expired_campaigns() FROM anon;
-- Same exposure class: a SECURITY DEFINER full-table rewriter.
REVOKE ALL ON FUNCTION public.refresh_campaign_daily_stats() FROM anon;
-- This one is reachable through PUBLIC (=X) rather than an explicit anon grant.
-- It is a SECURITY DEFINER full-table rewriter driven only by pg_cron, which runs
-- as the owner, so no end-user role needs EXECUTE.
REVOKE ALL ON FUNCTION public.refresh_campaign_daily_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_campaign_daily_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_daily_stats() TO service_role;
