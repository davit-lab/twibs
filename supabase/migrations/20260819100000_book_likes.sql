CREATE TABLE public.book_likes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, book_id)
);

CREATE INDEX idx_book_likes_user ON public.book_likes(user_id);
CREATE INDEX idx_book_likes_book ON public.book_likes(book_id);

ALTER TABLE public.book_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Book likes are viewable by everyone" ON public.book_likes
FOR SELECT USING (true);

CREATE POLICY "Users can like books" ON public.book_likes
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike books" ON public.book_likes
FOR DELETE USING (auth.uid() = user_id);
