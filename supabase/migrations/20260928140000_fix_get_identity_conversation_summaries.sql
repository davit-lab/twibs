-- ============================================================================
-- FIX: get_identity_conversation_summaries RPC
-- ============================================================================
-- The original RPC only joined on cp.user_id = auth.uid(), which fails for
-- business conversations where the business participant row has user_id = NULL
-- and business_id = p_business_id. This fix properly finds the current user's
-- participant row (by user_id or business membership) to get last_read_at.

CREATE OR REPLACE FUNCTION public.get_identity_conversation_summaries(p_business_id uuid DEFAULT NULL)
RETURNS TABLE(conversation_id uuid, last_message jsonb, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,
    (SELECT jsonb_build_object('id', m.id, 'content', m.content, 'sender_id', m.sender_id, 'created_at', m.created_at)
     FROM messages m
     WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC LIMIT 1),
    (SELECT count(*)
     FROM messages m
     WHERE m.conversation_id = c.id
       AND m.created_at > coalesce(my_cp.last_read_at, 'epoch'::timestamptz)
       AND CASE
         WHEN p_business_id IS NOT NULL THEN m.sender_business_id IS DISTINCT FROM p_business_id
         ELSE m.sender_id <> auth.uid()
       END)
  FROM conversations c
  -- Find the current identity's participant row for this conversation
  JOIN LATERAL (
    SELECT cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.conversation_id = c.id
      AND (
        cp.user_id = auth.uid()
        OR (p_business_id IS NOT NULL AND cp.business_id = p_business_id)
      )
    LIMIT 1
  ) my_cp ON true
  WHERE public.is_conversation_participant(c.id, auth.uid())
    AND CASE
      WHEN p_business_id IS NOT NULL THEN c.type = 'business' AND c.business_id = p_business_id
      ELSE c.type <> 'business'
    END
  ORDER BY c.updated_at DESC LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_identity_conversation_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_identity_conversation_summaries(uuid) TO authenticated;