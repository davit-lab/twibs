-- Create comments table with threading support
CREATE TABLE public.comments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    upvote_count INTEGER DEFAULT 0,
    downvote_count INTEGER DEFAULT 0,
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create comment_votes table
CREATE TABLE public.comment_votes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(comment_id, user_id)
);

-- Create indexes
CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX idx_comments_user_id ON public.comments(user_id);
CREATE INDEX idx_comment_votes_comment_id ON public.comment_votes(comment_id);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;

-- Comments RLS policies
CREATE POLICY "Comments visible with post" ON public.comments
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.posts 
        WHERE posts.id = comments.post_id 
        AND public.is_post_visible(posts.*)
    )
);

CREATE POLICY "Users can create comments" ON public.comments
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own comments" ON public.comments
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments" ON public.comments
FOR DELETE USING (user_id = auth.uid() OR public.is_admin_or_moderator());

-- Comment votes RLS policies
CREATE POLICY "Votes are viewable by everyone" ON public.comment_votes
FOR SELECT USING (true);

CREATE POLICY "Users can vote on comments" ON public.comment_votes
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can change their vote" ON public.comment_votes
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their vote" ON public.comment_votes
FOR DELETE USING (user_id = auth.uid());

-- Function to update comment vote counts
CREATE OR REPLACE FUNCTION public.update_comment_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count - 1 WHERE id = OLD.comment_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle vote change
        IF OLD.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count - 1 WHERE id = OLD.comment_id;
        END IF;
        IF NEW.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Create trigger for vote count updates
CREATE TRIGGER on_comment_vote_change
AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
FOR EACH ROW EXECUTE FUNCTION public.update_comment_vote_count();

-- Function to update post comment count
CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Create trigger for post comment count
CREATE TRIGGER on_comment_change
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_post_comment_count();

-- Trigger for updated_at
CREATE TRIGGER update_comments_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;