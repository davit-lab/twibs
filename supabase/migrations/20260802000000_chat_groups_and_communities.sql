-- ============================================================
-- Chat groups, communities, muting & presence
-- ============================================================

-- 1. Conversations: add group/community metadata
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'dm',
  ADD COLUMN IF NOT EXISTS join_code TEXT,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check CHECK (type IN ('dm', 'group', 'community'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_join_code ON public.conversations(join_code) WHERE join_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);

-- 2. Participants: role + mute flag
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_role_check;
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_role_check CHECK (role IN ('owner', 'admin', 'member'));

-- 3. Profiles: track last seen for presence
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- RPCs
-- ============================================================

-- Create a group chat with a set of members
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  group_name TEXT,
  member_ids UUID[],
  group_avatar_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_conversation_id UUID;
  member_id UUID;
BEGIN
  INSERT INTO public.conversations (name, avatar_url, type, owner_id, join_code)
  VALUES (
    group_name,
    group_avatar_url,
    'group',
    auth.uid(),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  )
  RETURNING id INTO new_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (new_conversation_id, auth.uid(), 'owner');

  FOREACH member_id IN ARRAY member_ids
  LOOP
    IF member_id <> auth.uid() THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id, role)
      VALUES (new_conversation_id, member_id, 'member')
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN new_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a community (public-style channel joinable by code)
CREATE OR REPLACE FUNCTION public.create_community(
  community_name TEXT,
  community_description TEXT DEFAULT NULL,
  community_avatar_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_conversation_id UUID;
BEGIN
  INSERT INTO public.conversations (name, avatar_url, description, type, owner_id, join_code)
  VALUES (
    community_name,
    community_avatar_url,
    community_description,
    'community',
    auth.uid(),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  )
  RETURNING id INTO new_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (new_conversation_id, auth.uid(), 'owner');

  RETURN new_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Join a community (or code-enabled group) by its join code
CREATE OR REPLACE FUNCTION public.join_conversation_by_code(code TEXT)
RETURNS UUID AS $$
DECLARE
  conv_id UUID;
  conv_type TEXT;
BEGIN
  SELECT id, type INTO conv_id, conv_type
  FROM public.conversations
  WHERE join_code = upper(btrim(code))
    AND type IN ('community', 'group');

  IF conv_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (conv_id, auth.uid(), 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add members to a group/community (owner/admin only)
CREATE OR REPLACE FUNCTION public.add_conversation_members(
  conv_id UUID,
  member_ids UUID[]
) RETURNS void AS $$
DECLARE
  member_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOREACH member_id IN ARRAY member_ids
  LOOP
    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    VALUES (conv_id, member_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remove the caller from a conversation
CREATE OR REPLACE FUNCTION public.leave_conversation(conv_id UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM public.conversation_participants
  WHERE conversation_id = conv_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Message notifications: notify all participants, skip muted
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  rec RECORD;
BEGIN
  SELECT display_name INTO actor_name FROM public.profiles WHERE user_id = NEW.sender_id;
  actor_name := COALESCE(actor_name, 'Someone');

  FOR rec IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id != NEW.sender_id
      AND cp.muted = false
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
    VALUES (rec.user_id, 'message', 'New message from ' || actor_name, LEFT(NEW.content, 100), NEW.sender_id, 'conversation', NEW.conversation_id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS: allow viewing/joining code-enabled communities pre-join
-- ============================================================
DROP POLICY IF EXISTS "Users can view conversations by join code" ON public.conversations;
CREATE POLICY "Users can view conversations by join code"
  ON public.conversations FOR SELECT
  USING (join_code IS NOT NULL);

-- Allow the owner/admin to delete conversations they own
DROP POLICY IF EXISTS "Owners can delete their conversations" ON public.conversations;
CREATE POLICY "Owners can delete their conversations"
  ON public.conversations FOR DELETE
  USING (owner_id = auth.uid());
