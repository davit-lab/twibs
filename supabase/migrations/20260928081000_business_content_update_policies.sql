-- Add missing UPDATE policies for business-attributable tables.
--
-- RLS is enabled on these tables but the migration only added INSERT policies.
-- Without UPDATE policies, RLS blocks all UPDATEs (0 rows affected), which
-- means the reassignment guard trigger never fires.
--
-- The pattern mirrors posts: row owner (user_id = auth.uid()) may update their
-- own row. The trigger (enforce_business_attribution) still validates any
-- business_id change.

-- stars ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own stars" ON public.stars;
CREATE POLICY "Users can update their own stars"
  ON public.stars FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- saves ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own saves" ON public.saves;
CREATE POLICY "Users can update their own saves"
  ON public.saves FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- reposts -------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own reposts" ON public.reposts;
CREATE POLICY "Users can update their own reposts"
  ON public.reposts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- comments ------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts
       WHERE posts.id = comments.post_id
         AND public.is_post_visible(posts.*)
    )
  );

-- reel_comments -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can edit their comments" ON public.reel_comments;
CREATE POLICY "Users can update their own reel comments"
  ON public.reel_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- story_replies -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own story replies" ON public.story_replies;
CREATE POLICY "Users can update their own story replies"
  ON public.story_replies FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_story_visible(story_id)
    AND char_length(btrim(content)) > 0
    AND char_length(content) <= 500
  );

-- reel_likes ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own reel likes" ON public.reel_likes;
CREATE POLICY "Users can update their own reel likes"
  ON public.reel_likes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- story_likes ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own story likes" ON public.story_likes;
CREATE POLICY "Users can update their own story likes"
  ON public.story_likes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_story_visible(story_id)
  );

-- reels ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
CREATE POLICY "Users can update their own reels"
  ON public.reels FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- stories -------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own stories" ON public.stories;
CREATE POLICY "Users can update their own stories"
  ON public.stories FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- interest_posts ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own interest posts" ON public.interest_posts;
CREATE POLICY "Users can update their own interest posts"
  ON public.interest_posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );