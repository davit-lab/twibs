-- Create interest_categories table with predefined categories
CREATE TABLE public.interest_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interest_categories ENABLE ROW LEVEL SECURITY;

-- Allow public read access to categories
CREATE POLICY "Anyone can view interest categories"
ON public.interest_categories FOR SELECT
TO public
USING (true);

-- Create user_interests table to store user selections
CREATE TABLE public.user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.interest_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, category_id)
);

-- Enable RLS
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

-- Users can view their own interests
CREATE POLICY "Users can view their own interests"
ON public.user_interests FOR SELECT
USING (user_id = auth.uid());

-- Users can add their own interests
CREATE POLICY "Users can add their own interests"
ON public.user_interests FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can remove their own interests
CREATE POLICY "Users can remove their own interests"
ON public.user_interests FOR DELETE
USING (user_id = auth.uid());

-- Seed default categories
INSERT INTO public.interest_categories (name, icon, color) VALUES
  ('Technology', 'laptop', '#3B82F6'),
  ('Art & Design', 'palette', '#EC4899'),
  ('Music', 'music', '#8B5CF6'),
  ('Sports', 'trophy', '#22C55E'),
  ('Gaming', 'gamepad-2', '#F59E0B'),
  ('Travel', 'plane', '#06B6D4'),
  ('Food', 'utensils', '#EF4444'),
  ('Fashion', 'shirt', '#A855F7'),
  ('Books', 'book-open', '#6366F1'),
  ('Movies & TV', 'clapperboard', '#F97316'),
  ('Fitness', 'dumbbell', '#14B8A6'),
  ('Photography', 'camera', '#84CC16'),
  ('Business', 'briefcase', '#64748B'),
  ('Science', 'flask-conical', '#0EA5E9'),
  ('Nature', 'leaf', '#22C55E');

-- Create index for faster lookups
CREATE INDEX idx_user_interests_user_id ON public.user_interests(user_id);
CREATE INDEX idx_user_interests_category_id ON public.user_interests(category_id);