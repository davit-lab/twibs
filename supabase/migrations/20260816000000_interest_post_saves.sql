-- Create interest_post_saves table for bookmarking interest posts
CREATE TABLE public.interest_post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.interest_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_interest_post_saves_post_id ON public.interest_post_saves(post_id);
CREATE INDEX idx_interest_post_saves_user_id ON public.interest_post_saves(user_id);

ALTER TABLE public.interest_post_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view interest post saves"
ON public.interest_post_saves FOR SELECT
USING (true);

CREATE POLICY "Users can save interest posts"
ON public.interest_post_saves FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave interest posts"
ON public.interest_post_saves FOR DELETE
USING (user_id = auth.uid());
