-- Atomic ICE candidate storage for WebRTC signaling.
-- Avoids read-modify-write races that can lose candidates during a call.
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
BEGIN
  IF p_is_caller THEN
    UPDATE public.call_sessions
    SET caller_ice_candidates = caller_ice_candidates || p_candidate
    WHERE id = p_session_id;
  ELSE
    UPDATE public.call_sessions
    SET receiver_ice_candidates = receiver_ice_candidates || p_candidate
    WHERE id = p_session_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_call_ice_candidate(uuid, boolean, jsonb) TO anon, authenticated;
