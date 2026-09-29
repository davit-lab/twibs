-- Persist only the identity currently presenting. Media still travels through
-- WebRTC; this field lets the remote UI distinguish a camera track from a
-- shared display track without inspecting private SDP or browser heuristics.
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS screen_sharing_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_call_screen_sharing(
  p_session_id uuid,
  p_sharing boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to update call media' USING ERRCODE = '42501';
  END IF;

  UPDATE public.call_sessions
  SET screen_sharing_by = CASE WHEN p_sharing THEN auth.uid() ELSE NULL END
  WHERE id = p_session_id
    AND status = 'accepted'
    AND (caller_id = auth.uid() OR receiver_id = auth.uid())
    AND (
      p_sharing
      OR screen_sharing_by IS NULL
      OR screen_sharing_by = auth.uid()
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Call is unavailable for screen sharing' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_call_screen_sharing(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_call_screen_sharing(uuid, boolean) TO authenticated;
