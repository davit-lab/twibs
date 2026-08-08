-- All authenticated users can create interest posts.
-- The front-end premium gate was removed; the server-side INSERT policy must
-- match so posting no longer fails with an RLS violation for non-premium users.

DROP POLICY IF EXISTS "Premium users can create interest posts" ON public.interest_posts;

CREATE POLICY "Users can create interest posts"
ON public.interest_posts
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Ensure the interest-media storage bucket and its policies exist. The bucket
-- was created in an early migration that may not be present on some projects,
-- which would make media uploads fail with "Bucket not found".

INSERT INTO storage.buckets (id, name, public)
VALUES ('interest-media', 'interest-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view interest media" ON storage.objects;
CREATE POLICY "Anyone can view interest media"
ON storage.objects FOR SELECT
USING (bucket_id = 'interest-media');

DROP POLICY IF EXISTS "Users can upload their own interest media" ON storage.objects;
CREATE POLICY "Users can upload their own interest media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own interest media" ON storage.objects;
CREATE POLICY "Users can update their own interest media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete their own interest media" ON storage.objects;
CREATE POLICY "Users can delete their own interest media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'interest-media' AND (storage.foldername(name))[1] = auth.uid()::text);
