-- ============================================================
-- SECURITY HARDENING
-- Remediation for the external security assessment.
-- Self-contained / idempotent. Run via SQL editor or db push.
--
-- Covers:
--   [Critical] anon can enumerate engagement data (USING true
--              SELECT policies: stars, votes, reels, library likes,
--              group/interest engagement, reading streaks/badges)
--              and join codes of every chat
--   [Critical] membership forgery: self-insert into any
--              conversation/group with an arbitrary role
--   [High]     self-serve is_verified badge
--   [High]     engagement forgery (stars/comments/story views/
--              follows self-approval)
--   [Medium]   signup trigger crashes on emails with dots
--   [NOTE]     email confirmation + vercel headers handled
--              separately (dashboard config / vercel.json)
-- ============================================================

-- ============================================================
-- 1. FINDING 1: anon must not be able to enumerate rows
--    Replace "USING (true)" SELECT policies with
--    authenticated-only equivalents. Aggregate counts are still
--    exposed via the parent tables (posts.star_count, etc.).
-- ============================================================

DROP POLICY IF EXISTS "Stars are viewable by everyone" ON public.stars;
CREATE POLICY "Stars visible to authenticated users" ON public.stars
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Votes are viewable by everyone" ON public.comment_votes;
CREATE POLICY "Votes visible to authenticated users" ON public.comment_votes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view likes" ON public.reel_likes;
CREATE POLICY "Reel likes visible to authenticated users" ON public.reel_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view comments" ON public.reel_comments;
CREATE POLICY "Reel comments visible to authenticated users" ON public.reel_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view comment likes" ON public.reel_comment_likes;
CREATE POLICY "Reel comment likes visible to authenticated users" ON public.reel_comment_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view likes" ON public.library_likes;
CREATE POLICY "Library likes visible to authenticated users" ON public.library_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view group post likes" ON public.group_post_likes;
CREATE POLICY "Group post likes visible to authenticated users" ON public.group_post_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view group post comments" ON public.group_post_comments;
CREATE POLICY "Group post comments visible to authenticated users" ON public.group_post_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view streaks" ON public.reading_streaks;
CREATE POLICY "Streaks visible to authenticated users" ON public.reading_streaks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view badges" ON public.reading_badges;
CREATE POLICY "Badges visible to authenticated users" ON public.reading_badges
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view interest posts" ON public.interest_posts;
CREATE POLICY "Interest posts visible to authenticated users" ON public.interest_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view interest post likes" ON public.interest_post_likes;
CREATE POLICY "Interest post likes visible to authenticated users" ON public.interest_post_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view interest post comments" ON public.interest_post_comments;
CREATE POLICY "Interest post comments visible to authenticated users" ON public.interest_post_comments
  FOR SELECT TO authenticated USING (true);

-- Join codes are the secret to joining a group/community. They must
-- NOT be enumerable. Joining happens through the SECURITY DEFINER
-- join_conversation_by_code() RPC, and owners read their own code
-- through the participant-based conversations SELECT policy, so this
-- policy is dropped entirely.
DROP POLICY IF EXISTS "Users can view conversations by join code" ON public.conversations;

-- ============================================================
-- 2. FINDING 2: membership forgery
--    Direct INSERT into membership tables is removed; all joins/
--    creations go through SECURITY DEFINER RPCs.
-- ============================================================

DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

DROP POLICY IF EXISTS "Users can join groups as members" ON public.group_members;

-- Self-update of a participant row must not allow role escalation
-- (role is 'owner'/'admin'/'member').
CREATE OR REPLACE FUNCTION public.prevent_participant_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin()
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Changing conversation roles is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_participant_role_escalation ON public.conversation_participants;
CREATE TRIGGER prevent_participant_role_escalation
  BEFORE UPDATE ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_participant_role_escalation();

-- ============================================================
-- 3. FINDING 3: self-serve is_verified badge
--    Only admins may flip the verification flag.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_self_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT public.is_admin()
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only admins can change verification status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_verification ON public.profiles;
CREATE TRIGGER prevent_self_verification
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_verification();

-- ============================================================
-- 4. FINDING 4: engagement forgery
--    Users may only engage with content they can actually see,
--    may not view/star their own stories/posts to inflate counts,
--    and may not self-approve a private follow request.
-- ============================================================

DROP POLICY IF EXISTS "Users can star posts" ON public.stars;
CREATE POLICY "Users can star posts" ON public.stars
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE id = stars.post_id
        AND public.is_post_visible(posts.*)
    )
  );

DROP POLICY IF EXISTS "Users can create comments" ON public.comments;
CREATE POLICY "Users can create comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts
      WHERE id = comments.post_id
        AND public.is_post_visible(posts.*)
    )
  );

