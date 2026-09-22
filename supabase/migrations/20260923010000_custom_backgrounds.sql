-- Custom chat backgrounds: user-owned wallpaper library.
--
-- The wallpaper *value* stays on conversations.chat_wallpaper (either a system
-- background id or the public URL of a user upload). This table tracks each
-- user's own uploads so the picker can list/manage them without mixing
-- ownership with system backgrounds.

-- 1. Dedicated storage bucket for user-uploaded wallpapers.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wallpapers', 'wallpapers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (uploaded wallpapers are shown to conversation participants).
DROP POLICY IF EXISTS "Wallpapers are publicly viewable" ON storage.objects;
CREATE POLICY "Wallpapers are publicly viewable" ON storage.objects
  FOR SELECT USING (bucket_id = 'wallpapers');

-- Writes only under the authenticated user's own folder: <user-id>/...
DROP POLICY IF EXISTS "Users upload their own wallpapers" ON storage.objects;
CREATE POLICY "Users upload their own wallpapers" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update their own wallpapers" ON storage.objects;
CREATE POLICY "Users update their own wallpapers" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own wallpapers" ON storage.objects;
CREATE POLICY "Users delete their own wallpapers" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'wallpapers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Ownership registry for custom backgrounds.
CREATE TABLE IF NOT EXISTS public.custom_backgrounds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  url         text NOT NULL,
  storage_path text,
  thumb_path  text,
  mime        text,
  file_size   integer,
  width       integer,
  height      integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_backgrounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own custom backgrounds" ON public.custom_backgrounds;
CREATE POLICY "Users read their own custom backgrounds" ON public.custom_backgrounds
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert their own custom backgrounds" ON public.custom_backgrounds;
CREATE POLICY "Users insert their own custom backgrounds" ON public.custom_backgrounds
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own custom backgrounds" ON public.custom_backgrounds;
CREATE POLICY "Users update their own custom backgrounds" ON public.custom_backgrounds
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete their own custom backgrounds" ON public.custom_backgrounds;
CREATE POLICY "Users delete their own custom backgrounds" ON public.custom_backgrounds
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS custom_backgrounds_user_created_idx
  ON public.custom_backgrounds (user_id, created_at DESC);

-- 3. When a user deletes a custom background it may still be applied to one of
-- their conversations. Any participant may clear a wallpaper they no longer
-- want; this RPC only touches conversations the caller is part of.
CREATE OR REPLACE FUNCTION public.remove_conversation_wallpaper_by_url(wallpaper_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations c
     SET chat_wallpaper = NULL
   WHERE c.chat_wallpaper = wallpaper_url
     AND EXISTS (
       SELECT 1
       FROM public.conversation_participants cp
       WHERE cp.conversation_id = c.id AND cp.user_id = auth.uid()
     );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_conversation_wallpaper_by_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_conversation_wallpaper_by_url(text) TO authenticated;