-- Chat message bubble color customisation (per-user)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS message_bubble_color TEXT DEFAULT 'purple';
