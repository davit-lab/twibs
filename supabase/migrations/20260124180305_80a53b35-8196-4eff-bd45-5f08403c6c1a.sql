-- Add storage policies for book-covers bucket
-- Allow authenticated users to upload covers to their own folder
CREATE POLICY "Users can upload book covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-covers' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own covers
CREATE POLICY "Users can update their book covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'book-covers' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'book-covers' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own covers
CREATE POLICY "Users can delete their book covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-covers' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to book covers
CREATE POLICY "Book covers are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'book-covers');

-- Also add policies for book-pdfs bucket
CREATE POLICY "Users can upload book PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their book PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'book-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'book-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their book PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- PDFs can be accessed by those who own the book (purchased or are the author)
CREATE POLICY "Book PDFs viewable by owners"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'book-pdfs'
);