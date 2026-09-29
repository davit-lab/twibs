-- Make ICE persistence observable and safe. A successful RPC must mean that
-- the candidate reached this exact call row; silent zero-row updates caused
-- one-sided calls that looked accepted but carried no remote audio.
CREATE OR REPLACE FUNCTION public.append_call_ice_candidate(
  p_session_id uuid,
  p_is_caller boolean,
  p_candidate jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR p_candidate IS NULL THEN
    RAISE EXCEPTION 'Invalid ICE signaling request' USING ERRCODE = '22023';
  END IF;

  IF p_is_caller THEN
    UPDATE public.call_sessions
    SET caller_ice_candidates = coalesce(caller_ice_candidates, '[]'::jsonb) || jsonb_build_array(p_candidate)
    WHERE id = p_session_id AND caller_id = auth.uid();
  ELSE
    UPDATE public.call_sessions
    SET receiver_ice_candidates = coalesce(receiver_ice_candidates, '[]'::jsonb) || jsonb_build_array(p_candidate)
    WHERE id = p_session_id AND receiver_id = auth.uid();
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Call session is unavailable for this participant' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.append_call_ice_candidate(uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_call_ice_candidate(uuid, boolean, jsonb) TO authenticated;
