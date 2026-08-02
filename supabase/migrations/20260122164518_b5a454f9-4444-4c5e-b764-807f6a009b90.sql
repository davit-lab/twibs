-- Create interest_posts table for premium users to post content based on their interests
CREATE TABLE public.interest_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.interest_categories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create interest_post_likes table
CREATE TABLE public.interest_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.interest_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Create interest_post_comments table
CREATE TABLE public.interest_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.interest_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.interest_post_comments(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_interest_posts_user_id ON public.interest_posts(user_id);
CREATE INDEX idx_interest_posts_category_id ON public.interest_posts(category_id);
CREATE INDEX idx_interest_posts_created_at ON public.interest_posts(created_at DESC);
CREATE INDEX idx_interest_post_likes_post_id ON public.interest_post_likes(post_id);
CREATE INDEX idx_interest_post_likes_user_id ON public.interest_post_likes(user_id);
CREATE INDEX idx_interest_post_comments_post_id ON public.interest_post_comments(post_id);

-- Enable RLS on all tables
ALTER TABLE public.interest_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_post_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for interest_posts

-- Anyone can view interest posts
CREATE POLICY "Anyone can view interest posts"
ON public.interest_posts FOR SELECT
USING (true);

-- Only premium users can create interest posts
CREATE POLICY "Premium users can create interest posts"
ON public.interest_posts FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND has_premium_access(auth.uid())
);

-- Users can update their own posts
CREATE POLICY "Users can update their own interest posts"
ON public.interest_posts FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own posts (admins too)
CREATE POLICY "Users can delete their own interest posts"
ON public.interest_posts FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- RLS Policies for interest_post_likes

-- Anyone can view likes
CREATE POLICY "Anyone can view interest post likes"
ON public.interest_post_likes FOR SELECT
USING (true);

-- Authenticated users can like posts
CREATE POLICY "Users can like interest posts"
ON public.interest_post_likes FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can remove their own likes
CREATE POLICY "Users can unlike interest posts"
ON public.interest_post_likes FOR DELETE
USING (user_id = auth.uid());

-- RLS Policies for interest_post_comments

-- Anyone can view comments
CREATE POLICY "Anyone can view interest post comments"
ON public.interest_post_comments FOR SELECT
USING (true);

-- Authenticated users can comment
CREATE POLICY "Users can comment on interest posts"
ON public.interest_post_comments FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own comments
CREATE POLICY "Users can update their own interest comments"
ON public.interest_post_comments FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments (admins too)
CREATE POLICY "Users can delete their own interest comments"
ON public.interest_post_comments FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- Function to update like count on interest posts
CREATE OR REPLACE FUNCTION public.update_interest_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.interest_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.interest_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for like count
CREATE TRIGGER update_interest_post_like_count_trigger
AFTER INSERT OR DELETE ON public.interest_post_likes
FOR EACH ROW EXECUTE FUNCTION public.update_interest_post_like_count();

-- Function to update comment count on interest posts
CREATE OR REPLACE FUNCTION public.update_interest_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.interest_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.interest_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for comment count
CREATE TRIGGER update_interest_post_comment_count_trigger
AFTER INSERT OR DELETE ON public.interest_post_comments
FOR EACH ROW EXECUTE FUNCTION public.update_interest_post_comment_count();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_interest_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_interest_posts_updated_at
BEFORE UPDATE ON public.interest_posts
FOR EACH ROW EXECUTE FUNCTION public.update_interest_post_updated_at();

CREATE TRIGGER update_interest_post_comments_updated_at
BEFORE UPDATE ON public.interest_post_comments
FOR EACH ROW EXECUTE FUNCTION public.update_interest_post_updated_at();