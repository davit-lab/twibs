-- Inbox & transparency features:
--  1. Ghost Mode: profile_views tracking + ghost_mode preference
--  2. Social Cleanup Day data helpers
--  3. Temporary identity (24h posts) + "Add Context" metadata on posts
--  4. "Why am I seeing this?" per-user feed signals
--  5. No Like Counts mode preference

-- ---------------------------------------------------------------------------
-- 1. Posts: temporary expiry (24h posts) + context metadata (Context Button)
-- ---------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS context_meta JSONB;

CREATE INDEX IF NOT EXISTS posts_expires_at_idx ON public.posts (expires_at);

-- ---------------------------------------------------------------------------
-- 2. user_preferences: new toggles
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_like_counts BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. profile_views (Ghost Mode / profile viewers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE DEFAULT auth.uid(),
  target_id UUID NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_views_target_idx ON public.profile_views (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_views_viewer_idx ON public.profile_views (viewer_id, created_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- A viewer may only record their own views
CREATE POLICY "profile_views_insert_own"
  ON public.profile_views
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- The target (profile owner) can read their viewers; a viewer can see their own history
CREATE POLICY "profile_views_read_owner"
  ON public.profile_views
  FOR SELECT
  USING (auth.uid() = target_id OR auth.uid() = viewer_id);

-- A viewer can delete their own views
CREATE POLICY "profile_views_delete_own"
  ON public.profile_views
  FOR DELETE
  USING (auth.uid() = viewer_id);

-- ---------------------------------------------------------------------------
-- 4. feed_signals ("Why am I seeing this?" — fewer/more like this)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE DEFAULT auth.uid(),
  post_id UUID NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  signal TEXT NOT NULL CHECK (signal IN ('less', 'more')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS feed_signals_user_idx ON public.feed_signals (user_id);

ALTER TABLE public.feed_signals ENABLE ROW LEVEL SECURITY;

-- A user's signals are only ever visible/editable by themselves
CREATE POLICY "feed_signals_own"
  ON public.feed_signals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);