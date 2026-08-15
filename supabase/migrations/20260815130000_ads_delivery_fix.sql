-- =============================================
-- ADS DELIVERY FIX
-- The audience estimator required >= 10 active profiles before a campaign
-- could be submitted. On a small/early platform this made it impossible to
-- ever launch a campaign (and therefore impossible to deliver ads).
-- Relax the threshold so any platform with at least 2 live profiles can
-- launch, and keep reach/impression estimates at a minimum of 1 so the
-- cost-per-impression math stays sane.
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

  -- Estimates are deliberately conservative and labeled as such in the UI,
  -- but never 0 so the cost-per-impression math works on small platforms.
  reach_min := least(greatest(floor(v_matched * 0.15), 1), v_matched);
  reach_max := greatest(least(floor(v_matched * 0.40), v_matched), reach_min);
  estimated_impressions := greatest(floor(reach_max * 2.2), 1);

  -- At least 2 live profiles so there is realistically someone to show the
  -- ad to beyond the advertiser themself (advertisers never see their own ads).
  sufficient_data := v_total >= 2 AND v_matched > 0;

  RETURN NEXT;
END;
$$;
