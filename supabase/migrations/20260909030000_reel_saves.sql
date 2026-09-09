-- Persisted "saved reels" bookmarks.
-- Previously the UI kept saved state in a page-local Set (lost on navigation),
-- so the save action was never durable. This table mirrors interest_post_saves.
CREATE TABLE public.reel_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, reel_id)
);

CREATE INDEX idx_reel_saves_reel_id ON public.reel_saves(reel_id);
CREATE INDEX idx_reel_saves_user_id ON public.reel_saves(user_id);

ALTER TABLE public.reel_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their saved reels"
ON public.reel_saves FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can save reels"
ON public.reel_saves FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave reels"
ON public.reel_saves FOR DELETE
USING (user_id = auth.uid());