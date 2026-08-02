-- Remove per-user chat wallpaper: wallpapers are now shared per conversation only
ALTER TABLE public.user_preferences
  DROP COLUMN IF EXISTS chat_wallpaper;
