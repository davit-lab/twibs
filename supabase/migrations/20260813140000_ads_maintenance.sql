-- =============================================
-- ADS MAINTENANCE: daily stat aggregation + cron
-- =============================================
-- * refresh_campaign_daily_stats() rolls campaign_events up into
--   campaign_daily_stats so analytics can render a per-day chart.
-- * complete_expired_campaigns() is scheduled on pg_cron to auto-complete
--   campaigns whose end date or budget has been reached.
-- =============================================

CREATE OR REPLACE FUNCTION public.refresh_campaign_daily_stats()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Upsert a row per (campaign_id, stat_date) for every campaign that has events.
  INSERT INTO public.campaign_daily_stats (
    campaign_id, stat_date,
    impressions, clicks, likes, comments, shares, saves,
    follows, profile_visits, website_clicks, conversions
  )
  SELECT
    e.campaign_id,
    (e.created_at AT TIME ZONE 'UTC')::date AS stat_date,
    count(*) FILTER (WHERE e.event_type = 'impression'),
    count(*) FILTER (WHERE e.event_type = 'click'),
    count(*) FILTER (WHERE e.event_type = 'like'),
    count(*) FILTER (WHERE e.event_type = 'comment'),
    count(*) FILTER (WHERE e.event_type = 'share'),
    count(*) FILTER (WHERE e.event_type = 'save'),
    count(*) FILTER (WHERE e.event_type = 'follow'),
    count(*) FILTER (WHERE e.event_type = 'profile_visit'),
    count(*) FILTER (WHERE e.event_type = 'website_click'),
    count(*) FILTER (WHERE e.event_type = 'conversion')
  FROM public.campaign_events e
  GROUP BY e.campaign_id, (e.created_at AT TIME ZONE 'UTC')::date
  ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
    impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    shares = EXCLUDED.shares,
    saves = EXCLUDED.saves,
    follows = EXCLUDED.follows,
    profile_visits = EXCLUDED.profile_visits,
    website_clicks = EXCLUDED.website_clicks,
    conversions = EXCLUDED.conversions;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_campaign_daily_stats() TO authenticated;

-- Schedule the maintenance job to run every 15 minutes if pg_cron is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('ads-daily-stats', '*/15 * * * *', 'SELECT public.refresh_campaign_daily_stats();');
    PERFORM cron.schedule('ads-complete-expired', '*/5 * * * *', 'SELECT public.complete_expired_campaigns();');
  END IF;
END;
$$;
