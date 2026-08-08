-- Add missing increment_reel_views RPC used by src/hooks/useReels.ts.
-- Without it, every reel view triggers a 404 (PostgREST falls back to a
-- direct update, so views still work, but the request logs an error).
CREATE OR REPLACE FUNCTION public.increment_reel_views(reel_id_input UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.reels
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = reel_id_input;
$$;
