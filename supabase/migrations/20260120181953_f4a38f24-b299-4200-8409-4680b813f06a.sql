-- Create book status enum
CREATE TYPE public.book_status AS ENUM ('draft', 'published', 'archived');

-- Create books table
CREATE TABLE public.books (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    status book_status NOT NULL DEFAULT 'draft',
    genre TEXT,
    tags TEXT[],
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    published_at TIMESTAMP WITH TIME ZONE
);

-- Create chapters table
CREATE TABLE public.chapters (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reading progress table
CREATE TABLE public.reading_progress (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    current_chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    scroll_position FLOAT DEFAULT 0,
    completed_chapters UUID[] DEFAULT '{}',
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, book_id)
);

-- Create book favorites/library
CREATE TABLE public.user_library (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, book_id)
);

-- Indexes
CREATE INDEX idx_books_author ON public.books(author_id);
CREATE INDEX idx_books_status ON public.books(status);
CREATE INDEX idx_chapters_book ON public.chapters(book_id);
CREATE INDEX idx_chapters_position ON public.chapters(book_id, position);
CREATE INDEX idx_reading_progress_user ON public.reading_progress(user_id);
CREATE INDEX idx_user_library_user ON public.user_library(user_id);

-- Enable RLS
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is verified
CREATE OR REPLACE FUNCTION public.is_verified_author(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = _user_id AND is_verified = true
    )
$$;

-- Books RLS policies
CREATE POLICY "Published books are viewable by everyone" ON public.books
FOR SELECT USING (status = 'published' OR author_id = auth.uid() OR public.is_admin_or_moderator());

CREATE POLICY "Verified users can create books" ON public.books
FOR INSERT WITH CHECK (author_id = auth.uid() AND public.is_verified_author(auth.uid()));

CREATE POLICY "Authors can update their books" ON public.books
FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their books" ON public.books
FOR DELETE USING (author_id = auth.uid() OR public.is_admin_or_moderator());

-- Chapters RLS policies
CREATE POLICY "Chapters of published books are viewable" ON public.chapters
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.books 
        WHERE books.id = chapters.book_id 
        AND (books.status = 'published' OR books.author_id = auth.uid())
    )
);

CREATE POLICY "Authors can create chapters" ON public.chapters
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.books 
        WHERE books.id = book_id AND books.author_id = auth.uid()
    )
);

CREATE POLICY "Authors can update chapters" ON public.chapters
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.books 
        WHERE books.id = chapters.book_id AND books.author_id = auth.uid()
    )
);

CREATE POLICY "Authors can delete chapters" ON public.chapters
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.books 
        WHERE books.id = chapters.book_id AND books.author_id = auth.uid()
    )
);

-- Reading progress RLS policies
CREATE POLICY "Users can view their reading progress" ON public.reading_progress
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create reading progress" ON public.reading_progress
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their reading progress" ON public.reading_progress
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their reading progress" ON public.reading_progress
FOR DELETE USING (user_id = auth.uid());

-- User library RLS policies
CREATE POLICY "Users can view their library" ON public.user_library
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add to their library" ON public.user_library
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove from their library" ON public.user_library
FOR DELETE USING (user_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_books_updated_at
BEFORE UPDATE ON public.books
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at
BEFORE UPDATE ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for book covers
INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true);

-- Storage policies for book covers
CREATE POLICY "Book covers are publicly accessible" ON storage.objects
FOR SELECT USING (bucket_id = 'book-covers');

CREATE POLICY "Verified authors can upload covers" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'book-covers' AND public.is_verified_author(auth.uid()));

CREATE POLICY "Authors can update their covers" ON storage.objects
FOR UPDATE USING (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authors can delete their covers" ON storage.objects
FOR DELETE USING (bucket_id = 'book-covers' AND auth.uid()::text = (storage.foldername(name))[1]);