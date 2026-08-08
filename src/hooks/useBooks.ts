import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface BookAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface Book {
  id: string;
  author_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: 'draft' | 'published' | 'archived';
  genre: string | null;
  tags: string[] | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  price?: number;
  pdf_url?: string | null;
  is_free?: boolean;
  author?: BookAuthor;
  chapter_count?: number;
  is_in_library?: boolean;
}

export interface Chapter {
  id: string;
  book_id: string;
  title: string;
  content: string;
  position: number;
  word_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  current_chapter_id: string | null;
  scroll_position: number;
  completed_chapters: string[];
  last_read_at: string;
}

export function useBooks(filters?: { status?: string; genre?: string; authorId?: string }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status as 'draft' | 'published' | 'archived');
      }
      if (filters?.genre) {
        query = query.eq('genre', filters.genre);
      }
      if (filters?.authorId) {
        query = query.eq('author_id', filters.authorId);
      }

      const { data: booksData, error } = await query;
      if (error) throw error;

      // Fetch author profiles
      const authorIds = [...new Set(booksData?.map((b) => b.author_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', authorIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Fetch chapter counts
      const bookIds = booksData?.map((b) => b.id) || [];
      let chapterCounts: { book_id: string }[] | null = [];
      if (bookIds.length > 0) {
        const { data } = await supabase
          .from('chapters')
          .select('book_id')
          .in('book_id', bookIds);
        chapterCounts = data;
      }

      const chapterCountMap = new Map<string, number>();
      chapterCounts?.forEach((c) => {
        chapterCountMap.set(c.book_id, (chapterCountMap.get(c.book_id) || 0) + 1);
      });

      const enrichedBooks: Book[] = (booksData || []).map((book) => ({
        ...book,
        author: profilesMap.get(book.author_id),
        chapter_count: chapterCountMap.get(book.id) || 0,
      }));

      setBooks(enrichedBooks);
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters?.status, filters?.genre, filters?.authorId]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  return { books, isLoading, refetch: fetchBooks };
}

export function useBook(bookId: string | undefined) {
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [isInLibrary, setIsInLibrary] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBook = useCallback(async () => {
    if (!bookId) return;
    
    setIsLoading(true);
    try {
      // Fetch book
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .maybeSingle();

      if (bookError) throw bookError;
      if (!bookData) {
        setBook(null);
        return;
      }

      // Fetch author profile
      const { data: authorData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .eq('user_id', bookData.author_id)
        .maybeSingle();

      // Fetch chapters
      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .order('position', { ascending: true });

      setChapters(chaptersData || []);

      // Check if in user's library and fetch progress
      let isInLibrary = false;
      if (user) {
        const { data: libraryData } = await supabase
          .from('user_library')
          .select('id')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .maybeSingle();

        isInLibrary = !!libraryData;
        setIsInLibrary(isInLibrary);

        const { data: progressData } = await supabase
          .from('reading_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .maybeSingle();

        setProgress(progressData);
      }

      setBook({
        ...bookData,
        author: authorData || undefined,
        chapter_count: chaptersData?.length || 0,
        is_in_library: isInLibrary,
      });
    } catch (error) {
      console.error('Error fetching book:', error);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, user]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  return { book, chapters, progress, isInLibrary, isLoading, refetch: fetchBook, setIsInLibrary };
}

export function useMyBooks() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMyBooks = useCallback(async () => {
    if (!user) {
      setBooks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('author_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Fetch chapter counts
      const bookIds = data?.map((b) => b.id) || [];
      const { data: chapterCounts } = await supabase
        .from('chapters')
        .select('book_id')
        .in('book_id', bookIds);

      const chapterCountMap = new Map<string, number>();
      chapterCounts?.forEach((c) => {
        chapterCountMap.set(c.book_id, (chapterCountMap.get(c.book_id) || 0) + 1);
      });

      setBooks((data || []).map((book) => ({
        ...book,
        chapter_count: chapterCountMap.get(book.id) || 0,
      })));
    } catch (error) {
      console.error('Error fetching my books:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyBooks();
  }, [fetchMyBooks]);

  return { books, isLoading, refetch: fetchMyBooks };
}

export interface LibraryBookWithProgress extends Book {
  progress?: ReadingProgress;
  current_chapter_title?: string;
  total_chapters: number;
  completed_count: number;
}

export function useUserLibrary() {
  const { user } = useAuth();
  const [books, setBooks] = useState<LibraryBookWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLibrary = useCallback(async () => {
    if (!user) {
      setBooks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch user's library entries
      const { data: libraryData, error: libraryError } = await supabase
        .from('user_library')
        .select('book_id, added_at')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      if (libraryError) throw libraryError;
      if (!libraryData || libraryData.length === 0) {
        setBooks([]);
        setIsLoading(false);
        return;
      }

      const bookIds = libraryData.map((l) => l.book_id);

      // Fetch books
      const { data: booksData, error: booksError } = await supabase
        .from('books')
        .select('*')
        .in('id', bookIds);

      if (booksError) throw booksError;

      // Fetch author profiles
      const authorIds = [...new Set(booksData?.map((b) => b.author_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', authorIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Fetch reading progress
      const { data: progressData } = await supabase
        .from('reading_progress')
        .select('*')
        .eq('user_id', user.id)
        .in('book_id', bookIds);

      const progressMap = new Map(
        progressData?.map((p) => [p.book_id, p]) || []
      );

      // Fetch chapters for all books
      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('id, book_id, title, position')
        .in('book_id', bookIds)
        .order('position', { ascending: true });

      // Build chapter maps
      const chapterCountMap = new Map<string, number>();
      const chapterTitleMap = new Map<string, string>();
      
      chaptersData?.forEach((c) => {
        chapterCountMap.set(c.book_id, (chapterCountMap.get(c.book_id) || 0) + 1);
        chapterTitleMap.set(c.id, c.title);
      });

      // Build enriched books with progress
      const enrichedBooks: LibraryBookWithProgress[] = (booksData || []).map((book) => {
        const progress = progressMap.get(book.id);
        const currentChapterTitle = progress?.current_chapter_id 
          ? chapterTitleMap.get(progress.current_chapter_id)
          : undefined;

        return {
          ...book,
          author: profilesMap.get(book.author_id),
          chapter_count: chapterCountMap.get(book.id) || 0,
          progress: progress || undefined,
          current_chapter_title: currentChapterTitle,
          total_chapters: chapterCountMap.get(book.id) || 0,
          completed_count: progress?.completed_chapters?.length || 0,
        };
      });

      // Sort by last read (most recent first), then by added date
      enrichedBooks.sort((a, b) => {
        const aLastRead = a.progress?.last_read_at ? new Date(a.progress.last_read_at).getTime() : 0;
        const bLastRead = b.progress?.last_read_at ? new Date(b.progress.last_read_at).getTime() : 0;
        return bLastRead - aLastRead;
      });

      setBooks(enrichedBooks);
    } catch (error) {
      console.error('Error fetching user library:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  return { books, isLoading, refetch: fetchLibrary };
}

export function useBookActions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const createBook = useCallback(async (title: string, description?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('books')
        .insert({
          author_id: user.id,
          title,
          description,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Book created', description: 'Start adding chapters!' });
      return data;
    } catch (error: any) {
      console.error('Error creating book:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create book',
      });
      return null;
    }
  }, [user, toast]);

  const updateBook = useCallback(async (bookId: string, updates: Partial<Book>) => {
    try {
      const { error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId);

      if (error) throw error;

      toast({ title: 'Book updated' });
      return true;
    } catch (error: any) {
      console.error('Error updating book:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update book',
      });
      return false;
    }
  }, [toast]);

  const publishBook = useCallback(async (bookId: string) => {
    try {
      const { error } = await supabase
        .from('books')
        .update({ 
          status: 'published' as const, 
          published_at: new Date().toISOString() 
        })
        .eq('id', bookId);

      if (error) throw error;

      toast({ title: 'Book published!', description: 'Your book is now live.' });
      return true;
    } catch (error: any) {
      console.error('Error publishing book:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to publish book',
      });
      return false;
    }
  }, [toast]);

  const deleteBook = useCallback(async (bookId: string) => {
    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (error) throw error;

      toast({ title: 'Book deleted' });
      return true;
    } catch (error: any) {
      console.error('Error deleting book:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete book',
      });
      return false;
    }
  }, [toast]);

  const addToLibrary = useCallback(async (bookId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_library')
        .insert({ user_id: user.id, book_id: bookId });

      if (error) throw error;

      toast({ title: 'Added to library' });
      return true;
    } catch (error: any) {
      console.error('Error adding to library:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add to library',
      });
      return false;
    }
  }, [user, toast]);

  const removeFromLibrary = useCallback(async (bookId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_library')
        .delete()
        .eq('user_id', user.id)
        .eq('book_id', bookId);

      if (error) throw error;

      toast({ title: 'Removed from library' });
      return true;
    } catch (error: any) {
      console.error('Error removing from library:', error);
      return false;
    }
  }, [user, toast]);

  const updateProgress = useCallback(async (
    bookId: string,
    chapterId: string | null,
    scrollPosition?: number,
    completedChapterId?: string
  ) => {
    if (!user) return;

    try {
      const { data: existing } = await supabase
        .from('reading_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .maybeSingle();

      const completedChapters = existing?.completed_chapters || [];
      if (completedChapterId && !completedChapters.includes(completedChapterId)) {
        completedChapters.push(completedChapterId);
      }

      if (existing) {
        await supabase
          .from('reading_progress')
          .update({
            current_chapter_id: chapterId,
            scroll_position: scrollPosition ?? existing.scroll_position,
            completed_chapters: completedChapters,
            last_read_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('reading_progress')
          .insert({
            user_id: user.id,
            book_id: bookId,
            current_chapter_id: chapterId,
            scroll_position: scrollPosition ?? 0,
            completed_chapters: completedChapters,
          });
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }, [user]);

  return useMemo(() => ({
    createBook,
    updateBook,
    publishBook,
    deleteBook,
    addToLibrary,
    removeFromLibrary,
    updateProgress,
  }), [
    createBook,
    updateBook,
    publishBook,
    deleteBook,
    addToLibrary,
    removeFromLibrary,
    updateProgress,
  ]);
}

export function useChapterActions() {
  const { toast } = useToast();

  const createChapter = async (bookId: string, title: string, position: number) => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .insert({
          book_id: bookId,
          title,
          position,
          content: '',
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error: any) {
      console.error('Error creating chapter:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create chapter',
      });
      return null;
    }
  };

  const updateChapter = async (chapterId: string, updates: Partial<Chapter>) => {
    try {
      const wordCount = updates.content ? updates.content.split(/\s+/).filter(Boolean).length : undefined;
      
      const { error } = await supabase
        .from('chapters')
        .update({
          ...updates,
          ...(wordCount !== undefined && { word_count: wordCount }),
        })
        .eq('id', chapterId);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating chapter:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save chapter',
      });
      return false;
    }
  };

  const deleteChapter = async (chapterId: string) => {
    try {
      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;

      toast({ title: 'Chapter deleted' });
      return true;
    } catch (error: any) {
      console.error('Error deleting chapter:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete chapter',
      });
      return false;
    }
  };

  return { createChapter, updateChapter, deleteChapter };
}
