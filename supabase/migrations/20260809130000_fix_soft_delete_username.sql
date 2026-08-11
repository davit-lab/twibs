-- ============================================================
-- Fix: soft-delete anonymization violated profiles.username_length
-- (max 30 chars). The generated username was 'deleted_' (8 chars)
-- + the 32-char UUID without dashes = 40 chars, so every admin
-- delete hit the CHECK constraint and rolled back.
--
-- Redefine soft_delete_user to truncate the deterministic suffix
-- to 20 hex chars ('deleted_' + 20 = 28 chars, well under 30).
-- Collision probability across user UUIDs is ~2^-80.
-- ============================================================

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
    username = 'deleted_' || left(replace(p_target_user_id::text, '-', ''), 20),
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
