-- Business profile assets: member-scoped Storage access.
--
-- PROBLEM
-- Business avatars/covers had no upload path. The existing Storage policies
-- only allow writes when the first path segment equals the caller's auth uid:
--     (storage.foldername(name))[1] = auth.uid()::text
-- A business is identified by advertiser_accounts.id, which is NOT the owner's
-- auth uid, so a business-scoped path such as `<business_id>/avatar.jpg` could
-- never be written -- and if it were, that policy would be the wrong check
-- anyway (it authorises by *user* folder, not by *business membership*).
--
-- FIX
-- 1. Add can_manage_asset_folder(text): a single, cast-safe authorisation
--    helper used by every avatar/cover write policy. It returns true when the
--    folder is the caller's own uid (personal assets, unchanged behaviour) OR
--    when the folder is a business id the caller owns/administers. The cast is
--    guarded so a non-uuid folder can never raise inside a policy.
-- 2. Replace the avatars/covers write policies with helper-based ones that
--    cover both personal and business assets, so no unrelated authenticated
--    user can write into somebody else's business folder.
-- 3. Constrain the two buckets to images with a 10MB ceiling, matching what
--    the UI already enforces (avatars were previously unlimited).
--
-- Reads stay public: profile images must render for logged-out visitors, and
-- the buckets are public. Authorisation is only about *writing*.
--
-- IDEMPOTENCY: CREATE OR REPLACE / DROP POLICY IF EXISTS are re-runnable.

-- =============================================
-- Cast-safe authorisation helper
-- =============================================
CREATE OR REPLACE FUNCTION public.can_manage_asset_folder(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_business_id UUID;
BEGIN
  -- Not signed in -> no writes at all.
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Personal assets keep working exactly as before.
  IF p_folder = v_uid::text THEN
    RETURN TRUE;
  END IF;

  -- Business assets: only if the folder is a real business id AND the caller
  -- owns or administers that business. The regex guard means a non-uuid
  -- folder short-circuits instead of raising (which would surface as a 42P02
  -- error on the upload rather than a clean "not allowed").
  IF p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;

  v_business_id := p_folder::uuid;

  RETURN public.can_admin_business(v_business_id);
END;
$$;

-- =============================================
-- avatars: insert / update / delete
-- =============================================
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Members can upload avatar assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

CREATE POLICY "Members can update avatar assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

CREATE POLICY "Members can delete avatar assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

-- =============================================
-- covers: insert / update / delete
-- =============================================
DROP POLICY IF EXISTS "Users can upload their own covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own covers" ON storage.objects;

CREATE POLICY "Members can upload cover assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

CREATE POLICY "Members can update cover assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'covers'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'covers'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

CREATE POLICY "Members can delete cover assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'covers'
    AND public.can_manage_asset_folder((storage.foldername(name))[1])
  );

-- =============================================
-- Bucket hardening: images only, 10MB ceiling
-- (avatars was previously unlimited; the UI already caps at 5-10MB)
-- =============================================
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id IN ('avatars', 'covers');

-- The helper is only ever called from RLS policies; expose it to the client
-- roles the same way as the other business helpers.
REVOKE ALL ON FUNCTION public.can_manage_asset_folder(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_asset_folder(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_asset_folder(TEXT) TO authenticated;
