-- Create reel_comment_likes table
CREATE TABLE public.reel_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.reel_comment_likes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view comment likes"
ON public.reel_comment_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like comments"
ON public.reel_comment_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
ON public.reel_comment_likes FOR DELETE
USING (auth.uid() = user_id);

-- Trigger to update like_count
CREATE OR REPLACE FUNCTION public.update_reel_comment_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reel_comments SET like_count = COALESCE(like_count, 0) + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reel_comments SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_reel_comment_like_count_trigger
AFTER INSERT OR DELETE ON public.reel_comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_reel_comment_like_count();