-- ===========================================
-- INTEREST POSTS: MULTIPLE MEDIA SUPPORT
-- ===========================================
-- This migration adds support for multiple media items per interest post,
-- matching the post_media architecture used by regular posts.

-- ===========================================
-- INTEREST POST MEDIA TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS public.interest_post_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.interest_posts(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    width INTEGER,
    height INTEGER,
    alt_text TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================
ALTER TABLE public.interest_post_media ENABLE ROW LEVEL SECURITY;

-- Media visible with post
DROP POLICY IF EXISTS "Interest media visible with post" ON public.interest_post_media;
CREATE POLICY "Interest media visible with post"
    ON public.interest_post_media
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.interest_posts
            WHERE interest_posts.id = interest_post_media.post_id
            AND interest_posts.hidden = false
        )
    );

-- Users can add media to their posts
DROP POLICY IF EXISTS "Users can add media to their interest posts" ON public.interest_post_media;
CREATE POLICY "Users can add media to their interest posts"
    ON public.interest_post_media
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.interest_posts
            WHERE interest_posts.id = post_id
            AND interest_posts.user_id = auth.uid()
        )
    );

-- Users can delete media from their posts
DROP POLICY IF EXISTS "Users can delete media from their interest posts" ON public.interest_post_media;
CREATE POLICY "Users can delete media from their interest posts"
    ON public.interest_post_media
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.interest_posts
            WHERE interest_posts.id = post_id
            AND interest_posts.user_id = auth.uid()
        )
    );

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_interest_post_media_post_id ON public.interest_post_media(post_id);

-- ===========================================
-- ENABLE REALTIME
-- ===========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'interest_post_media'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.interest_post_media;
    END IF;
END $$;

-- ===========================================
-- STORAGE BUCKET FOR INTEREST MEDIA
-- ===========================================
-- Increase file size limit to support larger images/videos (25MB for video, 10MB for images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'interest-media',
    'interest-media',
    true,
    26214400, -- 25MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

-- Storage policies for interest media
DROP POLICY IF EXISTS "Anyone can view interest media" ON storage.objects;
CREATE POLICY "Anyone can view interest media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'interest-media');

DROP POLICY IF EXISTS "Authenticated users can upload interest media" ON storage.objects;
CREATE POLICY "Authenticated users can upload interest media"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'interest-media'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can update their own interest media" ON storage.objects;
CREATE POLICY "Users can update their own interest media"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'interest-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can delete their own interest media" ON storage.objects;
CREATE POLICY "Users can delete their own interest media"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'interest-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ===========================================
-- MIGRATE EXISTING SINGLE MEDIA TO NEW TABLE
-- ===========================================
-- This migrates existing interest_posts with media_url/media_type to the new table
INSERT INTO public.interest_post_media (post_id, url, type, width, height, position, created_at)
SELECT
    id,
    media_url,
    CASE WHEN media_type ILIKE 'video%' THEN 'video' ELSE 'image' END,
    NULL,
    NULL,
    0,
    created_at
FROM public.interest_posts
WHERE media_url IS NOT NULL AND media_type IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.interest_post_media existing
      WHERE existing.post_id = interest_posts.id
        AND existing.url = interest_posts.media_url
  );

-- ===========================================
-- ADD COMMENTS FOR DOCUMENTATION
-- ===========================================
COMMENT ON TABLE public.interest_post_media IS 'Stores multiple media attachments for interest posts (images/videos)';
COMMENT ON COLUMN public.interest_post_media.position IS 'Display order of media within the post (0-based)';
