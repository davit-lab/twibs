-- Create storage bucket for interest post media
INSERT INTO storage.buckets (id, name, public)
VALUES ('interest-media', 'interest-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view interest post media
CREATE POLICY "Anyone can view interest media"
ON storage.objects FOR SELECT
USING (bucket_id = 'interest-media');

-- Allow authenticated users to upload their own interest media
CREATE POLICY "Users can upload their own interest media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to update their own interest media
CREATE POLICY "Users can update their own interest media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own interest media
CREATE POLICY "Users can delete their own interest media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);