-- Update repost_post RPC to support business_id
-- Uses the new split partial unique indexes: personal (user_id) and business (business_id)

CREATE OR REPLACE FUNCTION public.repost_post(target_post_id UUID, p_business_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_author UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NOT NULL THEN
    -- Business path: conflict on (post_id, business_id)
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'You must be a member of this business to repost on its behalf'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.reposts (post_id, user_id, business_id)
    VALUES (target_post_id, v_actor, p_business_id)
    ON CONFLICT (post_id, business_id) WHERE business_id IS NOT NULL DO NOTHING;
  ELSE
    -- Personal path: conflict on (post_id, user_id)
    INSERT INTO public.reposts (post_id, user_id)
    VALUES (target_post_id, v_actor)
    ON CONFLICT (post_id, user_id) WHERE business_id IS NULL DO NOTHING;
  END IF;

  -- Notify original author (if different from actor)
  SELECT user_id INTO v_author FROM public.posts WHERE id = target_post_id;
  IF v_author IS NOT NULL AND v_author <> v_actor
     AND NOT public.is_muted(v_author, v_actor) THEN
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
    VALUES (
      v_author,
      'system',
      'Your post was reposted',
      'Someone shared your post with their followers.',
      v_actor,
      'post',
      target_post_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.repost_post(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repost_post(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.repost_post(UUID, UUID) TO authenticated;