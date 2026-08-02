-- ============================================================
-- GROUPS — clean rebuild
-- Self-contained: safe to run in the SQL editor or via db push.
-- Drops everything group-related first, then recreates with the
-- most robust RLS setup possible (row_security=off RPCs, postgres
-- ownership, INSERT policies, explicit grants).
-- ============================================================

-- 0. Drop everything group-related
DROP TABLE IF EXISTS public.group_post_comments CASCADE;
DROP TABLE IF EXISTS public.group_post_likes CASCADE;
DROP TABLE IF EXISTS public.group_posts CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

DROP FUNCTION IF EXISTS public.create_group CASCADE;
DROP FUNCTION IF EXISTS public.join_group CASCADE;
DROP FUNCTION IF EXISTS public.leave_group CASCADE;
DROP FUNCTION IF EXISTS public.is_group_member CASCADE;
DROP FUNCTION IF EXISTS public.is_group_owner_or_admin CASCADE;
DROP FUNCTION IF EXISTS public.update_group_member_count CASCADE;
DROP FUNCTION IF EXISTS public.update_group_post_count CASCADE;
DROP FUNCTION IF EXISTS public.update_group_post_like_count CASCADE;
DROP FUNCTION IF EXISTS public.update_group_post_comment_count CASCADE;

-- ============================================================
-- 1. Tables
-- ============================================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  cover_url TEXT,
  privacy TEXT NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  creator_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_groups_created_at ON public.groups(created_at DESC);
CREATE INDEX idx_groups_creator_id ON public.groups(creator_id);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);

CREATE TABLE public.group_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_posts_group_id ON public.group_posts(group_id);
CREATE INDEX idx_group_posts_created_at ON public.group_posts(created_at DESC);
CREATE INDEX idx_group_posts_user_id ON public.group_posts(user_id);

CREATE TABLE public.group_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_group_post_likes_post_id ON public.group_post_likes(post_id);
CREATE INDEX idx_group_post_likes_user_id ON public.group_post_likes(user_id);

CREATE TABLE public.group_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.group_post_comments(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_post_comments_post_id ON public.group_post_comments(post_id);

-- ============================================================
-- 2. Helper functions (RLS checks used by policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid()
  )
$$ SET search_path = public SET row_security = off;

CREATE OR REPLACE FUNCTION public.is_group_owner_or_admin(target_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  )
$$ SET search_path = public SET row_security = off;

-- ============================================================
-- 3. RPCs
-- ============================================================

-- Create a group (creator becomes owner)
CREATE OR REPLACE FUNCTION public.create_group(
  group_name TEXT,
  group_description TEXT DEFAULT '',
  group_avatar_url TEXT DEFAULT NULL,
  group_cover_url TEXT DEFAULT NULL,
  group_privacy TEXT DEFAULT 'public'
) RETURNS public.groups AS $$
DECLARE
  new_group public.groups;
  base_slug TEXT;
  candidate TEXT;
  slug_exists BOOLEAN;
BEGIN
  base_slug := lower(regexp_replace(group_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'group'; END IF;
  IF length(base_slug) > 50 THEN base_slug := left(base_slug, 50); END IF;

  candidate := base_slug;
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.groups WHERE slug = candidate) INTO slug_exists;
    EXIT WHEN NOT slug_exists;
    candidate := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  END LOOP;

  INSERT INTO public.groups (name, slug, description, avatar_url, cover_url, privacy, creator_id)
  VALUES (group_name, candidate, group_description, group_avatar_url, group_cover_url, group_privacy, auth.uid())
  RETURNING * INTO new_group;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group.id, auth.uid(), 'owner');

  RETURN new_group;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.create_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

-- Join a group (idempotent)
CREATE OR REPLACE FUNCTION public.join_group(target_group_id UUID)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = target_group_id AND user_id = auth.uid()
  ) THEN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (target_group_id, auth.uid(), 'member');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.join_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.join_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group(UUID) TO authenticated, anon;

-- Leave a group (owner cannot leave)
CREATE OR REPLACE FUNCTION public.leave_group(target_group_id UUID)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Group owner cannot leave the group';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = target_group_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.leave_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.leave_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated, anon;

-- ============================================================
-- 4. Count triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE TRIGGER update_group_member_count_trigger
AFTER INSERT OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();

CREATE OR REPLACE FUNCTION public.update_group_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET post_count = post_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET post_count = GREATEST(0, post_count - 1) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE TRIGGER update_group_post_count_trigger
AFTER INSERT OR DELETE ON public.group_posts
FOR EACH ROW EXECUTE FUNCTION public.update_group_post_count();

