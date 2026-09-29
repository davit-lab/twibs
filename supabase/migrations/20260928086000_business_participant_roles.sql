-- Correct the business participant role labels
-- ----------------------------------------------------------------------------
-- 20260928085000 inserted business-side participants with a hardcoded role of
-- 'member'. That was wrong twice over:
--
--   * `conversation_participants.role` is NOT NULL DEFAULT 'member', so the
--     literal was indistinguishable from the value a *customer* row gets. The
--     business side and the customer side became impossible to tell apart.
--   * The owner is stored in `business_members` with role 'owner', but the
--     hardcoded insert overwrote that to 'member' -- and because the
--     NOT EXISTS guard then saw the row as already present, the follow-up owner
--     insert never corrected it. The owner was labelled 'member'.
--
-- The role a participant holds is copied from `business_members.role` instead.
-- The business_role enum is owner / admin / advertiser / analyst -- none of
-- which is 'member' -- so a business-side row is now reliably distinguishable
-- from a customer row, which keeps the default 'member'.
--
-- The CHECK constraint on conversation_participants.role only ever allowed
-- owner / admin / member, which is narrower than the roles a business member
-- can actually hold, so 'analyst' and 'advertiser' were rejected outright. It
-- is widened to the business_role vocabulary plus 'member', which is the value
-- customer rows keep. Existing rows are all valid under the wider set, so this
-- is additive and cannot invalidate data.

ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_role_check;

ALTER TABLE public.conversation_participants
  ADD CONSTRAINT conversation_participants_role_check
  CHECK (role = ANY (ARRAY[
    'owner'::text, 'admin'::text, 'member'::text,
    'advertiser'::text, 'analyst'::text
  ]));

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

  -- Staff, carrying the role they actually hold in the business.
  INSERT INTO public.conversation_participants (conversation_id, user_id, business_id, role)
  SELECT p_conversation_id, bm.user_id, NULL, bm.role::text
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = p_conversation_id
        AND cp.user_id = bm.user_id
    );

  -- Owner, in case the business has an owner row but no business_members entry
  -- for it.
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

  -- Relabel an owner row that already existed with the default 'member', which
  -- is what 20260928085000 left behind.
  UPDATE public.conversation_participants cp
  SET role = 'owner'
  FROM public.advertiser_accounts a
  WHERE a.id = p_business_id
    AND a.user_id IS NOT NULL
    AND cp.conversation_id = p_conversation_id
    AND cp.user_id = a.user_id
    AND cp.role = 'member';
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_business_conversation_members(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_business_conversation_members(uuid, uuid) TO service_role;

-- Repair rows already written by the previous version.
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
