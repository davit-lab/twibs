-- ===========================================
-- NEXUSLINK PHASE 3: FOLLOW SYSTEM
-- ===========================================

-- Create enum for follow status
CREATE TYPE public.follow_status AS ENUM ('pending', 'accepted', 'blocked');

-- ===========================================
-- FOLLOWS TABLE
-- ===========================================
CREATE TABLE public.follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status public.follow_status DEFAULT 'accepted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Check if user A is following user B (accepted status)
CREATE OR REPLACE FUNCTION public.is_following(_follower_id UUID, _following_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.follows
        WHERE follower_id = _follower_id
        AND following_id = _following_id
        AND status = 'accepted'
    )
$$;

-- Get follower count for a user
CREATE OR REPLACE FUNCTION public.get_follower_count(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM public.follows
    WHERE following_id = _user_id
    AND status = 'accepted'
$$;

-- Get following count for a user
CREATE OR REPLACE FUNCTION public.get_following_count(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM public.follows
    WHERE follower_id = _user_id
    AND status = 'accepted'
$$;

-- Update is_post_visible to properly handle followers-only posts
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
            -- Followers visibility - check if current user follows the post author
            WHEN post_row.visibility = 'followers' THEN 
                public.is_following(auth.uid(), post_row.user_id)
            ELSE false
        END
$$;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update updated_at on follows
CREATE TRIGGER update_follows_updated_at
    BEFORE UPDATE ON public.follows
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Users can view follow relationships they're part of, or public follows
CREATE POLICY "Users can view relevant follows"
    ON public.follows
    FOR SELECT
    USING (
        follower_id = auth.uid() 
        OR following_id = auth.uid()
        OR status = 'accepted'
        OR public.is_admin_or_moderator()
    );

-- Users can create follow requests
CREATE POLICY "Users can follow others"
    ON public.follows
    FOR INSERT
    WITH CHECK (follower_id = auth.uid());

-- Users can update follows where they are the one being followed (accept/reject)
-- Or where they are the follower (cancel request)
CREATE POLICY "Users can update their follow relationships"
    ON public.follows
    FOR UPDATE
    USING (following_id = auth.uid() OR follower_id = auth.uid())
    WITH CHECK (following_id = auth.uid() OR follower_id = auth.uid());

-- Users can delete follows they created or received
CREATE POLICY "Users can remove follow relationships"
    ON public.follows
    FOR DELETE
    USING (follower_id = auth.uid() OR following_id = auth.uid());

-- ===========================================
-- INDEXES
-- ===========================================
CREATE INDEX idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX idx_follows_following_id ON public.follows(following_id);
CREATE INDEX idx_follows_status ON public.follows(status);
CREATE INDEX idx_follows_follower_status ON public.follows(follower_id, status);
CREATE INDEX idx_follows_following_status ON public.follows(following_id, status);

-- ===========================================
-- ENABLE REALTIME
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;