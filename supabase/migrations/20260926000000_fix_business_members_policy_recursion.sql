-- Fix: infinite recursion (42P17) in business_members / business_accounts RLS.
--
-- ROOT CAUSE
-- The live database carried a second, competing business model in
-- public.business_accounts that is not defined by any migration in this repo
-- and is not referenced anywhere in src/. It contained 0 rows.
--
-- Its RLS policy read public.business_members:
--     EXISTS (SELECT 1 FROM business_members bm
--             WHERE bm.business_id = business_accounts.id
--               AND bm.user_id = auth.uid())
--
-- ...while the policy on public.business_members read public.business_accounts:
--     EXISTS (SELECT 1 FROM business_accounts ba
--             WHERE ba.id = business_members.business_id
--               AND ba.owner_id = auth.uid())
--
-- Evaluating either table's policy therefore re-entered the other table's
-- policy forever, and PostgreSQL aborted with:
--     42P17: infinite recursion detected in policy for relation "business_members"
--
-- PostgREST surfaces that as HTTP 400 on the /rest/v1/rpc/create_business_account
-- request (the RPC is aborted mid-statement), and it also broke every direct
-- read of business_members, including the team-management list.
--
-- The SECURITY DEFINER helpers is_business_member() / is_admin_or_moderator()
-- were NOT at fault: both are owned by a BYPASSRLS role, so they never re-enter
-- RLS. Both are retained below.
--
-- FIX
-- 1. Drop the policy on business_members that referenced the orphan table.
-- 2. Drop the orphaned, empty, unreferenced business_accounts table -- this
--    retires the competing model and leaves advertiser_accounts as the single
--    source of truth for every account type.
-- 3. Reinstall a non-recursive SELECT policy on business_members that relies
--    only on the SECURITY DEFINER helpers.
--
-- SAFETY / IDEMPOTENCY
-- - The policy is dropped BEFORE the table, so no CASCADE (and no dependency
--   teardown) is required.
-- - business_accounts holds no rows and nothing depends on it: no foreign keys,
--   views, or functions reference it. Data loss: none.
-- - The file is fully re-runnable (DROP ... IF EXISTS / DROP POLICY IF EXISTS).
-- - Writes stay behind the SECURITY DEFINER RPCs, so no INSERT/UPDATE/DELETE
--   policy is granted here (least privilege).
-- - The new SELECT policy is equivalent to the surviving policy
--   "Members can view memberships they belong to"; access is unchanged for
--   legitimate members and admins.

BEGIN;

-- 1. Break the cycle: remove the policy that reaches into the orphan table.
DROP POLICY IF EXISTS "Business members can view membership" ON public.business_members;

-- 2. Retire the orphaned competing business model (0 rows, no dependents).
DROP TABLE IF EXISTS public.business_accounts;

-- 3. Non-recursive read access to memberships.
DROP POLICY IF EXISTS "Members can view memberships they belong to" ON public.business_members;

CREATE POLICY "Members can view memberships they belong to"
  ON public.business_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_business_member(business_id)
    OR public.is_admin_or_moderator()
  );

COMMIT;
