-- Admin-only user deletion utilities

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

  -- Collect IDs for dependent deletes
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_post_ids
  FROM public.posts
  WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_reel_ids
  FROM public.reels
  WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_story_ids
  FROM public.stories
  WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO target_book_ids
  FROM public.books
  WHERE author_id = target_user_id;

  -- Posts: remove dependent rows first
  DELETE FROM public.post_media
  WHERE post_id = ANY(target_post_ids);

  DELETE FROM public.stars
  WHERE user_id = target_user_id
     OR post_id = ANY(target_post_ids);

  -- Comments & votes: remove comments on deleted posts (by anyone) + user's own comments
  DELETE FROM public.comment_votes
  WHERE user_id = target_user_id
     OR comment_id IN (
       SELECT c.id
       FROM public.comments c
       WHERE c.user_id = target_user_id
          OR c.post_id = ANY(target_post_ids)
     );

  DELETE FROM public.comments
  WHERE user_id = target_user_id
     OR post_id = ANY(target_post_ids);

  DELETE FROM public.posts
  WHERE id = ANY(target_post_ids);

  -- Reels
  DELETE FROM public.reel_likes
  WHERE user_id = target_user_id
     OR reel_id = ANY(target_reel_ids);

  DELETE FROM public.reel_comments
  WHERE user_id = target_user_id
     OR reel_id = ANY(target_reel_ids);

  DELETE FROM public.reels
  WHERE id = ANY(target_reel_ids);

  -- Stories
  DELETE FROM public.story_views
  WHERE viewer_id = target_user_id
     OR story_id = ANY(target_story_ids);

  DELETE FROM public.stories
  WHERE id = ANY(target_story_ids);

  -- Social graph
  DELETE FROM public.follows
  WHERE follower_id = target_user_id
     OR following_id = target_user_id;

  -- Messaging/calls
  DELETE FROM public.call_sessions
  WHERE caller_id = target_user_id
     OR receiver_id = target_user_id;

  DELETE FROM public.messages
  WHERE sender_id = target_user_id;

  DELETE FROM public.conversation_participants
  WHERE user_id = target_user_id;

  -- Remove conversations with no participants left
  DELETE FROM public.conversations c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = c.id
  );

  -- Notifications
  DELETE FROM public.notifications
  WHERE user_id = target_user_id
     OR actor_id = target_user_id;

  -- Reading/library
  DELETE FROM public.user_library
  WHERE user_id = target_user_id;

  DELETE FROM public.reading_progress
  WHERE user_id = target_user_id;

  DELETE FROM public.reading_logs
  WHERE user_id = target_user_id;

  DELETE FROM public.reading_streaks
  WHERE user_id = target_user_id;

  DELETE FROM public.reading_badges
  WHERE user_id = target_user_id;

  -- Books/chapters
  DELETE FROM public.chapters
  WHERE book_id = ANY(target_book_ids);

  DELETE FROM public.books
  WHERE id = ANY(target_book_ids);

  -- Preferences/sessions
  DELETE FROM public.user_preferences
  WHERE user_id = target_user_id;

  DELETE FROM public.login_sessions
  WHERE user_id = target_user_id;

  -- Admin/meta
  DELETE FROM public.user_bans
  WHERE user_id = target_user_id;

  DELETE FROM public.subscriptions
  WHERE user_id = target_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id;

  -- Finally, profile
  DELETE FROM public.profiles
  WHERE user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_all_users(keep_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  deleted_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE keep_user_id IS NULL OR p.user_id <> keep_user_id
  LOOP
    PERFORM public.admin_delete_user(r.user_id);
    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$;

-- Lock down and grant execution to authenticated users (function enforces admin-only)
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_purge_all_users(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_users(uuid) TO authenticated;
