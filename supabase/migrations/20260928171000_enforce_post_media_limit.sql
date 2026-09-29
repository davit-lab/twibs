-- Keep the shared 22-item composer limit authoritative at the database edge.
CREATE OR REPLACE FUNCTION public.enforce_post_media_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  media_count integer;
BEGIN
  -- Serialize inserts for one post so concurrent requests cannot bypass the cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.post_id::text, 0));
  EXECUTE format('SELECT count(*) FROM public.%I WHERE post_id = $1', TG_TABLE_NAME)
    INTO media_count
    USING NEW.post_id;
  IF media_count >= 22 THEN
    RAISE EXCEPTION 'A post can contain at most 22 media items'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_media_limit ON public.post_media;
CREATE TRIGGER enforce_post_media_limit
BEFORE INSERT ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.enforce_post_media_limit();

DROP TRIGGER IF EXISTS enforce_interest_post_media_limit ON public.interest_post_media;
CREATE TRIGGER enforce_interest_post_media_limit
BEFORE INSERT ON public.interest_post_media
FOR EACH ROW EXECUTE FUNCTION public.enforce_post_media_limit();
