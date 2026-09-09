-- ============================================================
-- Link every group to a real group chat conversation.
--
-- Groups now own a conversation (type = 'group') so that
-- "Message group" opens the actual Messages UI for the group's
-- conversation. Membership, roles, renames, avatar changes and
-- deletions are mirrored automatically by triggers below, so the
-- group page and the chat never drift apart.
-- ============================================================

-- 1. Add the link column
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS chat_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_chat_conversation_id
  ON public.groups(chat_conversation_id)
  WHERE chat_conversation_id IS NOT NULL;

-- 2. Helper: map a group role to the smaller set of chat roles
CREATE OR REPLACE FUNCTION public.group_role_to_chat_role(group_role TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE group_role
    WHEN 'owner' THEN 'owner'
    WHEN 'admin' THEN 'admin'
    ELSE 'member'
  END;
$$;

ALTER FUNCTION public.group_role_to_chat_role OWNER TO postgres;
REVOKE ALL ON FUNCTION public.group_role_to_chat_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_role_to_chat_role(TEXT) TO authenticated, anon;

-- 3. Backfill: create a conversation for every existing group and
--    populate participants from current group members.
DO $$
DECLARE
  g RECORD;
  conv_id UUID;
BEGIN
  FOR g IN SELECT * FROM public.groups WHERE chat_conversation_id IS NULL LOOP
    INSERT INTO public.conversations (name, avatar_url, description, type, join_code, owner_id)
    VALUES (
      g.name,
      g.avatar_url,
      g.description,
      'group',
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      g.creator_id
    )
    RETURNING id INTO conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    SELECT conv_id, user_id, public.group_role_to_chat_role(role)
    FROM public.group_members
    WHERE group_id = g.id;

    UPDATE public.groups SET chat_conversation_id = conv_id WHERE id = g.id;
  END LOOP;
END $$;

-- 4. Keep participants in sync (join / leave / remove / role change)
CREATE OR REPLACE FUNCTION public.group_chat_sync_member()
RETURNS TRIGGER AS $$
DECLARE
  conv_id UUID;
BEGIN
  SELECT chat_conversation_id INTO conv_id
  FROM public.groups
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);

  IF conv_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    VALUES (conv_id, NEW.user_id, public.group_role_to_chat_role(NEW.role))
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, muted = conversation_participants.muted;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.conversation_participants
    WHERE conversation_id = conv_id AND user_id = OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.group_chat_sync_group()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.chat_conversation_id IS NOT NULL THEN
      DELETE FROM public.conversations WHERE id = OLD.chat_conversation_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.chat_conversation_id IS NOT NULL THEN
    UPDATE public.conversations
    SET name = NEW.name,
        avatar_url = NEW.avatar_url,
        description = NEW.description
    WHERE id = NEW.chat_conversation_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_group_chat_sync_member ON public.group_members;
CREATE TRIGGER trg_group_chat_sync_member
AFTER INSERT OR UPDATE OF role OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.group_chat_sync_member();

DROP TRIGGER IF EXISTS trg_group_chat_sync_group ON public.groups;
CREATE TRIGGER trg_group_chat_sync_group
AFTER UPDATE OF name, avatar_url, description ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.group_chat_sync_group();

DROP TRIGGER IF EXISTS trg_group_chat_sync_group_delete ON public.groups;
CREATE TRIGGER trg_group_chat_sync_group_delete
AFTER DELETE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.group_chat_sync_group();

-- 5. New groups get their conversation at creation time
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
  conv_id UUID;
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

  INSERT INTO public.conversations (name, avatar_url, description, type, join_code, owner_id)
  VALUES (
    group_name,
    group_avatar_url,
    group_description,
    'group',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    auth.uid()
  )
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (conv_id, auth.uid(), 'owner');

  new_group.chat_conversation_id := conv_id;
  UPDATE public.groups SET chat_conversation_id = conv_id WHERE id = new_group.id;

  RETURN new_group;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.create_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;