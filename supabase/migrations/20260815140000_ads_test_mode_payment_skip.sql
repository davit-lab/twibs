-- =============================================
-- ADS TEST MODE: PAYMENT SKIPPED
-- The platform currently runs in test mode, so campaigns must not require
-- payment. Submitting a campaign now goes straight to pending_review, and
-- staff can approve it without a paid_at marker.
-- The Stripe payment path (confirm_campaign_payment / approve_payment) is
-- left intact so it can be re-enabled for production later.
-- =============================================

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
    status = 'pending_review',
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
    -- Test mode: approval does not require the campaign to have been paid.
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
    RAISE EXCEPTION 'Unknown action: %', p_action;
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
