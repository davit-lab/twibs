-- Create storage bucket for book PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('book-pdfs', 'book-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy to allow authenticated users to upload their own PDFs
CREATE POLICY "Users can upload their own book PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'book-pdfs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS policy to allow users to view PDFs of published books or their own
CREATE POLICY "Users can view book PDFs they have access to"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'book-pdfs'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.books 
      WHERE books.pdf_url LIKE '%' || storage.objects.name || '%'
      AND (books.status = 'published' OR books.author_id = auth.uid())
    )
  )
);

-- RLS policy to allow users to delete their own PDFs
CREATE POLICY "Users can delete their own book PDFs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'book-pdfs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);