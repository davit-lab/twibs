-- ============================================================================
-- Business conversations
-- ============================================================================
-- Goal: a visitor on a public business profile can start a real conversation
-- with that business, and the business side is answered by its people - not by
-- an automated or impersonated personal account.
--
-- Design (deliberately minimal, no new duplicate systems):
--   * conversations.type gains a 'business' value.
--   * conversations.business_id records which business the thread belongs to.
--   * conversation_participants gains business_id and user_id becomes NULLABLE,
--     so a participant is now "a user" XOR "a business".
--   * Every business member sees and can answer the thread, and notifications
--     fan out to all of them. Messages are still written by a real human
--     (messages.sender_id is NOT NULL and FKs to profiles) - we never forge a
--     system sender.
--   * A customer never appears to a member as another customer, and a business
--     is never presented as if it were a person.
--
-- Existing DM/group/community rows are untouched: user_id stays populated and
-- every new predicate is an OR-branch, so all prior behaviour is preserved.

-- ----------------------------------------------------------------------------
-- 1. Schema
-- ----------------------------------------------------------------------------

-- Business side of the thread.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS business_id uuid
  REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE;

-- A participant is now either a user OR a business.
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS business_id uuid
  REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.conversation_participants
  ALTER COLUMN user_id DROP NOT NULL;

-- Exactly one identity per participant row. Enforced in the database so a row
-- can never be both (ambiguous) or neither (orphaned).
ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_identity_check;
ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_identity_check
  CHECK ((user_id IS NOT NULL) <> (business_id IS NOT NULL));

-- A business thread must point at a business; a DM must not.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_business_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_business_type_check
  CHECK (
    (type = 'business' AND business_id IS NOT NULL)
    OR (type <> 'business' AND business_id IS NULL)
  );

-- The existing UNIQUE(conversation_id, user_id) is deliberately KEPT. In
-- PostgreSQL NULLs compare as distinct in a unique index, so rows with
-- user_id NULL (our business participants) never collide with it and it
-- continues to do exactly what it did before. Dropping it would also break the
-- ON CONFLICT (conversation_id, user_id) clauses in add_conversation_members,
-- create_group_conversation, group_chat_sync_member and
-- join_conversation_by_code.
--
-- We only need a uniqueness guarantee for the new business identity.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_conv_business_uniq
  ON public.conversation_participants (conversation_id, business_id)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_business
  ON public.conversation_participants (business_id)
  WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_business
  ON public.conversations (business_id)
  WHERE business_id IS NOT NULL;

-- Allow the new conversation type.
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check
  CHECK (type = ANY (ARRAY['dm', 'group', 'community', 'business']));

-- ----------------------------------------------------------------------------
-- 2. Membership helpers
-- ----------------------------------------------------------------------------

-- Explicit two-argument membership test. The existing is_business_member()
-- implicitly reads auth.uid(), which is wrong inside is_conversation_participant()
-- because that function is handed an arbitrary user id.
CREATE OR REPLACE FUNCTION public.is_business_member_of(p_business_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_business_id IS NOT NULL
     AND p_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.advertiser_accounts a
       WHERE a.id = p_business_id
         AND a.user_id = p_user_id
     )
  OR EXISTS (
       SELECT 1
       FROM public.business_members m
       WHERE m.business_id = p_business_id
         AND m.user_id = p_user_id
     );
$function$;

REVOKE ALL ON FUNCTION public.is_business_member_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_member_of(uuid, uuid) TO authenticated, service_role;

