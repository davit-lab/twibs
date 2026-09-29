-- Business inbox discovery + self-thread guard
-- ----------------------------------------------------------------------------
-- Two defects in the business messaging model, both reported from real usage:
--
-- 1. Staff could not see the business inbox.
--    The inbox is built from `conversation_participants WHERE user_id = me`.
--    `sync_business_member_to_conversations()` only adds a member to the
--    conversations that already exist at the moment they join the business, so
--    anyone who joined *before* a customer opened a thread never gets a row for
--    that thread. Their inbox came back empty even though RLS let them read and
--    reply, and typing/read-receipt updates silently no-op'd because they update
--    a row that does not exist.
--
-- 2. A staff member could open a "customer" thread with their own business.
--    `get_or_create_business_conversation` only rejected the owner
--    (`v_business.user_id = v_caller`), so anyone else in `business_members`
--    could create a thread that looked exactly like an inbound enquiry but was
--    them talking to themselves.
--
-- The fix is to make business membership uniform across every business
-- conversation, in both directions: existing threads are backfilled, new
-- threads fan out to current members, and membership (not just ownership) is
-- what closes a self-thread.
--
-- Participant rows carry role = 'member' / 'owner' precisely so the UI can keep
-- showing a customer the business rather than a list of staff.

-- ----------------------------------------------------------------------------
-- 1. Fan-out helper
-- ----------------------------------------------------------------------------
-- Idempotent by construction: it checks for the row before inserting rather than
-- relying on a unique constraint, so it is safe to run against a database whose
-- participant rows predate the constraint and may already contain duplicates.
CREATE OR REPLACE FUNCTION public.ensure_business_conversation_members(
  p_conversation_id uuid,
  p_business_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_conversation_id IS NULL OR p_business_id IS NULL THEN
    RETURN;
  END IF;

  -- Staff.
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id, role)
  SELECT p_conversation_id, bm.user_id, NULL, 'member'
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = p_conversation_id
        AND cp.user_id = bm.user_id
    );

  -- Owner. is_business_member_of() treats advertiser_accounts.user_id as a
  -- member, so the owner needs a row here too, otherwise the owner would be the
  -- one person who can read a thread but has no inbox entry for it.
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id, role)
  SELECT p_conversation_id, a.user_id, NULL, 'owner'
  FROM public.advertiser_accounts a
  WHERE a.id = p_business_id
    AND a.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = p_conversation_id
        AND cp.user_id = a.user_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_business_conversation_members(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_business_conversation_members(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. New business threads fan out to the members alive at creation time
-- ----------------------------------------------------------------------------
-- Closes the gap the membership trigger cannot: someone who joined the business
-- last month was already a member when today's enquiry arrived.
-- Trigger functions take no arguments, so this wraps the helper and reads the
-- inserted row from the trigger context.
CREATE OR REPLACE FUNCTION public.trg_business_conversation_member_fanout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.ensure_business_conversation_members(NEW.id, NEW.business_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_business_conversation_member_fanout() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_business_conversation_member_fanout ON public.conversations;

CREATE TRIGGER trg_business_conversation_member_fanout
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  WHEN (NEW.type = 'business' AND NEW.business_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_business_conversation_member_fanout();

-- ----------------------------------------------------------------------------
-- 3. Backfill existing business conversations
-- ----------------------------------------------------------------------------
-- Only threads that are genuinely business-facing: a business_id on the
-- conversation, or a business placeholder participant row. Personal DMs are
-- never touched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.id AS conversation_id, c.business_id
    FROM public.conversations c
    WHERE c.type = 'business'
      AND c.business_id IS NOT NULL
  LOOP
    PERFORM public.ensure_business_conversation_members(r.conversation_id, r.business_id);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Membership, not just ownership, closes a self-thread
-- ----------------------------------------------------------------------------
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

  -- You cannot open a thread with a business you work for, whoever you are
  -- inside it. Checking only the owner let every other member open a
  -- customer-shaped thread with their own employer.
  IF public.is_business_member_of(p_business_id, v_caller) THEN
    RAISE EXCEPTION 'You already manage this business'
      USING ERRCODE = '22023';
  END IF;

  IF v_business.status <> 'active' THEN
    RAISE EXCEPTION 'This business is not currently accepting messages'
      USING ERRCODE = '22023';
  END IF;

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

  -- The AFTER INSERT trigger on conversations adds the current members, so the
  -- staff and owner rows are in place before this returns.
  INSERT INTO public.conversations (type, business_id, name, avatar_url)
  VALUES (
    'business',
    p_business_id,
    v_business.name,
    v_business.avatar_url
  )
  RETURNING id INTO v_conversation;

  -- The customer row. The business placeholder row is added by the trigger's
  -- companion insert below for clarity, and is safe to repeat.
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id)
  VALUES (v_conversation, v_caller, NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id)
  VALUES (v_conversation, NULL, p_business_id)
  ON CONFLICT DO NOTHING;

  PERFORM public.ensure_business_conversation_members(v_conversation, p_business_id);

  RETURN v_conversation;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_business_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_business_conversation(uuid) TO authenticated, service_role;
