-- Add music support to stories
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS music_url TEXT,
  ADD COLUMN IF NOT EXISTS music_name TEXT;
