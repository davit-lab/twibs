-- ===========================================
-- NEXUSLINK PHASE 2: CONTENT & FEED SYSTEM
-- ===========================================

-- Create enum for post visibility
CREATE TYPE public.post_visibility AS ENUM ('public', 'followers', 'private');

-- ===========================================
-- POSTS TABLE
-- ===========================================
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    visibility public.post_visibility DEFAULT 'public',
    star_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT content_length CHECK (char_length(content) <= 5000)
);

-- ===========================================
-- POST MEDIA TABLE
-- ===========================================
CREATE TABLE public.post_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    width INTEGER,
    height INTEGER,
    alt_text TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ===========================================
-- STARS TABLE (Reactions)
-- ===========================================
CREATE TABLE public.stars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (post_id, user_id)
);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Check if a post is visible to the current user
CREATE OR REPLACE FUNCTION public.is_post_visible(post_row public.posts)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        CASE 
            -- Post owner can always see their own posts
            WHEN post_row.user_id = auth.uid() THEN true
            -- Admins/mods can see all posts
            WHEN public.is_admin_or_moderator() THEN true
            -- Public posts are visible to everyone
            WHEN post_row.visibility = 'public' THEN true
            -- Private posts only visible to owner (handled above)
            WHEN post_row.visibility = 'private' THEN false
            -- Followers visibility - for now allow public until follows table exists
            WHEN post_row.visibility = 'followers' THEN true
            ELSE false
        END
$$;

-- Function to update star count on posts
CREATE OR REPLACE FUNCTION public.update_post_star_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET star_count = star_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET star_count = star_count - 1 WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update updated_at on posts
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update star count when stars are added/removed
CREATE TRIGGER update_star_count
    AFTER INSERT OR DELETE ON public.stars
    FOR EACH ROW
    EXECUTE FUNCTION public.update_post_star_count();

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;

-- POSTS POLICIES
CREATE POLICY "Users can view visible posts"
    ON public.posts
    FOR SELECT
    USING (public.is_post_visible(posts.*));

CREATE POLICY "Users can create their own posts"
    ON public.posts
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own posts"
    ON public.posts
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own posts"
    ON public.posts
    FOR DELETE
    USING (user_id = auth.uid() OR public.is_admin_or_moderator());

-- POST MEDIA POLICIES
CREATE POLICY "Media visible with post"
    ON public.post_media
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.posts 
            WHERE posts.id = post_media.post_id 
            AND public.is_post_visible(posts.*)
        )
    );

CREATE POLICY "Users can add media to their posts"
    ON public.post_media
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.posts 
            WHERE posts.id = post_id 
            AND posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete media from their posts"
    ON public.post_media
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.posts 
            WHERE posts.id = post_id 
            AND posts.user_id = auth.uid()
        )
    );

-- STARS POLICIES
CREATE POLICY "Stars are viewable by everyone"
    ON public.stars
    FOR SELECT
    USING (true);

CREATE POLICY "Users can star posts"
    ON public.stars
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unstar posts"
    ON public.stars
    FOR DELETE
    USING (user_id = auth.uid());

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX idx_posts_visibility ON public.posts(visibility);
CREATE INDEX idx_post_media_post_id ON public.post_media(post_id);
CREATE INDEX idx_stars_post_id ON public.stars(post_id);
CREATE INDEX idx_stars_user_id ON public.stars(user_id);

-- ===========================================
-- ENABLE REALTIME
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stars;

-- ===========================================
-- STORAGE BUCKET FOR MEDIA
-- ===========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'post-media', 
    'post-media', 
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
);

-- Storage policies for post media
CREATE POLICY "Anyone can view post media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'post-media');

CREATE POLICY "Authenticated users can upload post media"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'post-media' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update their own media"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'post-media' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete their own media"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'post-media' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );