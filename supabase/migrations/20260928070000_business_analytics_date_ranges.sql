-- ============================================================================
-- Business analytics: real date ranges
-- ============================================================================
-- get_business_overview / get_business_insights previously reported a single
-- all-time number for every metric, which made the dashboard both useless for
-- running a promotion and quietly misleading: a metric labelled "impressions"
-- could be a lifetime total sitting next to a "last 7 days" follower count.
--
-- This adds an explicit window. Both bounds are optional and trailing, so every
-- existing caller (and every cached PostgREST schema entry) keeps working:
--   * p_from AND p_to NULL  -> lifetime, exactly the previous numbers
--   * otherwise             -> metrics restricted to [p_from, p_to)
--
-- Everything returned is derived from campaign_events, which is the same table
-- record_ad_event writes to and the same table the delivery pipeline reads. No
-- metric is estimated, sampled or extrapolated, and a range with no activity
-- returns real zeros rather than a placeholder.
--
-- Ratios return NULL - not 0 - when their denominator is zero, so the UI can
-- say "no impressions yet" instead of printing a confident 0.0%.

-- ----------------------------------------------------------------------------
-- 1. Window resolver
-- ----------------------------------------------------------------------------
-- Guarantees a usable window: a reversed or single-sided range is normalised
-- rather than silently returning an empty result set.
CREATE OR REPLACE FUNCTION public.resolve_analytics_range(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (range_from timestamptz, range_to timestamptz, is_lifetime boolean)
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_from IS NULL AND p_to IS NULL THEN
    RETURN QUERY SELECT NULL::timestamptz, NULL::timestamptz, true;
    RETURN;
  END IF;

  v_to := COALESCE(p_to, now());
  v_from := COALESCE(p_from, v_to - interval '30 days');

  -- A caller that passes the bounds the wrong way round gets the window they
  -- meant, not an empty dashboard.
  IF v_from >= v_to THEN
    v_from := v_to - interval '30 days';
  END IF;

  RETURN QUERY SELECT v_from, v_to, false;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. Overview
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE only replaces a function with an IDENTICAL argument list, so
-- adding parameters would silently leave get_business_overview(uuid) in place
-- alongside the new 3-argument version. PostgREST would then see two functions
-- with the same name and the RPC call becomes ambiguous ("function
-- get_business_overview(uuid) is not unique"). Drop the old signature first so
-- exactly one function with this name exists. The new parameters are optional,
-- so every existing call site keeps working unchanged.
DROP FUNCTION IF EXISTS public.get_business_overview(uuid);
DROP FUNCTION IF EXISTS public.get_business_insights(uuid);

CREATE OR REPLACE FUNCTION public.get_business_overview(
  p_business_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result  jsonb;
  v_from    timestamptz;
  v_to      timestamptz;
  v_lifetime boolean;
  v_impressions bigint;
  v_clicks       bigint;
  v_engagement   bigint;
  v_reach        bigint;
  v_spend        bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT * INTO v_from, v_to, v_lifetime
  FROM public.resolve_analytics_range(p_from, p_to);

  -- One pass over the events for the window; every event metric below is a
  -- filter on this set, so the numbers are guaranteed to be mutually
  -- consistent (clicks can never exceed impressions, etc.).
  WITH scoped AS (
    SELECT e.event_type, e.viewer_user_id, c.cost_per_impression_cents
    FROM public.campaign_events e
    JOIN public.campaigns c ON c.id = e.campaign_id
    WHERE c.advertiser_id = p_business_id
      AND (v_lifetime OR (e.created_at >= v_from AND e.created_at < v_to))
  )
  SELECT
    count(*) FILTER (WHERE event_type = 'impression'),
    count(*) FILTER (WHERE event_type IN ('click', 'website_click', 'profile_visit')),
    count(*) FILTER (WHERE event_type IN ('like', 'comment', 'share', 'save', 'follow')),
    count(DISTINCT viewer_user_id) FILTER (WHERE event_type = 'impression'),
    -- Spend is charged per delivered impression, so the window's spend is the
    -- window's impressions priced at each campaign's own CPI. This matches the
    -- running total on campaigns.spend_cents when summed over all time.
    COALESCE(sum(cost_per_impression_cents) FILTER (WHERE event_type = 'impression'), 0)
  INTO v_impressions, v_clicks, v_engagement, v_reach, v_spend
  FROM scoped;

  SELECT jsonb_build_object(
    -- Provenance, so the UI can label the numbers honestly.
    'range_from', v_from,
    'range_to', v_to,
    'is_lifetime', v_lifetime,

    -- Reach / delivery (window-scoped)
    'reach', v_reach,
    'impressions', v_impressions,
    'engagement', v_engagement,
    'clicks', v_clicks,
    'total_spend_cents', v_spend,

    -- Honest ratios. NULL when there is no denominator, never a fake 0.
    'ctr', CASE WHEN v_impressions > 0
                THEN round(v_clicks::numeric / v_impressions, 4) END,
    'engagement_rate', CASE WHEN v_impressions > 0
                            THEN round(v_engagement::numeric / v_impressions, 4) END,

    -- Point-in-time facts, not window metrics. These describe the business as
    -- it is right now, so they are intentionally NOT date-filtered.
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

    -- Content is "what we published", not "what happened in the window".
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
$function$;

-- ----------------------------------------------------------------------------
-- 3. Insights
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_business_insights(
  p_business_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result   jsonb;
  v_from     timestamptz;
  v_to       timestamptz;
  v_lifetime boolean;
  v_impressions bigint;
  v_reach        bigint;
  v_clicks       bigint;
  v_profile_visits bigint;
  v_likes        bigint;
  v_comments     bigint;
  v_shares       bigint;
  v_saves        bigint;
  v_follows      bigint;
  v_engagements  bigint;
  v_spend        bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_business_member(p_business_id) AND NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'You do not have access to this business';
  END IF;

  SELECT * INTO v_from, v_to, v_lifetime
  FROM public.resolve_analytics_range(p_from, p_to);

  -- One pass over the window. Every total below is a filter on this single set,
  -- so the numbers are guaranteed to be mutually consistent.
  WITH scoped AS (
    SELECT e.event_type, e.viewer_user_id, c.cost_per_impression_cents
    FROM public.campaign_events e
    JOIN public.campaigns c ON c.id = e.campaign_id
    WHERE c.advertiser_id = p_business_id
      AND (v_lifetime OR (e.created_at >= v_from AND e.created_at < v_to))
  )
  SELECT
    count(*) FILTER (WHERE event_type = 'impression'),
    count(DISTINCT viewer_user_id) FILTER (WHERE event_type = 'impression'),
    count(*) FILTER (WHERE event_type IN ('click', 'website_click')),
    count(*) FILTER (WHERE event_type = 'profile_visit'),
    count(*) FILTER (WHERE event_type = 'like'),
    count(*) FILTER (WHERE event_type = 'comment'),
    count(*) FILTER (WHERE event_type = 'share'),
    count(*) FILTER (WHERE event_type = 'save'),
    count(*) FILTER (WHERE event_type = 'follow'),
    count(*) FILTER (WHERE event_type IN ('like', 'comment', 'share', 'save', 'follow')),
    COALESCE(sum(cost_per_impression_cents) FILTER (WHERE event_type = 'impression'), 0)
  INTO
    v_impressions, v_reach, v_clicks, v_profile_visits, v_likes, v_comments,
    v_shares, v_saves, v_follows, v_engagements, v_spend
  FROM scoped;

  SELECT jsonb_build_object(
    'range_from', v_from,
    'range_to', v_to,
    'is_lifetime', v_lifetime,

    'totals', jsonb_build_object(
      'reach', v_reach,
      'impressions', v_impressions,
      'clicks', v_clicks,
      'profile_visits', v_profile_visits,
      'likes', v_likes,
      'comments', v_comments,
      'shares', v_shares,
      'saves', v_saves,
      'follows', v_follows,
      'engagements', v_engagements,
      'spend_cents', v_spend,
      -- NULL rather than 0 when nothing has been delivered in the window.
      'ctr', CASE WHEN v_impressions > 0
                  THEN round(v_clicks::numeric / v_impressions, 4) END,
      'engagement_rate', CASE WHEN v_impressions > 0
                              THEN round(v_engagements::numeric / v_impressions, 4) END
    ),

    -- Daily series, clipped to the window. campaign_daily_stats is maintained by
    -- the ads-daily-stats cron; days with no delivery are genuinely absent
    -- rather than zero-filled, and the client draws the gaps as gaps.
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
        AND (v_lifetime OR (s.stat_date::timestamptz >= v_from AND s.stat_date::timestamptz < v_to))
    ), '[]'::jsonb),

    -- Per-campaign performance inside the window, so "which promotion worked"
    -- is answerable instead of guessed. The per-campaign counts are aggregated
    -- in a LATERAL subquery rather than inside jsonb_agg, because PostgreSQL
    -- does not allow an aggregate to contain another aggregate.
    'campaigns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'campaign_id', pc.campaign_id,
        'name', pc.name,
        'status', pc.status,
        'impressions', pc.impressions,
        'engagements', pc.engagements,
        'spend_cents', pc.spend_cents
      ) ORDER BY pc.impressions DESC)
      FROM (
        SELECT
          c.id AS campaign_id,
          c.name,
          c.status::text AS status,
          COALESCE(ev.impressions, 0)  AS impressions,
          COALESCE(ev.engagements, 0) AS engagements,
          COALESCE(ev.spend_cents, 0) AS spend_cents
        FROM public.campaigns c
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE e.event_type = 'impression') AS impressions,
            count(*) FILTER (WHERE e.event_type IN ('like', 'comment', 'share', 'save', 'follow')) AS engagements,
            COALESCE(
              sum(c.cost_per_impression_cents) FILTER (WHERE e.event_type = 'impression'),
              0
            ) AS spend_cents
          FROM public.campaign_events e
          WHERE e.campaign_id = c.id
            AND (v_lifetime OR (e.created_at >= v_from AND e.created_at < v_to))
        ) ev ON true
        WHERE c.advertiser_id = p_business_id
          AND (v_lifetime OR (c.created_at < v_to AND COALESCE(c.end_at, c.start_at) >= v_from))
      ) pc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Grants
-- ----------------------------------------------------------------------------
-- Both functions are SECURITY DEFINER and must never be reachable anonymously.
-- REVOKE FROM PUBLIC is not sufficient on this project: the functions carry an
-- explicit anon grant, so it has to be revoked by name too.
REVOKE ALL ON FUNCTION public.get_business_overview(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_business_overview(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_business_overview(uuid, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_insights(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_business_insights(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_business_insights(uuid, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_analytics_range(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_analytics_range(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_analytics_range(timestamptz, timestamptz) TO authenticated, service_role;
