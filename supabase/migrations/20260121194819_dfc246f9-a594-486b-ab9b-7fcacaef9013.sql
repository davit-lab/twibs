-- Add price column to books table for paid books
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT 0;

-- Add PDF URL column for uploaded PDF books
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Add is_free boolean for quick filtering
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT true;

-- Create index for price queries
CREATE INDEX IF NOT EXISTS idx_books_price ON public.books(price);
CREATE INDEX IF NOT EXISTS idx_books_is_free ON public.books(is_free);