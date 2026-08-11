-- Add missing storage RLS policies for the group-media bucket.
-- Uploads were failing with 400 because no storage.objects policies existed.

INSERT INTO storage.buckets (id, name, public)
VALUES ('group-media', 'group-media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view group media (bucket is public, but explicit for API listing)
DROP POLICY IF EXISTS "Anyone can view group media" ON storage.objects;
CREATE POLICY "Anyone can view group media"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-media');

-- Authenticated users can upload their own group media
DROP POLICY IF EXISTS "Users can upload their own group media" ON storage.objects;
CREATE POLICY "Users can upload their own group media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can update their own group media
DROP POLICY IF EXISTS "Users can update their own group media" ON storage.objects;
CREATE POLICY "Users can update their own group media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own group media
DROP POLICY IF EXISTS "Users can delete their own group media" ON storage.objects;
CREATE POLICY "Users can delete their own group media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'group-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Verify
SELECT policyname, tablename
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
AND policyname LIKE '%group media%'
ORDER BY policyname;
