-- ============================================================
-- ADMIN ENTERPRISE UPGRADE — STEP 2: settings, audit, shadow bans,
-- content moderation, and admin RPCs.
-- Run AFTER 20260809040000_admin_rbac_roles.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. RBAC helper functions (super_admin inherits admin powers;
--    support/moderator get scoped staff powers)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
$$;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('moderator', 'admin', 'super_admin')
    )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'moderator')
    )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'moderator', 'support')
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ------------------------------------------------------------
-- 2. system_settings — global kill switches / feature flags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value) VALUES
    ('maintenance_mode',            'false'::jsonb),
    ('allow_registrations',         'true'::jsonb),
    ('reels_upload_enabled',        'true'::jsonb),
    ('comments_enabled',            'true'::jsonb),
    ('story_posting_enabled',       'true'::jsonb),
    ('direct_messages_enabled',     'true'::jsonb),
    ('interest_posting_enabled',    'true'::jsonb),
    ('signup_onboarding_enabled',   'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read settings" ON public.system_settings;
CREATE POLICY "Anyone can read settings" ON public.system_settings
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policies: writes only via set_system_setting RPC.

-- ------------------------------------------------------------
-- 3. admin_audit_logs — immutable record of every admin action
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON public.admin_audit_logs (target_type, target_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Staff can read audit logs" ON public.admin_audit_logs
  FOR SELECT USING (public.is_staff());
-- Immutable by construction: no INSERT/UPDATE/DELETE policies. Only the
-- SECURITY DEFINER audit_action() function (table owner) can write.

-- Guard triggers: hard-block any UPDATE or DELETE on the audit log,
-- even for the table owner, so the trail can never be altered.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin audit logs are immutable';
END;
$$;

DROP TRIGGER IF EXISTS prevent_audit_log_update ON public.admin_audit_logs;
CREATE TRIGGER prevent_audit_log_update
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS prevent_audit_log_delete ON public.admin_audit_logs;
CREATE TRIGGER prevent_audit_log_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- ------------------------------------------------------------
-- 4. user_shadow_bans — invisibly limit a user's reach
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_shadow_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    banned_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

ALTER TABLE public.user_shadow_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read shadow bans" ON public.user_shadow_bans;
CREATE POLICY "Staff can read shadow bans" ON public.user_shadow_bans
  FOR SELECT USING (public.is_staff());
-- No insert/update/delete policies: admin_shadow_ban RPC only.

CREATE OR REPLACE FUNCTION public.is_shadow_banned(target uuid DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_shadow_bans
        WHERE user_id = target AND is_active
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_shadow_banned(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. Content moderation: hidden flags
-- ------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- Hidden posts disappear from everyone's feed except staff.
CREATE OR REPLACE FUNCTION public.is_post_visible(post_row public.posts)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN post_row.user_id = auth.uid() THEN true
            WHEN public.is_admin_or_moderator() THEN true
            WHEN post_row.hidden THEN false
            WHEN public.is_shadow_banned(post_row.user_id) THEN false
            WHEN public.is_blocked(auth.uid(), post_row.user_id) THEN false
            WHEN post_row.visibility = 'public' THEN true
            WHEN post_row.visibility = 'private' THEN false
            WHEN post_row.visibility = 'followers' THEN
                public.is_following(auth.uid(), post_row.user_id)
            ELSE false
        END
$$;

DROP POLICY IF EXISTS "Anyone can view published reels" ON public.reels;
CREATE POLICY "Anyone can view published reels" ON public.reels
  FOR SELECT USING (
    (is_published = true OR user_id = auth.uid())
    AND (NOT hidden OR public.is_admin_or_moderator())
  );

DROP POLICY IF EXISTS "Anyone can view published books" ON public.books;
CREATE POLICY "Anyone can view published books" ON public.books
  FOR SELECT USING (
    (status = 'published' OR author_id = auth.uid() OR public.is_admin_or_moderator())
    AND (NOT hidden OR public.is_admin_or_moderator())
  );

-- ------------------------------------------------------------
-- 6. audit_action — the single write path into the audit log
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_action(
    p_action TEXT,
    p_target_type TEXT DEFAULT NULL,
    p_target_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (auth.uid(), v_email, p_action, p_target_type, p_target_id, p_details);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_action(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_action(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 7. Admin RPCs
-- ------------------------------------------------------------

-- Role management (super admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins can change roles';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot change your own role';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role IN ('super_admin', 'admin', 'moderator', 'support');

  IF p_role <> 'user' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);
  END IF;

  PERFORM public.audit_action(
    'set_user_role', 'user', p_user_id::text,
    jsonb_build_object('role', p_role::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, public.app_role) TO authenticated;

-- Log the user out of every session (staff)
CREATE OR REPLACE FUNCTION public.admin_logout_all_sessions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  DELETE FROM public.login_sessions WHERE user_id = p_user_id;

  PERFORM public.audit_action('logout_all_sessions', 'user', p_user_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_logout_all_sessions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_logout_all_sessions(UUID) TO authenticated;

-- Read a user's active sessions (staff)
CREATE OR REPLACE FUNCTION public.admin_get_user_sessions(p_user_id UUID)
RETURNS SETOF public.login_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.login_sessions
    WHERE user_id = p_user_id
    ORDER BY last_active_at DESC NULLS LAST
    LIMIT 25;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_sessions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_sessions(UUID) TO authenticated;

-- Bulk email lookup for the users table (staff)
CREATE OR REPLACE FUNCTION public.admin_get_user_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id, u.email::text
    FROM auth.users u
    WHERE u.id = ANY(p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_emails(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_emails(UUID[]) TO authenticated;

-- Shadow ban / un-shadow ban (admin)
CREATE OR REPLACE FUNCTION public.admin_shadow_ban(p_user_id UUID, p_active BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_active THEN
    INSERT INTO public.user_shadow_bans (user_id, banned_by, reason)
    VALUES (p_user_id, auth.uid(), p_reason)
    ON CONFLICT (user_id) DO UPDATE
      SET is_active = true, reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by;
  ELSE
    UPDATE public.user_shadow_bans SET is_active = false WHERE user_id = p_user_id;
  END IF;

  PERFORM public.audit_action(
    CASE WHEN p_active THEN 'shadow_ban_user' ELSE 'unshadow_ban_user' END,
    'user', p_user_id::text,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_shadow_ban(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_shadow_ban(UUID, BOOLEAN, TEXT) TO authenticated;

-- Hide / unhide reported content (staff)
CREATE OR REPLACE FUNCTION public.admin_toggle_content_hidden(p_target_type TEXT, p_target_id UUID, p_hidden BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  CASE p_target_type
    WHEN 'post' THEN UPDATE public.posts SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'reel' THEN UPDATE public.reels SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'book' THEN UPDATE public.books SET hidden = p_hidden WHERE id = p_target_id;
    ELSE RAISE EXCEPTION 'unsupported target type';
  END CASE;

  PERFORM public.audit_action(
    CASE WHEN p_hidden THEN 'hide_content' ELSE 'unhide_content' END,
    p_target_type, p_target_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_content_hidden(TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_content_hidden(TEXT, UUID, BOOLEAN) TO authenticated;

-- Generic content deletion (staff)
CREATE OR REPLACE FUNCTION public.admin_delete_content(p_target_type TEXT, p_target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  CASE p_target_type
    WHEN 'post' THEN DELETE FROM public.posts WHERE id = p_target_id;
    WHEN 'reel' THEN DELETE FROM public.reels WHERE id = p_target_id;
    WHEN 'book' THEN DELETE FROM public.books WHERE id = p_target_id;
    WHEN 'comment' THEN DELETE FROM public.comments WHERE id = p_target_id;
    ELSE RAISE EXCEPTION 'unsupported target type';
  END CASE;

  PERFORM public.audit_action('delete_content', p_target_type, p_target_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_content(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_content(TEXT, UUID) TO authenticated;

-- System settings (admin)
CREATE OR REPLACE FUNCTION public.set_system_setting(p_key TEXT, p_value JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.system_settings (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

  PERFORM public.audit_action(
    'set_system_setting', 'setting', p_key,
    jsonb_build_object('value', p_value)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_system_setting(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_system_setting(TEXT, JSONB) TO authenticated;

-- Per-user activity metrics (staff)
CREATE OR REPLACE FUNCTION public.admin_get_user_activity(p_user_id UUID)
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
    'posts',             (SELECT count(*) FROM public.posts WHERE user_id = p_user_id),
    'comments',          (SELECT count(*) FROM public.comments WHERE user_id = p_user_id),
    'reels',             (SELECT count(*) FROM public.reels WHERE user_id = p_user_id),
    'books',             (SELECT count(*) FROM public.books WHERE author_id = p_user_id),
    'stars_given',       (SELECT count(*) FROM public.stars WHERE user_id = p_user_id),
    'following',         (SELECT count(*) FROM public.follows WHERE follower_id = p_user_id AND status = 'accepted'),
    'followers',         (SELECT count(*) FROM public.follows WHERE following_id = p_user_id AND status = 'accepted'),
    'reports_filed',     (SELECT count(*) FROM public.reports WHERE reporter_id = p_user_id),
    'reports_received',  (SELECT count(*) FROM public.reports WHERE target_id::text = p_user_id::text),
    'verification_requests', (SELECT count(*) FROM public.verification_requests WHERE user_id = p_user_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity(UUID) TO authenticated;

-- Add audit logging to the existing destructive admin functions
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_ids uuid[];
  target_reel_ids uuid[];
  target_story_ids uuid[];
  target_book_ids uuid[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot delete your own account';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_post_ids
  FROM public.posts WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_reel_ids
  FROM public.reels WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_story_ids
  FROM public.stories WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_book_ids
  FROM public.books WHERE author_id = target_user_id;

  DELETE FROM public.post_media WHERE post_id = ANY(target_post_ids);
  DELETE FROM public.stars WHERE user_id = target_user_id OR post_id = ANY(target_post_ids);
  DELETE FROM public.comment_votes WHERE user_id = target_user_id OR comment_id IN (
    SELECT c.id FROM public.comments c WHERE c.user_id = target_user_id OR c.post_id = ANY(target_post_ids)
  );
  DELETE FROM public.comments WHERE user_id = target_user_id OR post_id = ANY(target_post_ids);
  DELETE FROM public.posts WHERE id = ANY(target_post_ids);

  DELETE FROM public.reel_likes WHERE user_id = target_user_id OR reel_id = ANY(target_reel_ids);
  DELETE FROM public.reel_comments WHERE user_id = target_user_id OR reel_id = ANY(target_reel_ids);
  DELETE FROM public.reels WHERE id = ANY(target_reel_ids);

  DELETE FROM public.story_views WHERE viewer_id = target_user_id OR story_id IN (
    SELECT s.id FROM public.stories s WHERE s.user_id = target_user_id
  );
  DELETE FROM public.stories WHERE user_id = target_user_id;

  DELETE FROM public.library_likes WHERE user_id = target_user_id;
  DELETE FROM public.book_purchases WHERE user_id = target_user_id;
  DELETE FROM public.author_earnings WHERE author_id = target_user_id;

  DELETE FROM public.library_items WHERE user_id = target_user_id;
  DELETE FROM public.books WHERE id = ANY(target_book_ids);

  DELETE FROM public.follows WHERE follower_id = target_user_id OR following_id = target_user_id;
  DELETE FROM public.reports WHERE reporter_id = target_user_id OR target_id::text = target_user_id::text;
  DELETE FROM public.verification_requests WHERE user_id = target_user_id;
  DELETE FROM public.user_bans WHERE user_id = target_user_id;
  DELETE FROM public.user_shadow_bans WHERE user_id = target_user_id;
  DELETE FROM public.login_sessions WHERE user_id = target_user_id;
  DELETE FROM public.user_preferences WHERE user_id = target_user_id;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE user_id = target_user_id;

  -- The auth.users row is deleted last so cascade triggers keep the rest clean.
  DELETE FROM auth.users WHERE id = target_user_id;

  PERFORM public.audit_action('delete_user', 'user', target_user_id::text);
END;
$$;

-- The client currently calls these with positional args; keep signatures stable.
CREATE OR REPLACE FUNCTION public.admin_purge_all_users(keep_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins can purge users';
  END IF;

  FOR r IN
    SELECT user_id FROM public.profiles
    WHERE user_id <> keep_user_id
  LOOP
    BEGIN
      PERFORM public.admin_delete_user(r.user_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- keep going; one bad row shouldn't abort the purge
    END;
  END LOOP;

  PERFORM public.audit_action('purge_all_users', 'system', NULL,
    jsonb_build_object('deleted', v_count));

  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- 8. Realtime for audit-aware tables (settings pushed to clients)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;
END $$;
