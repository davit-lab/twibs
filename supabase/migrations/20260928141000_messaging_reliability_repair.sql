-- Messaging reliability repair: preserve historical rows while making the
-- active identity the single source of inbox scope and DM creation.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS dm_pair_key text;

-- Historical duplicate DMs are intentionally retained. Give one oldest thread
-- per pair a canonical key; the remaining records remain readable history.
WITH direct_pairs AS (
  SELECT c.id,
         least(min(cp.user_id::text), max(cp.user_id::text)) || ':' ||
         greatest(min(cp.user_id::text), max(cp.user_id::text)) AS pair_key,
         c.created_at
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE c.type = 'dm' AND cp.user_id IS NOT NULL AND cp.business_id IS NULL
  GROUP BY c.id, c.created_at
  HAVING count(DISTINCT cp.user_id) = 2
), ranked_direct_pairs AS (
  SELECT id, pair_key,
         row_number() OVER (PARTITION BY pair_key ORDER BY created_at, id) AS row_number
  FROM direct_pairs
)
UPDATE public.conversations c
SET dm_pair_key = ranked_direct_pairs.pair_key
FROM ranked_direct_pairs
WHERE c.id = ranked_direct_pairs.id
  AND ranked_direct_pairs.row_number = 1
  AND c.dm_pair_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm_pair_key_unique
  ON public.conversations (dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_pair_key text;
  v_conversation uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;
  IF other_user_id IS NULL OR other_user_id = v_caller THEN
    RAISE EXCEPTION 'You cannot message yourself' USING ERRCODE = '22023';
  END IF;

  v_pair_key := least(v_caller::text, other_user_id::text) || ':' ||
                greatest(v_caller::text, other_user_id::text);
  -- Serialize concurrent taps by the same pair so the unique index is a final
  -- safeguard rather than a user-visible race.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  SELECT id INTO v_conversation
  FROM public.conversations
  WHERE type = 'dm' AND dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_conversation IS NULL THEN
    -- Adopt a pre-key historical DM before creating anything new.
    SELECT c.id INTO v_conversation
    FROM public.conversations c
    WHERE c.type = 'dm'
      AND EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = v_caller)
      AND EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = other_user_id)
      AND (SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id IS NOT NULL) = 2
    ORDER BY c.created_at, c.id
    LIMIT 1;
    IF v_conversation IS NOT NULL THEN
      UPDATE public.conversations SET dm_pair_key = v_pair_key WHERE id = v_conversation AND dm_pair_key IS NULL;
    END IF;
  END IF;

  IF v_conversation IS NULL THEN
    INSERT INTO public.conversations (type, dm_pair_key)
    VALUES ('dm', v_pair_key)
    RETURNING id INTO v_conversation;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conversation, v_caller), (v_conversation, other_user_id);
  END IF;
  RETURN v_conversation;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_identity_conversation_summaries(p_business_id uuid DEFAULT NULL)
RETURNS TABLE(conversation_id uuid, last_message jsonb, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,
    (SELECT jsonb_build_object('id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at)
       FROM public.messages m WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
    (SELECT count(*) FROM public.messages m
       WHERE m.conversation_id = c.id
         AND m.created_at > coalesce(my_cp.last_read_at, 'epoch'::timestamptz)
         AND CASE WHEN p_business_id IS NOT NULL
           THEN m.sender_business_id IS DISTINCT FROM p_business_id
           ELSE m.sender_id <> auth.uid() END)
  FROM public.conversations c
  LEFT JOIN public.conversation_participants my_cp
    ON my_cp.conversation_id = c.id AND my_cp.user_id = auth.uid()
  WHERE CASE
    WHEN p_business_id IS NOT NULL THEN
      c.type = 'business' AND c.business_id = p_business_id
      AND public.is_business_member_of(p_business_id, auth.uid())
    ELSE
      EXISTS (SELECT 1 FROM public.conversation_participants cp
              WHERE cp.conversation_id = c.id AND cp.user_id = auth.uid())
      AND (c.type <> 'business' OR NOT public.is_business_member_of(c.business_id, auth.uid()))
  END
  ORDER BY c.updated_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_identity_conversation_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_identity_conversation_summaries(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_dm_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_conversation(uuid) TO authenticated;