CREATE OR REPLACE FUNCTION public.update_group_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE TRIGGER update_group_post_like_count_trigger
AFTER INSERT OR DELETE ON public.group_post_likes
FOR EACH ROW EXECUTE FUNCTION public.update_group_post_like_count();

CREATE OR REPLACE FUNCTION public.update_group_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

CREATE TRIGGER update_group_post_comment_count_trigger
AFTER INSERT OR DELETE ON public.group_post_comments
FOR EACH ROW EXECUTE FUNCTION public.update_group_post_comment_count();

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_group_posts_updated_at
    BEFORE UPDATE ON public.group_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_group_post_comments_updated_at
    BEFORE UPDATE ON public.group_post_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. RLS
-- ============================================================
-- Everything is owned by postgres (the SQL editor runs as postgres),
-- and the SECURITY DEFINER RPCs run with row_security=off, so they
-- bypass RLS entirely. Policies below cover the client's direct
-- reads/writes.
ALTER TABLE public.groups OWNER TO postgres;
ALTER TABLE public.group_members OWNER TO postgres;
ALTER TABLE public.group_posts OWNER TO postgres;
ALTER TABLE public.group_post_likes OWNER TO postgres;
ALTER TABLE public.group_post_comments OWNER TO postgres;

ALTER TABLE public.groups NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_likes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_comments NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_post_comments ENABLE ROW LEVEL SECURITY;

-- groups
CREATE POLICY "Public groups are visible to everyone"
ON public.groups FOR SELECT USING (privacy = 'public');

CREATE POLICY "Private groups are visible to members"
ON public.groups FOR SELECT USING (privacy = 'private' AND public.is_group_member(id));

CREATE POLICY "Users can create groups"
ON public.groups FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Group creators can update their groups"
ON public.groups FOR UPDATE
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Group creators can delete their groups"
ON public.groups FOR DELETE
USING (creator_id = auth.uid());

-- group_members
CREATE POLICY "Group members can view membership"
ON public.group_members FOR SELECT
USING (public.is_group_member(group_id) OR user_id = auth.uid());

CREATE POLICY "Users can join groups as members"
ON public.group_members FOR INSERT WITH CHECK (user_id = auth.uid());

-- group_posts
CREATE POLICY "Group posts visible to members or in public groups"
ON public.group_posts FOR SELECT
USING (
  (SELECT privacy FROM public.groups WHERE id = group_id) = 'public'
  OR public.is_group_member(group_id)
);

CREATE POLICY "Group members can post"
ON public.group_posts FOR INSERT
WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

CREATE POLICY "Authors or group admins can update group posts"
ON public.group_posts FOR UPDATE
USING (user_id = auth.uid() OR public.is_group_owner_or_admin(group_id))
WITH CHECK (user_id = auth.uid() OR public.is_group_owner_or_admin(group_id));

CREATE POLICY "Authors or group admins can delete group posts"
ON public.group_posts FOR DELETE
USING (user_id = auth.uid() OR public.is_group_owner_or_admin(group_id) OR is_admin_or_moderator());

-- group_post_likes
CREATE POLICY "Anyone can view group post likes"
ON public.group_post_likes FOR SELECT USING (true);

CREATE POLICY "Users can like group posts"
ON public.group_post_likes FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unlike group posts"
ON public.group_post_likes FOR DELETE USING (user_id = auth.uid());

-- group_post_comments
CREATE POLICY "Anyone can view group post comments"
ON public.group_post_comments FOR SELECT USING (true);

CREATE POLICY "Users can comment on group posts"
ON public.group_post_comments FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.is_group_member((SELECT group_id FROM public.group_posts WHERE id = post_id))
);

CREATE POLICY "Users can update their own group comments"
ON public.group_post_comments FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own group comments"
ON public.group_post_comments FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- ============================================================
-- 6. Storage bucket for group media
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-media', 'group-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view group media"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-media');

CREATE POLICY "Users can upload their own group media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own group media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own group media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 7. Verification (run after — should return rows, no errors)
-- ============================================================
SELECT proname, proowner::regrole AS owner, proconfig AS settings
FROM pg_proc
WHERE proname IN ('create_group', 'join_group', 'leave_group')
ORDER BY proname;

SELECT pol.polname, cls.relname AS tablename
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
WHERE cls.relname LIKE 'group%'
ORDER BY cls.relname, pol.polname;
