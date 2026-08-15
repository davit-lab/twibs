-- =============================================
-- ADS ACCOUNT MANAGEMENT
-- =============================================
-- * delete_advertiser_account() lets an owner remove a professional account.
--   It refuses to delete an account that still has live campaigns so we never
--   orphan active delivery, then removes the account (campaigns with no live
--   state are cascaded away).
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_advertiser_account(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.advertiser_accounts;
  v_live INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_account FROM public.advertiser_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL OR v_account.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Advertiser account not found or not owned by you';
  END IF;

  SELECT count(*) INTO v_live
  FROM public.campaigns c
  WHERE c.advertiser_id = p_account_id
    AND c.status IN ('draft', 'pending_payment', 'pending_review', 'scheduled', 'active', 'paused');

  IF v_live > 0 THEN
    RAISE EXCEPTION 'End or cancel this account''s campaigns before deleting it';
  END IF;

  DELETE FROM public.advertiser_accounts WHERE id = p_account_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_advertiser_account(UUID) TO authenticated;
