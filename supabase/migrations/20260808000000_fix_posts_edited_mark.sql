-- Fix "edited" mark showing on posts that were never edited.
-- The star/comment count triggers update posts, which fired the
-- update_posts_updated_at BEFORE UPDATE trigger and bumped updated_at,
-- so posts that merely received a star/comment appeared as "edited".

-- 1) Only bump updated_at when content-relevant columns actually change.
DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE OF content, visibility, is_pinned ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Track edits explicitly with a dedicated column (like comments/messages).
ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false;
