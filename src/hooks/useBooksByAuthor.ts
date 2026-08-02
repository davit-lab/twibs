import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Book, BookAuthor } from './useBooks';

export interface AuthorWithBooks {
  author: BookAuthor & { user_id: string };
  books: Book[];
}

export function useBooksByAuthor() {
  const [authorGroups, setAuthorGroups] = useState<AuthorWithBooks[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch published books
      const { data: booksData, error } = await supabase
        .from('books')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique author IDs
      const authorIds = [...new Set(booksData?.map((b) => b.author_id) || [])];

      // Fetch author profiles
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', authorIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Fetch chapter counts
      const bookIds = booksData?.map((b) => b.id) || [];
      const { data: chapterCounts } = await supabase
        .from('chapters')
        .select('book_id')
        .in('book_id', bookIds);

      const chapterCountMap = new Map<string, number>();
      chapterCounts?.forEach((c) => {
        chapterCountMap.set(c.book_id, (chapterCountMap.get(c.book_id) || 0) + 1);
      });

      // Group books by author
      const authorBooksMap = new Map<string, Book[]>();
      
      (booksData || []).forEach((book) => {
        const authorProfile = profilesMap.get(book.author_id);
        const enrichedBook: Book = {
          ...book,
          author: authorProfile,
          chapter_count: chapterCountMap.get(book.id) || 0,
        };

        const existing = authorBooksMap.get(book.author_id) || [];
        existing.push(enrichedBook);
        authorBooksMap.set(book.author_id, existing);
      });

      // Convert to array of author groups
      const groups: AuthorWithBooks[] = [];
      authorBooksMap.forEach((books, authorId) => {
        const author = profilesMap.get(authorId);
        if (author) {
          groups.push({
            author: { ...author, user_id: authorId },
            books: books.sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
          });
        }
      });

      // Sort groups by total book count (descending)
      groups.sort((a, b) => b.books.length - a.books.length);

      setAuthorGroups(groups);
    } catch (error) {
      console.error('Error fetching books by author:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  return { authorGroups, isLoading, refetch: fetchBooks };
}
