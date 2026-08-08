-- ============================================================
-- Social Growth & Safety layer
-- blocks, mutes, reports, reposts, saves, verification_requests
-- ============================================================

-- ------------------------------------------------------------
-- 1. BLOCKS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocked_id_idx ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.blocks;
CREATE POLICY "Users can view their own blocks" ON public.blocks
  FOR SELECT USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can block others" ON public.blocks;
CREATE POLICY "Users can block others" ON public.blocks
  FOR INSERT WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());

DROP POLICY IF EXISTS "Users can unblock" ON public.blocks;
CREATE POLICY "Users can unblock" ON public.blocks
  FOR DELETE USING (blocker_id = auth.uid());

-- is_blocked(a, b) is true if either direction exists
CREATE OR REPLACE FUNCTION public.is_blocked(check_user UUID, other_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = check_user AND blocked_id = other_user)
       OR (blocker_id = other_user AND blocked_id = check_user)
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated, anon;

-- Block + unfollow both directions
CREATE OR REPLACE FUNCTION public.block_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot block yourself';
  END IF;

  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), target_user_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  DELETE FROM public.follows
  WHERE (follower_id = auth.uid() AND following_id = target_user_id)
     OR (follower_id = target_user_id AND following_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(target_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.blocks
  WHERE blocker_id = auth.uid() AND blocked_id = target_user_id
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2. MUTES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (muter_id, muted_id)
);

CREATE INDEX IF NOT EXISTS mutes_muted_id_idx ON public.mutes (muted_id);

ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own mutes" ON public.mutes;
CREATE POLICY "Users can view their own mutes" ON public.mutes
  FOR SELECT USING (muter_id = auth.uid());

DROP POLICY IF EXISTS "Users can mute others" ON public.mutes;
CREATE POLICY "Users can mute others" ON public.mutes
  FOR INSERT WITH CHECK (muter_id = auth.uid() AND muted_id <> auth.uid());

DROP POLICY IF EXISTS "Users can unmute" ON public.mutes;
CREATE POLICY "Users can unmute" ON public.mutes
  FOR DELETE USING (muter_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_muted(check_user UUID, other_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mutes
    WHERE muter_id = check_user AND muted_id = other_user
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_muted(UUID, UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.mute_user(target_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.mutes (muter_id, muted_id)
  VALUES (auth.uid(), target_user_id)
  ON CONFLICT (muter_id, muted_id) DO NOTHING
$$;

GRANT EXECUTE ON FUNCTION public.mute_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unmute_user(target_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.mutes
  WHERE muter_id = auth.uid() AND muted_id = target_user_id
$$;

GRANT EXECUTE ON FUNCTION public.unmute_user(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. REPORTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','profile','group','reel','interest_post','comment')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  handled_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status);
CREATE INDEX IF NOT EXISTS reports_target_idx ON public.reports (target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;
CREATE POLICY "Users can view their own reports" ON public.reports
  FOR SELECT USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Moderators can view all reports" ON public.reports;
CREATE POLICY "Moderators can view all reports" ON public.reports
  FOR SELECT USING (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Users can submit reports" ON public.reports;
CREATE POLICY "Users can submit reports" ON public.reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Moderators can update reports" ON public.reports;
CREATE POLICY "Moderators can update reports" ON public.reports
  FOR UPDATE USING (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Moderators can delete reports" ON public.reports;
CREATE POLICY "Moderators can delete reports" ON public.reports
  FOR DELETE USING (public.is_admin_or_moderator());

-- Notify all staff when a new report comes in
CREATE OR REPLACE FUNCTION public.notify_report_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff UUID;
BEGIN
  FOR staff IN
    SELECT user_id FROM public.user_roles
    WHERE role IN ('admin','moderator')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
    VALUES (
      staff,
      'system',
      'New content report',
      'A user reported content that needs review.',
      NEW.reporter_id,
      'report',
      NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_report_created ON public.reports;
CREATE TRIGGER trg_notify_report_created
AFTER INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.notify_report_created();

CREATE OR REPLACE FUNCTION public.report_content(target_type TEXT, target_id UUID, reason TEXT, details TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, details)
  VALUES (auth.uid(), target_type, target_id, reason, details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_report_status(report_id UUID, new_status TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.reports
  SET status = new_status,
      handled_by = auth.uid(),
      handled_at = now()
  WHERE id = report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_report_status(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4. SAVES (bookmarks)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS saves_user_idx ON public.saves (user_id);

ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own saves" ON public.saves;
CREATE POLICY "Users can view own saves" ON public.saves
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can save posts" ON public.saves;
CREATE POLICY "Users can save posts" ON public.saves
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unsave posts" ON public.saves;
CREATE POLICY "Users can unsave posts" ON public.saves
  FOR DELETE USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5. REPOSTS
-- ------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS repost_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS reposts_user_idx ON public.reposts (user_id);

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

-- Only expose reposts whose underlying post the viewer can see
DROP POLICY IF EXISTS "Users can view reposts" ON public.reposts;
CREATE POLICY "Users can view reposts" ON public.reposts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = reposts.post_id AND public.is_post_visible(p)
    )
  );

DROP POLICY IF EXISTS "Users can repost" ON public.reposts;
CREATE POLICY "Users can repost" ON public.reposts
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unrepost" ON public.reposts;
CREATE POLICY "Users can unrepost" ON public.reposts
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_post_repost_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET repost_count = repost_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET repost_count = GREATEST(0, repost_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_post_repost_count ON public.reposts;
CREATE TRIGGER trg_update_post_repost_count
AFTER INSERT OR DELETE ON public.reposts
FOR EACH ROW EXECUTE FUNCTION public.update_post_repost_count();

CREATE OR REPLACE FUNCTION public.repost_post(target_post_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_id UUID;
BEGIN
  INSERT INTO public.reposts (post_id, user_id)
  VALUES (target_post_id, auth.uid())
  ON CONFLICT (post_id, user_id) DO NOTHING;

  SELECT user_id INTO author_id FROM public.posts WHERE id = target_post_id;

  IF author_id IS NOT NULL AND author_id <> auth.uid()
     AND NOT public.is_muted(author_id, auth.uid()) THEN
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
    VALUES (
      author_id,
      'system',
      'Your post was reposted',
      'Someone shared your post with their followers.',
      auth.uid(),
      'post',
      target_post_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.repost_post(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unrepost_post(target_post_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.reposts WHERE post_id = target_post_id AND user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.unrepost_post(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. VERIFICATION REQUESTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON public.verification_requests (status);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verification requests" ON public.verification_requests;
CREATE POLICY "Users can view own verification requests" ON public.verification_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Moderators can view verification requests" ON public.verification_requests;
CREATE POLICY "Moderators can view verification requests" ON public.verification_requests
  FOR SELECT USING (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Users can request verification" ON public.verification_requests;
CREATE POLICY "Users can request verification" ON public.verification_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Moderators can update verification requests" ON public.verification_requests;
CREATE POLICY "Moderators can update verification requests" ON public.verification_requests
  FOR UPDATE USING (public.is_admin_or_moderator());

CREATE OR REPLACE FUNCTION public.request_verification(message TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  already_verified BOOLEAN;
  pending_exists BOOLEAN;
BEGIN
  SELECT is_verified INTO already_verified FROM public.profiles WHERE user_id = auth.uid();
  IF already_verified THEN
    RAISE EXCEPTION 'You are already verified';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE user_id = auth.uid() AND status = 'pending'
  ) INTO pending_exists;
  IF pending_exists THEN
    RAISE EXCEPTION 'You already have a pending verification request';
  END IF;

  INSERT INTO public.verification_requests (user_id, message) VALUES (auth.uid(), message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_verification(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_verification_request(request_id UUID, approve BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target UUID;
BEGIN
  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT user_id INTO target FROM public.verification_requests WHERE id = request_id;

  UPDATE public.verification_requests
  SET status = CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
      handled_by = auth.uid(),
      handled_at = now()
  WHERE id = request_id;

  IF approve THEN
    UPDATE public.profiles SET is_verified = true WHERE user_id = target;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
  VALUES (
    target,
    'system',
    CASE WHEN approve THEN 'You are now verified!' ELSE 'Verification request not approved' END,
    CASE WHEN approve THEN 'Your profile has been verified. Congratulations!'
         ELSE 'Your verification request was not approved. You can submit a new one later.' END,
    auth.uid(),
    'verification',
    request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_verification_request(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 7. Hide blocked users' content everywhere (is_post_visible)
-- ------------------------------------------------------------
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
            WHEN public.is_blocked(auth.uid(), post_row.user_id) THEN false
            WHEN post_row.visibility = 'public' THEN true
            WHEN post_row.visibility = 'private' THEN false
            WHEN post_row.visibility = 'followers' THEN
                public.is_following(auth.uid(), post_row.user_id)
            ELSE false
        END
$$;

-- ------------------------------------------------------------
-- 8. Realtime for interest content
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'interest_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.interest_posts;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'interest_post_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.interest_post_likes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reposts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reposts;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saves;
  END IF;
END $$;
