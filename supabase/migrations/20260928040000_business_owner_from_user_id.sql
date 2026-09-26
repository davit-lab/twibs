-- Ownership was expressible two ways:
--   1. advertiser_accounts.user_id  - the creator/owner recorded on the row
--   2. a business_members row with role 'owner' or 'admin'
--
-- can_admin_business() only ever consulted (2). Any business whose membership
-- row was never written - pre-existing rows created before the membership-writing
-- RPCs existed, or rows inserted by any path other than create_account - had an
-- owner who was not recognised as an owner *anywhere*. Because both the storage
-- policies and update_business_profile() route through this one helper, that
-- owner was locked out of their own business:
--
--   * avatar/cover upload -> "new row violates row-level security policy"
--   * profile edit        -> "You must be an owner or admin of this business"
--
-- 1. Treat advertiser_accounts.user_id as an owner grant. This is self-healing:
--    it repairs authorisation for every existing row without needing a backfill
--    to be re-run, and cannot drift out of sync with the accounts table.

CREATE OR REPLACE FUNCTION public.can_admin_business(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.advertiser_accounts a
      WHERE a.id = p_business_id
        AND a.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members m
      WHERE m.business_id = p_business_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    );
$$;

-- 2. Backfill the missing owner membership rows so that member lists, role
--    management and anything reading business_members see a consistent picture
--    rather than an ownerless business.
INSERT INTO public.business_members (business_id, user_id, role)
SELECT a.id, a.user_id, 'owner'
FROM public.advertiser_accounts a
WHERE a.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.business_members m
    WHERE m.business_id = a.id
      AND m.user_id = a.user_id
  )
ON CONFLICT (business_id, user_id) DO NOTHING;