DROP POLICY IF EXISTS "Users can record views" ON public.story_views;
CREATE POLICY "Users can record views" ON public.story_views
  FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories
      WHERE id = story_views.story_id
        AND user_id <> auth.uid()
        AND expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Users can like group posts" ON public.group_post_likes;
CREATE POLICY "Users can like group posts" ON public.group_post_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_group_member(
      (SELECT group_id FROM public.group_posts WHERE id = post_id)
    )
  );

-- A follower must not be able to flip their own pending request to
-- 'accepted'. Only the requested user (following_id) may accept.
CREATE OR REPLACE FUNCTION public.prevent_follow_self_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending'
     AND NEW.status = 'accepted'
     AND auth.uid() = OLD.follower_id
     AND NOT public.is_admin()
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the requested user can accept a follow request';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_follow_self_approval ON public.follows;
CREATE TRIGGER prevent_follow_self_approval
  BEFORE UPDATE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_follow_self_approval();

-- Author Stripe rows are written by service-role edge functions; a
-- user must not be able to self-approve payouts/charges.
CREATE OR REPLACE FUNCTION public.prevent_stripe_self_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
     AND auth.role() <> 'service_role'
     AND (NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
          OR NEW.onboarding_complete IS DISTINCT FROM OLD.onboarding_complete
          OR NEW.charges_enabled IS DISTINCT FROM OLD.charges_enabled
          OR NEW.payouts_enabled IS DISTINCT FROM OLD.payouts_enabled) THEN
    RAISE EXCEPTION 'Stripe account status can only be changed by the system';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_stripe_self_approval ON public.author_stripe_accounts;
CREATE TRIGGER prevent_stripe_self_approval
  BEFORE UPDATE ON public.author_stripe_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_stripe_self_approval();

-- ============================================================
-- 5. FINDING 1/4 (adjacent): remove client-side "System can
--    insert/update with WITH CHECK (true)" policies on sensitive
--    tables. Writes happen via service-role edge functions (which
--    bypass RLS) or admin-only policies.
-- ============================================================

-- Subscriptions: gift flow runs as an admin (covered by "Admins can
-- manage all subscriptions"); Stripe webhooks use the service role.
DROP POLICY IF EXISTS "System can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;

-- Book purchases / author earnings: written by service-role edge
-- functions (create-book-checkout, stripe-webhook).
DROP POLICY IF EXISTS "System can insert purchases" ON public.book_purchases;
DROP POLICY IF EXISTS "System can update purchases" ON public.book_purchases;
CREATE POLICY "Admins can insert purchases" ON public.book_purchases
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update purchases" ON public.book_purchases
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "System can insert earnings" ON public.author_earnings;
DROP POLICY IF EXISTS "System can update earnings" ON public.author_earnings;
CREATE POLICY "Admins can insert earnings" ON public.author_earnings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update earnings" ON public.author_earnings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Notifications: the only legitimate cross-user insert is the
-- "system" notice (e.g. a user pinging an author about a purchase);
-- everything else must target yourself.
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR type = 'system');

-- Login sessions: only your own sessions may be created.
DROP POLICY IF EXISTS "System can create sessions" ON public.login_sessions;
CREATE POLICY "Users can create their sessions" ON public.login_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 6. FINDING 5: signup trigger crashes on emails containing dots
--    (the generated username failed the username_format check).
--    Sanitize the local part and guarantee a valid, unique username.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    new_username TEXT;
BEGIN
    base_username := lower(split_part(COALESCE(NEW.email, ''), '@', 1));
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '_', 'g');

    IF base_username = '' THEN
        base_username := 'user';
    ELSIF char_length(base_username) < 3 THEN
        base_username := base_username || lpad('', 3 - char_length(base_username), '_');
    END IF;

    base_username := left(base_username, 21);
    new_username := base_username || '_' || substr(NEW.id::text, 1, 8);

    INSERT INTO public.profiles (user_id, username, display_name)
    VALUES (NEW.id, new_username, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. Verification (should return rows / no errors)
-- ============================================================

SELECT polname, relname
FROM (
  SELECT pol.polname, cls.relname
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  WHERE pol.polname IN (
    'Stars visible to authenticated users',
    'Reel likes visible to authenticated users',
    'Reel comments visible to authenticated users',
    'Reel comment likes visible to authenticated users',
    'Library likes visible to authenticated users',
    'Group post likes visible to authenticated users',
    'Group post comments visible to authenticated users',
    'Streaks visible to authenticated users',
    'Badges visible to authenticated users',
    'Interest posts visible to authenticated users',
    'Interest post likes visible to authenticated users',
    'Interest post comments visible to authenticated users',
    'Users can create notifications',
    'Users can create their sessions'
  )
  UNION ALL
  SELECT tgname, relname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE tgname IN (
    'prevent_participant_role_escalation',
    'prevent_self_verification',
    'prevent_follow_self_approval',
    'prevent_stripe_self_approval'
  )
) AS all_objects
ORDER BY relname, polname;
