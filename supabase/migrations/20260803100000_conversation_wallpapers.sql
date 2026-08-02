-- Chat wallpapers: shared, per-conversation wallpaper visible to all participants

-- Personal default wallpaper (also applied by the app when a conversation has no shared one)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS chat_wallpaper TEXT;

-- Shared wallpaper stored on the conversation so every participant sees it
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS chat_wallpaper TEXT;

-- Any participant may set the shared wallpaper for a conversation.
-- SECURITY DEFINER so members can update just this column without a broad UPDATE policy.
CREATE OR REPLACE FUNCTION public.set_conversation_wallpaper(conv_id uuid, wallpaper text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  UPDATE public.conversations
  SET chat_wallpaper = NULLIF(wallpaper, '')
  WHERE id = conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_conversation_wallpaper(uuid, text) TO authenticated;

-- Broadcast conversation changes (incl. wallpaper updates) to all participants in realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- Verification: uncomment and run after applying
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'chat_wallpaper';
