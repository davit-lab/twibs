-- Moderation coverage: extend hiding/deleting to all reportable content types
-- and allow reporting group/interest comments.

-- 1. hidden flags on the remaining content tables
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.interest_posts
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.interest_post_comments
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.group_posts
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.group_post_comments
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Allow reporting the extra content types
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN (
    'post','profile','group','reel','interest_post','comment',
    'group_post','interest_post_comment','group_post_comment'
  ));

-- 3. Extend hide to every table that now has a hidden flag
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
    WHEN 'comment' THEN UPDATE public.comments SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'interest_post' THEN UPDATE public.interest_posts SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'interest_post_comment' THEN UPDATE public.interest_post_comments SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'group_post' THEN UPDATE public.group_posts SET hidden = p_hidden WHERE id = p_target_id;
    WHEN 'group_post_comment' THEN UPDATE public.group_post_comments SET hidden = p_hidden WHERE id = p_target_id;
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

-- 4. Extend delete to every reportable content type
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
    WHEN 'interest_post' THEN DELETE FROM public.interest_posts WHERE id = p_target_id;
    WHEN 'interest_post_comment' THEN DELETE FROM public.interest_post_comments WHERE id = p_target_id;
    WHEN 'group_post' THEN DELETE FROM public.group_posts WHERE id = p_target_id;
    WHEN 'group_post_comment' THEN DELETE FROM public.group_post_comments WHERE id = p_target_id;
    WHEN 'group' THEN DELETE FROM public.groups WHERE id = p_target_id;
    ELSE RAISE EXCEPTION 'unsupported target type';
  END CASE;

  PERFORM public.audit_action('delete_content', p_target_type, p_target_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_content(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_content(TEXT, UUID) TO authenticated;
