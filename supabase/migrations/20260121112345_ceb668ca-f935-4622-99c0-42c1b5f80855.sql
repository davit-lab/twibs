-- Create reels table for short-form video content
CREATE TABLE public.reels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  audio_name TEXT,
  audio_url TEXT,
  duration INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reel_likes table
CREATE TABLE public.reel_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

-- Create reel_comments table
CREATE TABLE public.reel_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_preferences table for settings
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Appearance
  theme TEXT DEFAULT 'system',
  font_size TEXT DEFAULT 'medium',
  display_density TEXT DEFAULT 'comfortable',
  color_accent TEXT DEFAULT 'purple',
  -- Content & Feed
  autoplay_videos BOOLEAN DEFAULT true,
  content_filter TEXT DEFAULT 'standard',
  language TEXT DEFAULT 'en',
  show_sensitive_content BOOLEAN DEFAULT false,
  -- Accessibility
  reduced_motion BOOLEAN DEFAULT false,
  high_contrast BOOLEAN DEFAULT false,
  screen_reader_optimized BOOLEAN DEFAULT false,
  -- Security
  two_factor_enabled BOOLEAN DEFAULT false,
  login_alerts BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create login_sessions table for security
CREATE TABLE public.login_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_name TEXT,
  device_type TEXT,
  location TEXT,
  ip_address TEXT,
  is_current BOOLEAN DEFAULT false,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

-- Reels policies
CREATE POLICY "Anyone can view published reels" ON public.reels FOR SELECT USING (is_published = true OR user_id = auth.uid());
CREATE POLICY "Users can create reels" ON public.reels FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their reels" ON public.reels FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their reels" ON public.reels FOR DELETE USING (user_id = auth.uid() OR is_admin_or_moderator());

-- Reel likes policies
CREATE POLICY "Anyone can view likes" ON public.reel_likes FOR SELECT USING (true);
CREATE POLICY "Users can like reels" ON public.reel_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unlike reels" ON public.reel_likes FOR DELETE USING (user_id = auth.uid());

-- Reel comments policies
CREATE POLICY "Anyone can view comments" ON public.reel_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment" ON public.reel_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can edit their comments" ON public.reel_comments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their comments" ON public.reel_comments FOR DELETE USING (user_id = auth.uid() OR is_admin_or_moderator());

-- User preferences policies
CREATE POLICY "Users can view their preferences" ON public.user_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their preferences" ON public.user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their preferences" ON public.user_preferences FOR UPDATE USING (user_id = auth.uid());

-- Login sessions policies
CREATE POLICY "Users can view their sessions" ON public.login_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can create sessions" ON public.login_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete their sessions" ON public.login_sessions FOR DELETE USING (user_id = auth.uid());

-- Create storage bucket for reels
INSERT INTO storage.buckets (id, name, public) VALUES ('reels', 'reels', true);

-- Storage policies for reels
CREATE POLICY "Anyone can view reels" ON storage.objects FOR SELECT USING (bucket_id = 'reels');
CREATE POLICY "Users can upload reels" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their reels" ON storage.objects FOR DELETE USING (bucket_id = 'reels' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Triggers for like/comment counts
CREATE OR REPLACE FUNCTION public.update_reel_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET like_count = like_count + 1 WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET like_count = like_count - 1 WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_reel_likes_trigger
AFTER INSERT OR DELETE ON public.reel_likes
FOR EACH ROW EXECUTE FUNCTION public.update_reel_like_count();

CREATE OR REPLACE FUNCTION public.update_reel_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET comment_count = comment_count + 1 WHERE id = NEW.reel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET comment_count = comment_count - 1 WHERE id = OLD.reel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_reel_comments_trigger
AFTER INSERT OR DELETE ON public.reel_comments
FOR EACH ROW EXECUTE FUNCTION public.update_reel_comment_count();

-- Enable realtime for reels
ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;