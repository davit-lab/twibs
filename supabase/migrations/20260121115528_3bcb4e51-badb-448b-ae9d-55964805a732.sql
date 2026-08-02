-- Create music storage bucket for user-uploaded music tracks
INSERT INTO storage.buckets (id, name, public)
VALUES ('reel-music', 'reel-music', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for music bucket
CREATE POLICY "Anyone can view music tracks"
ON storage.objects FOR SELECT
USING (bucket_id = 'reel-music');

CREATE POLICY "Authenticated users can upload music"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reel-music' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own music"
ON storage.objects FOR DELETE
USING (bucket_id = 'reel-music' AND auth.uid()::text = (storage.foldername(name))[1]);