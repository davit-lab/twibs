-- ============================================================
-- Group roles & settings
-- Adds a 'moderator' role, group settings/member-management RPCs,
-- and moderator moderation policies. Self-contained / idempotent.
-- ============================================================

-- 1. Allow the 'moderator' role
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_role_check;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_role_check CHECK (role IN ('owner', 'admin', 'moderator', 'member'));

-- 2. Helper: owner / admin / moderator (used by moderation policies)
CREATE OR REPLACE FUNCTION public.is_group_moderator_or_above(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role IN ('owner', 'admin', 'moderator')
  )
$$ SET search_path = public SET row_security = off;

-- 3. Update a group's settings (owner or admin only)
CREATE OR REPLACE FUNCTION public.update_group(
  target_group_id UUID,
  group_name TEXT,
  group_description TEXT DEFAULT NULL,
  group_avatar_url TEXT DEFAULT NULL,
  group_cover_url TEXT DEFAULT NULL,
  group_privacy TEXT DEFAULT NULL
) RETURNS public.groups AS $$
DECLARE
  updated public.groups;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only group owners or admins can edit the group';
  END IF;

  IF group_privacy IS NOT NULL AND group_privacy NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid privacy value';
  END IF;

  UPDATE public.groups
  SET name = COALESCE(group_name, name),
      description = COALESCE(group_description, description),
      avatar_url = COALESCE(group_avatar_url, avatar_url),
      cover_url = COALESCE(group_cover_url, cover_url),
      privacy = COALESCE(group_privacy, privacy),
      updated_at = now()
  WHERE id = target_group_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.update_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_group(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

-- 4. Change a member's role (owner or admin only)
CREATE OR REPLACE FUNCTION public.set_group_member_role(
  target_group_id UUID,
  target_user_id UUID,
  new_role TEXT
) RETURNS void AS $$
DECLARE
  caller_role TEXT;
  target_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.group_members
  WHERE group_id = target_group_id AND user_id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only group owners or admins can manage roles';
  END IF;

  IF new_role NOT IN ('admin', 'moderator', 'member') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role INTO target_role FROM public.group_members
  WHERE group_id = target_group_id AND user_id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;

  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'The group owner role cannot be changed';
  END IF;

  IF new_role = 'admin' AND caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can appoint admins';
  END IF;

  UPDATE public.group_members SET role = new_role
  WHERE group_id = target_group_id AND user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.set_group_member_role OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) TO authenticated, anon;

-- 5. Remove a member (owner or admin only; cannot remove the owner)
CREATE OR REPLACE FUNCTION public.remove_group_member(
  target_group_id UUID,
  target_user_id UUID
) RETURNS void AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.group_members
  WHERE group_id = target_group_id AND user_id = auth.uid();

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only group owners or admins can remove members';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = target_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'The group owner cannot be removed';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = target_group_id AND user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.remove_group_member OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated, anon;

-- 6. Let moderators delete posts/comments (kept idempotent)
DROP POLICY IF EXISTS "Authors or group admins can delete group posts" ON public.group_posts;
CREATE POLICY "Authors, moderators or group admins can delete group posts"
ON public.group_posts FOR DELETE
USING (
  user_id = auth.uid()
  OR public.is_group_moderator_or_above(group_id)
  OR is_admin_or_moderator()
);

DROP POLICY IF EXISTS "Users can delete their own group comments" ON public.group_post_comments;
CREATE POLICY "Users, moderators or admins can delete group comments"
ON public.group_post_comments FOR DELETE
USING (
  user_id = auth.uid()
  OR public.is_group_moderator_or_above((SELECT group_id FROM public.group_posts WHERE id = post_id))
  OR is_admin_or_moderator()
);

-- 7. Verification
SELECT proname, proowner::regrole AS owner
FROM pg_proc
WHERE proname IN ('update_group', 'set_group_member_role', 'remove_group_member', 'is_group_moderator_or_above')
ORDER BY proname;

SELECT pg_get_constraintdef(oid) AS role_check
FROM pg_constraint
WHERE conname = 'group_members_role_check';
