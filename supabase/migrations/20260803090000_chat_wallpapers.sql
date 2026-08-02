-- Chat wallpapers: per-user chat background setting
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS chat_wallpaper TEXT;

-- Verification: uncomment and run after applying
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'chat_wallpaper';
