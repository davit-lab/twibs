-- ============================================================
-- ADMIN ENTERPRISE UPGRADE — STEP 3: user deletion with
-- 7-day data retention + ZIP export + automatic purge.
--
-- Behavior change:
--   * Deleting a user now SOFT-deletes the account: the user is
--     banned, every session is revoked (they land on the sign-in
--     page), and their profile is anonymized + marked deleted.
--   * Their posts, reels, comments, messages and books are KEPT for
--     7 days (purge_due_at) so admin/support can export the data
--     as a ZIP before the account is hard-deleted.
--   * purge_expired_user_deletions() hard-deletes auth.users for
--     entries past their due date (FK cascades remove all content).
--   * user_delete_own_account() lets a user delete themselves.
-- ============================================================

-- ------------------------------------------------------------
-- 1. user_deletions — registry of deleted accounts + purge clock
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  username TEXT,
  reason TEXT,
  deleted_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_due_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_deletions_purge_due ON public.user_deletions (purge_due_at);

ALTER TABLE public.user_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read user deletions" ON public.user_deletions;
CREATE POLICY "Staff can read user deletions" ON public.user_deletions
  FOR SELECT USING (public.is_staff());
-- No insert/update/delete policies: writes only via SECURITY DEFINER RPCs.

-- ------------------------------------------------------------
-- 2. profiles.deleted_at — soft-delete marker (anonymized row)
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 3. Core soft-delete routine (internal; not callable via API)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_user(p_target_user_id uuid, p_reason TEXT DEFAULT NULL, p_allow_self boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_display text;
  v_username text;
BEGIN
  IF NOT p_allow_self AND p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot delete your own account';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'user does not exist';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_target_user_id;
  SELECT display_name, username INTO v_display, v_username
  FROM public.profiles WHERE user_id = p_target_user_id;

  -- 1. Revoke access: ban the account + destroy every session/token.
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until') THEN
      UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = p_target_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN DELETE FROM auth.sessions WHERE user_id = p_target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = p_target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 2. Register the deletion + (re)start the 7-day retention clock.
  INSERT INTO public.user_deletions (user_id, email, display_name, username, reason, deleted_by)
  VALUES (p_target_user_id, v_email, v_display, v_username, p_reason, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        username = EXCLUDED.username,
        reason = EXCLUDED.reason,
        deleted_by = EXCLUDED.deleted_by,
        purged_at = NULL,
        purge_due_at = now() + interval '7 days';

  -- 3. Anonymize + mark the profile as deleted.
  UPDATE public.profiles SET
    display_name = 'Deleted User',
    username = 'deleted_' || replace(p_target_user_id::text, '-', ''),
    avatar_url = NULL,
    bio = NULL,
    is_verified = false,
    deleted_at = now()
  WHERE user_id = p_target_user_id;

  -- 4. Remove account-level personal rows immediately.
  --    (Content — posts, reels, comments, messages, books — is retained.)
  DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.user_bans WHERE user_id = p_target_user_id;
  DELETE FROM public.user_shadow_bans WHERE user_id = p_target_user_id;
  DELETE FROM public.login_sessions WHERE user_id = p_target_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.verification_requests WHERE user_id = p_target_user_id;
  DELETE FROM public.reports WHERE reporter_id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_user(uuid, text, boolean) FROM PUBLIC;

-- ------------------------------------------------------------
-- 4. Admin delete — soft delete with audit
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.soft_delete_user(target_user_id);
  PERFORM public.audit_action('delete_user', 'user', target_user_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5. Self-service account deletion (kicks the user to /auth)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.soft_delete_user(v_uid, 'self-deleted', true);
  PERFORM public.audit_action('delete_own_account', 'user', v_uid::text);
END;
$$;

REVOKE ALL ON FUNCTION public.user_delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_delete_own_account() TO authenticated;

-- ------------------------------------------------------------
-- 6. Export a deleted user's retained data (staff)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', p_user_id,
      'email', (SELECT email FROM auth.users WHERE id = p_user_id),
      'display_name', (SELECT display_name FROM public.profiles WHERE user_id = p_user_id),
      'username', (SELECT username FROM public.profiles WHERE user_id = p_user_id),
      'joined_at', (SELECT created_at FROM public.profiles WHERE user_id = p_user_id)
    ),
    'posts',            COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.posts            WHERE user_id = p_user_id) t), '[]'::jsonb),
    'post_media',       COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.post_media       WHERE post_id IN (SELECT id FROM public.posts WHERE user_id = p_user_id)) t), '[]'::jsonb),
    'comments',         COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.comments         WHERE user_id = p_user_id) t), '[]'::jsonb),
    'reels',            COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.reels            WHERE user_id = p_user_id) t), '[]'::jsonb),
    'reel_comments',    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.reel_comments    WHERE user_id = p_user_id) t), '[]'::jsonb),
    'reel_likes',       COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.reel_likes       WHERE user_id = p_user_id) t), '[]'::jsonb),
    'messages',         COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.messages         WHERE sender_id = p_user_id) t), '[]'::jsonb),
    'message_attachments', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.message_attachments WHERE message_id IN (SELECT id FROM public.messages WHERE sender_id = p_user_id)) t), '[]'::jsonb),
    'books',            COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.books            WHERE author_id = p_user_id) t), '[]'::jsonb),
    'stories',          COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.stories          WHERE user_id = p_user_id) t), '[]'::jsonb),
    'library_items',    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.library_items    WHERE user_id = p_user_id) t), '[]'::jsonb),
    'stars_given',      COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.stars            WHERE user_id = p_user_id) t), '[]'::jsonb),
    'exported_at',      now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_data(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 7. Hard purge — permanently delete an account + all content
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  UPDATE public.user_deletions SET purged_at = now() WHERE user_id = p_user_id;

  PERFORM public.audit_action('purge_user_data', 'user', p_user_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_data(uuid) TO authenticated;

-- Auto-purge: hard-delete every account whose 7-day window has passed.
CREATE OR REPLACE FUNCTION public.purge_expired_user_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT user_id FROM public.user_deletions
    WHERE purged_at IS NULL AND purge_due_at <= now()
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = r.user_id;
      UPDATE public.user_deletions SET purged_at = now() WHERE user_id = r.user_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  PERFORM public.audit_action('purge_expired_user_data', 'system', NULL,
    jsonb_build_object('purged', v_count));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_user_deletions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_user_deletions() TO authenticated;
