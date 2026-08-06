-- Fix admin verification toggle and subscription gifting
-- =========================================================
-- Two RLS gaps prevented admin actions from working:
--
-- 1) profiles: the only UPDATE policy was "user_id = auth.uid()", so an admin
--    could not flip is_verified on another user's profile (silently blocked).
--
-- 2) subscriptions: the only SELECT policy was "auth.uid() = user_id", so the
--    admin gift flow could never see an existing subscription; the follow-up
--    INSERT then collided with the UNIQUE(user_id) constraint and failed.

-- Allow admins to update any profile (verification status, etc.)
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Allow admins to view/manage all subscriptions so gifting works
CREATE POLICY "Admins can manage all subscriptions" ON public.subscriptions
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
