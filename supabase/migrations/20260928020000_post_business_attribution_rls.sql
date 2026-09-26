-- Close a business-attribution bypass in posts RLS.
--
-- PROBLEM
-- Postgres combines multiple PERMISSIVE RLS policies with OR, so a row is
-- writable if ANY policy's check passes. posts had two INSERT policies:
--
--   A) "Members can attribute posts to their business"
--        (business_id IS NULL) OR (user_id = auth.uid() AND is_business_member(business_id))
--   B) "Users can create their own posts"
--        user_id = auth.uid()
--
-- Policy B passes for any authenticated user, so policy A's membership test was
-- irrelevant: a user could set business_id to ANY business id and create a post
-- attributed to a company they do not belong to. Verified against the live
-- project -- a brand-new account successfully created a post attributed to an
-- unrelated business (HTTP 201).
--
-- UPDATE had the same class of bug: its WITH CHECK was only
-- user_id = auth.uid(), so the author of a personal post could edit it into an
-- attributed post for any business.
--
-- FIX
-- 1. Collapse INSERT to a single authoritative policy that requires both
--    ownership of the row AND (no business OR membership of that business).
-- 2. For UPDATE, keep ownership as the gate but add a trigger that rejects a
--    *change* of business_id to a business the author is not a member of. A
--    policy alone cannot express "business_id unchanged", because WITH CHECK
--    only sees the new row; a trigger can compare against the old row. This
--    keeps ordinary content edits working for the author while preventing
--    attribution being reassigned or attached after the fact.
-- 3. Optionally claim a pending attributed post for one's own business, which
--    the old UPDATE policy also permitted. The trigger compares identities
--    rather than values so a NULL <-> id transition is still validated.
--
-- service_role bypasses RLS, so administrative tooling is unaffected.

-- =============================================
-- INSERT: one policy, no OR-permissive footgun
-- =============================================
DROP POLICY IF EXISTS "Users can create their own posts" ON public.posts;
DROP POLICY IF EXISTS "Members can attribute posts to their business" ON public.posts;

CREATE POLICY "Authors can create posts for themselves or their business"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      business_id IS NULL
      OR public.is_business_member(business_id)
    )
  );

-- =============================================
-- UPDATE: block unauthorised business reassignment
-- =============================================
CREATE OR REPLACE FUNCTION public.enforce_post_business_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  -- Only act when the attribution actually changes.
  IF NEW.business_id IS NOT DISTINCT FROM OLD.business_id THEN
    RETURN NEW;
  END IF;

  -- Service/admin paths and the row owner are handled by the caller; here we
  -- only need to validate the actor may attribute to the requested business.
  IF NEW.business_id IS NOT NULL THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_business_member(NEW.business_id) THEN
      RAISE EXCEPTION 'You must be a member of this business to attribute a post to it'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_enforce_business_attribution ON public.posts;

CREATE TRIGGER posts_enforce_business_attribution
  BEFORE UPDATE OF business_id ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_post_business_attribution();

REVOKE ALL ON FUNCTION public.enforce_post_business_attribution() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_post_business_attribution() FROM anon;
