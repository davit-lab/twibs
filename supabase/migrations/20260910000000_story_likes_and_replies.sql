-- Story likes for the redesigned Stories system.
--
-- Stories previously had no way to react. This adds:
--   * story_likes – a viewer taps the heart on a story (denormalized count
--                    lives on stories.like_count via trigger, mirroring the
--                    existing view_count pattern).
--
-- Story replies are handled via direct messages, not a dedicated replies table.

-- ── story_likes ──
CREATE TABLE public.story_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

CREATE INDEX idx_story_likes_story_id ON public.story_likes(story_id);
CREATE INDEX idx_story_likes_user_id ON public.story_likes(user_id);

-- Denormalized like count (same pattern as view_count).
ALTER TABLE public.stories ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

-- A story is "visible" when it has not expired, or it belongs to the requester.
CREATE OR REPLACE FUNCTION public.is_story_visible(story_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stories
    WHERE id = $1 AND (expires_at > now() OR user_id = auth.uid())
  );
$$;

-- ── story_likes policies ──
CREATE POLICY "Users can view likes on visible stories"
ON public.story_likes FOR SELECT
USING (public.is_story_visible(story_id) OR user_id = auth.uid());

CREATE POLICY "Users can like visible stories"
ON public.story_likes FOR INSERT
WITH CHECK (user_id = auth.uid() AND public.is_story_visible(story_id));

CREATE POLICY "Users can unlike their own likes"
ON public.story_likes FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- ── like_count maintenance ──
CREATE OR REPLACE FUNCTION public.update_story_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.stories SET like_count = like_count + 1 WHERE id = NEW.story_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.stories SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.story_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_story_like
  AFTER INSERT OR DELETE ON public.story_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_story_like_count();