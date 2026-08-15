-- =============================================
-- FIX: campaigns -> profiles relationship
-- campaigns.user_id previously only referenced auth.users(id), so PostgREST
-- could not embed profiles() from campaigns (error: "could not find
-- relationship between 'campaigns' and 'profiles'"). Point it at
-- public.profiles(user_id) like posts/comments/messages already do.
-- =============================================

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_user_id_profiles_fkey;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
