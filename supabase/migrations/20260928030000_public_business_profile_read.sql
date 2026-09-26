-- Allow logged-out visitors to read a business profile.
--
-- PROBLEM
-- get_business_profile had EXECUTE revoked from PUBLIC and granted only to
-- `authenticated` (by the blanket business-RPC grant loop). A logged-out
-- visitor opening /business/<username> therefore got:
--     401 {"code":"42501","message":"permission denied for function
--          get_business_profile"}
-- and the page rendered its "this business isn't available" state. That
-- contradicts the business profile being a *public* brand page, and PostCard
-- links to /business/<username> for every viewer.
--
-- FIX
-- Grant anon EXECUTE on this one read-only function. It is already
-- SECURITY DEFINER and its WHERE clause is constrained to
--     account_type <> 'personal' AND status = 'active'
-- so it can only ever expose active, non-personal (i.e. business) accounts.
-- get_business_accounts stays authenticated-only: that one returns the
-- caller's own memberships, which must never be public.
--
-- The viewer-specific fields (is_following, my_role) resolve to false / 'none'
-- when auth.uid() is NULL, so an anonymous read leaks nothing extra.

GRANT EXECUTE ON FUNCTION public.get_business_profile(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_business_profile(TEXT) TO authenticated;