-- Can the caller act as this business right now? Combines "am I a member" with
-- "is the business actually open for messages".
CREATE OR REPLACE FUNCTION public.can_message_business(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.advertiser_accounts a
    WHERE a.id = p_business_id
      AND a.status = 'active'
  )
  AND public.is_business_member_of(p_business_id, auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.can_message_business(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_message_business(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Participant check used by every messaging RLS policy
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_conversation_participant(
  _conversation_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND (
        cp.user_id = _user_id
        OR public.is_business_member_of(cp.business_id, _user_id)
      )
  );
$function$;

-- ----------------------------------------------------------------------------
-- 4. Start (or resume) a thread with a business
-- ----------------------------------------------------------------------------
-- Idempotent: calling it twice returns the same conversation instead of
-- creating duplicate threads. Anyone may open one (it is how a customer reaches
-- a business); a business member calling it just re-enters their own inbox.
CREATE OR REPLACE FUNCTION public.get_or_create_business_conversation(p_business_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller      uuid := auth.uid();
  v_business    public.advertiser_accounts%ROWTYPE;
  v_conversation uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to message a business'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_business
  FROM public.advertiser_accounts
  WHERE id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- You cannot open a thread with yourself; you already own the inbox.
  IF v_business.user_id = v_caller THEN
    RAISE EXCEPTION 'You already manage this business'
      USING ERRCODE = '22023';
  END IF;

  -- Only live businesses are reachable. Archived/suspended businesses should
  -- not collect new enquiries.
  IF v_business.status <> 'active' THEN
    RAISE EXCEPTION 'This business is not currently accepting messages'
      USING ERRCODE = '22023';
  END IF;

  -- Reuse the caller's existing thread with this business, if any.
  SELECT c.id INTO v_conversation
  FROM public.conversations c
  JOIN public.conversation_participants cp
    ON cp.conversation_id = c.id
  WHERE c.type = 'business'
    AND c.business_id = p_business_id
    AND cp.user_id = v_caller
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF v_conversation IS NOT NULL THEN
    RETURN v_conversation;
  END IF;

  INSERT INTO public.conversations (type, business_id, name, avatar_url)
  VALUES (
    'business',
    p_business_id,
    v_business.name,
    v_business.avatar_url
  )
  RETURNING id INTO v_conversation;

  -- One row for the customer, one row for the business.
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id)
  VALUES (v_conversation, v_caller, NULL),
         (v_conversation, NULL, p_business_id);

  RETURN v_conversation;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_business_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_business_conversation(uuid) TO authenticated, service_role;

-- Business members are added to the thread when they join the business, so a
-- new hire can see the history instead of starting from a blank inbox, and so
-- read receipts / mute / typing work uniformly for every member.
--
-- The owner is included too: is_business_member_of() also treats
-- advertiser_accounts.user_id as a member, so excluding them here would leave
-- the owner without read receipts while still being able to read the thread.
-- The customer-facing UI renders business threads as the business, never as a
-- list of staff, so these rows are not shown as "other people".
CREATE OR REPLACE FUNCTION public.sync_business_member_to_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id, role)
  SELECT c.id, NEW.user_id, NULL, 'member'
  FROM public.conversations c
  WHERE c.type = 'business'
    AND c.business_id = NEW.business_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_sync_business_member_to_conversations ON public.business_members;
CREATE TRIGGER trigger_sync_business_member_to_conversations
  AFTER INSERT ON public.business_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_business_member_to_conversations();

-- ----------------------------------------------------------------------------
-- 5. Read receipts + notifications must understand business participants
-- ----------------------------------------------------------------------------

-- A business participant row has user_id NULL, so the old "everyone who has
-- read up to now" logic silently skipped it. Drive this off the human members
-- of the business instead.
CREATE OR REPLACE FUNCTION public.mark_new_message_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.message_reads (message_id, user_id, read_at)
  SELECT NEW.id, reader_id, now()
  FROM (
    -- Individual user participants.
    SELECT cp.user_id AS reader_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id IS NOT NULL
      AND cp.user_id <> NEW.sender_id
      AND cp.last_read_at IS NOT NULL
      AND cp.last_read_at >= NEW.created_at

    UNION ALL

    -- Human members of any business on this thread. The sender never receives
    -- their own read receipt, even when they are replying as the business.
    SELECT bm.user_id
    FROM public.conversation_participants cp
    JOIN public.business_members bm ON bm.business_id = cp.business_id
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.business_id IS NOT NULL
      AND bm.user_id <> NEW.sender_id
      AND EXISTS (
        SELECT 1
        FROM public.conversation_participants own
        WHERE own.conversation_id = cp.conversation_id
          AND own.user_id = bm.user_id
          AND own.last_read_at IS NOT NULL
          AND own.last_read_at >= NEW.created_at
      )
  ) AS readers
  ON CONFLICT (message_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Notification fan-out. Previously it only walked user participants, so a
-- business thread would have notified nobody. Now every member of the business
-- is notified, and the title names the business rather than impersonating a
-- person.
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_name     TEXT;
  business_name  TEXT;
  notify_title   TEXT;
  v_business_id  UUID;
BEGIN
  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;
  actor_name := COALESCE(actor_name, 'Someone');

  SELECT c.business_id, a.name INTO v_business_id, business_name
  FROM public.conversations c
  LEFT JOIN public.advertiser_accounts a ON a.id = c.business_id
  WHERE c.id = NEW.conversation_id;

  IF v_business_id IS NOT NULL THEN
    -- "Alice (Acme Studio)" reads correctly whether a person or the business
    -- sent it, without ever presenting the business as a human.
    notify_title := 'New message in ' || COALESCE(business_name, 'your business') || ' from ' || actor_name;
  ELSE
    notify_title := 'New message from ' || actor_name;
  END IF;

  -- Individual user participants (excluding the sender).
  INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id, message_id)
  SELECT cp.user_id, 'message', notify_title, LEFT(NEW.content, 100),
         NEW.sender_id, 'conversation', NEW.conversation_id, NEW.id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id IS NOT NULL
    AND cp.user_id <> NEW.sender_id
    AND cp.muted = false;

  -- Every human behind the business, minus the sender.
  INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id, message_id)
  SELECT bm.user_id, 'message', notify_title, LEFT(NEW.content, 100),
         NEW.sender_id, 'conversation', NEW.conversation_id, NEW.id
  FROM public.conversation_participants cp
  JOIN public.business_members bm ON bm.business_id = cp.business_id
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.business_id IS NOT NULL
    AND bm.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$function$;

-- Editing a message re-notifies; keep it consistent with the new participants.
CREATE OR REPLACE FUNCTION public.sync_message_notification_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_name TEXT;
  rec RECORD;
BEGIN
  IF NEW.is_edited = false OR OLD.content = NEW.content THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO actor_name FROM public.profiles WHERE user_id = NEW.sender_id;
  actor_name := COALESCE(actor_name, 'Someone');

  FOR rec IN
    SELECT DISTINCT recipient_id
    FROM (
      SELECT cp.user_id AS recipient_id
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = NEW.conversation_id
        AND cp.user_id IS NOT NULL
        AND cp.user_id <> NEW.sender_id
        AND cp.muted = false
      UNION
      SELECT bm.user_id
      FROM public.conversation_participants cp
      JOIN public.business_members bm ON bm.business_id = cp.business_id
      WHERE cp.conversation_id = NEW.conversation_id
        AND cp.business_id IS NOT NULL
        AND bm.user_id <> NEW.sender_id
    ) AS recipients
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id, message_id)
    VALUES (rec.recipient_id, 'message', 'Message edited by ' || actor_name,
            LEFT(NEW.content, 100), NEW.sender_id, 'conversation', NEW.conversation_id, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Read-state backfill runs on a participant row. Guard the NULL identity.
CREATE OR REPLACE FUNCTION public.backfill_message_reads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at AND NEW.last_read_at IS NOT NULL THEN
    INSERT INTO public.message_reads (message_id, user_id, read_at)
    SELECT m.id, NEW.user_id, NEW.last_read_at
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.sender_id <> NEW.user_id
      AND m.created_at <= NEW.last_read_at
    ON CONFLICT (message_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Role escalation guard. Preserves the original admin-only rule; a business
-- participant row has no user, so its role is lifecycle-managed and must not be
-- user-editable.
CREATE OR REPLACE FUNCTION public.prevent_participant_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin()
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Changing conversation roles is not allowed';
  END IF;
  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6. get_or_create_dm_conversation must ignore business rows
-- ----------------------------------------------------------------------------
-- It counted participants to detect a 1:1 thread. Business rows would inflate
-- that count and break DM reuse.
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_conversation_id UUID;
  new_conversation_id    UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in'
      USING ERRCODE = '42501';
  END IF;

  IF other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot message yourself'
      USING ERRCODE = '22023';
  END IF;

  -- Count only human participants, and require exactly two distinct people.
  SELECT cp1.conversation_id INTO existing_conversation_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = auth.uid()
    AND cp2.user_id = other_user_id
    AND cp1.user_id <> cp2.user_id
    AND cp1.business_id IS NULL
    AND cp2.business_id IS NULL
    AND (
      SELECT count(DISTINCT cpx.user_id)
      FROM public.conversation_participants cpx
      WHERE cpx.conversation_id = cp1.conversation_id
        AND cpx.user_id IS NOT NULL
    ) = 2;

  IF existing_conversation_id IS NOT NULL THEN
    RETURN existing_conversation_id;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO new_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (new_conversation_id, auth.uid()), (new_conversation_id, other_user_id);

  RETURN new_conversation_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_participant(id, auth.uid()));

-- A business member may archive a thread only if they can admin the business.
DROP POLICY IF EXISTS "Owners can delete their conversations" ON public.conversations;
CREATE POLICY "Owners can delete their conversations"
  ON public.conversations FOR DELETE
  USING (
    owner_id = auth.uid()
    OR (
      type = 'business'
      AND business_id IS NOT NULL
      AND public.can_admin_business(business_id)
    )
  );

DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants of their conversations"
  ON public.conversation_participants FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

-- A member may update their own row. The business row is managed by the
-- business lifecycle triggers, never by an end user.
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- A business thread has no single conversation owner, so the original
-- "only the owner may delete" rule left business admins with no way to archive
-- an enquiry. They can now delete threads for businesses they administer.
CREATE OR REPLACE FUNCTION public.delete_conversation(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  conv_owner     UUID;
  conv_type      TEXT;
  conv_business  UUID;
BEGIN
  SELECT owner_id, type, business_id
  INTO conv_owner, conv_type, conv_business
  FROM public.conversations
  WHERE id = conv_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This conversation cannot be deleted';
  END IF;

  IF conv_type = 'business' THEN
    IF conv_business IS NULL OR NOT public.can_admin_business(conv_business) THEN
      RAISE EXCEPTION 'Only a business admin can delete this conversation';
    END IF;
  ELSIF conv_owner IS NULL OR conv_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the owner can delete this conversation';
  END IF;

  DELETE FROM public.conversations WHERE id = conv_id;
END;
$function$;

-- Staff leaving a business thread should drop their personal access, not the
-- business's. Guarded so it can never remove the business's own participant row.
CREATE OR REPLACE FUNCTION public.leave_conversation(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.conversation_participants
  WHERE conversation_id = conv_id
    AND user_id = auth.uid()
    AND business_id IS NULL;
END;
$function$;

-- Participants are created by SECURITY DEFINER RPCs (get_or_create_*_conversation,
-- add_conversation_members, the business-member fan-out trigger). There is
-- deliberately no INSERT policy: direct inserts would let anyone join any thread.
DROP POLICY IF EXISTS "Users can add themselves to conversations" ON public.conversation_participants;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND public.is_conversation_participant(messages.conversation_id, auth.uid())
    )
  );

-- A member replying "as the business" still has to be a real participant, which
-- is what stops an outsider from injecting messages into a business thread.
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND (
          cp.user_id = auth.uid()
          OR public.is_business_member_of(cp.business_id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can view reads in their conversations" ON public.message_reads;
CREATE POLICY "Users can view reads in their conversations"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND (
          cp.user_id = auth.uid()
          OR public.is_business_member_of(cp.business_id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.message_reads;
CREATE POLICY "Users can mark messages as read"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id
        AND (
          cp.user_id = auth.uid()
          OR public.is_business_member_of(cp.business_id, auth.uid())
        )
    )
  );
