import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  cover_i?: number;
  first_publish_year?: number;
  language?: string[];
  ebook_access?: string;
  has_fulltext?: boolean;
  edition_key?: string[];
  publisher?: string[];
  subject?: string[];
  download_count?: number;
}

export interface OpenLibraryAuthor {
  name: string;
  bio?: string | { value: string };
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  wikipedia?: string;
}

const COVER_BASE = 'https://covers.openlibrary.org/b';

function getCoverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVER_BASE}/id/${coverId}-${size}.jpg`;
}

function getAuthorCoverUrl(photoId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVER_BASE}/a/id/${photoId}-${size}.jpg`;
}

export function useOpenLibrary() {
  const { user } = useAuth();
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchPdfUrl = useCallback(async (bookKey: string, editionKeys?: string[]): Promise<string | null> => {
    try {
      const editionsRes = await fetch(
        `https://openlibrary.org${bookKey}/editions.json?limit=10`
      );
      if (!editionsRes.ok) return null;

      const editionsData = await editionsRes.json();
      const editions = editionsData.entries || [];

      const publicEdition = editions.find(
        (e: Record<string, unknown>) =>
          e.ebook_access === 'public' || e.ebook_access === 'borrowable'
      );

      if (publicEdition?.ia) {
        return `https://archive.org/download/${publicEdition.ia}/${publicEdition.ia}.pdf`;
      }

      const anyIaEdition = editions.find((e: Record<string, unknown>) => e.ia);
      if (anyIaEdition?.ia) {
        return `https://archive.org/download/${anyIaEdition.ia}/${anyIaEdition.ia}.pdf`;
      }

      if (editionKeys?.length) {
        return `https://archive.org/download/isbn_${editionKeys[0]}/isbn_${editionKeys[0]}.pdf`;
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,author_key,cover_i,first_publish_year,language,ebook_access,has_fulltext,edition_key,publisher,subject,download_count`
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.docs || []);
      } catch (error) {
        console.error('Open Library search error:', error);
        toast({
          variant: 'destructive',
          title: 'Search failed',
          description: 'Could not search Open Library. Try again.',
        });
      } finally {
        setIsLoading(false);
      }
    }, 400);
  }, []);

  const fetchAuthor = useCallback(async (authorKey: string): Promise<OpenLibraryAuthor | null> => {
    try {
      const res = await fetch(`https://openlibrary.org${authorKey}.json`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const importBook = useCallback(async (book: OpenLibraryBook): Promise<boolean> => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Sign in required',
        description: 'You need to be signed in to import books.',
      });
      return false;
    }

    setIsImporting(true);
    try {
      const coverUrl = book.cover_i ? getCoverUrl(book.cover_i) : null;
      const authorName = book.author_name?.[0] || 'Unknown Author';
      const authorBio = book.author_key?.[0] ? await fetchAuthor(book.author_key[0]) : null;

      const bioText = authorBio?.bio
        ? typeof authorBio.bio === 'string'
          ? authorBio.bio
          : authorBio.bio.value
        : null;

      const descriptionParts: string[] = [];
      if (book.first_publish_year) {
        descriptionParts.push(`First published: ${book.first_publish_year}`);
      }
      if (book.publisher?.length) {
        descriptionParts.push(`Publisher: ${book.publisher.slice(0, 3).join(', ')}`);
      }
      if (book.subject?.length) {
        descriptionParts.push(`Subjects: ${book.subject.slice(0, 5).join(', ')}`);
      }

      const { data: existingBook } = await supabase
        .from('books')
        .select('id')
        .eq('title', book.title)
        .eq('author_id', user.id)
        .maybeSingle();

      if (existingBook) {
        toast({
          title: 'Already imported',
          description: `"${book.title}" is already in your books.`,
        });
        return false;
      }

      const { data, error } = await supabase
        .from('books')
        .insert({
          author_id: user.id,
          title: book.title,
          description: descriptionParts.join('\n\n') || null,
          cover_url: coverUrl,
          genre: book.subject?.[0] || null,
          tags: [...(book.subject?.slice(0, 4) || []), `ol:${book.key.replace('/works/', '')}`],
          status: 'published',
          is_free: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-add to user's library so it shows in My Library / profile
      if (data) {
        const { error: libError } = await supabase
          .from('user_library')
          .insert({ user_id: user.id, book_id: data.id });
        if (libError) {
          console.error('Failed to add imported book to library:', libError);
          // Try once more — RLS may have been slow to propagate
          await new Promise((r) => setTimeout(r, 500));
          const { error: retryError } = await supabase
            .from('user_library')
            .insert({ user_id: user.id, book_id: data.id });
          if (retryError) {
            console.error('Retry also failed:', retryError);
            toast({
              variant: 'destructive',
              title: 'Imported but not in library',
              description: 'Book was created but could not be added to your library. Try saving it from the book page.',
            });
          }
        }
      }

      if (book.has_fulltext && data) {
        const editionsRes = await fetch(
          `https://openlibrary.org${book.key}/editions.json?limit=10`
        );
        if (editionsRes.ok) {
          const editionsData = await editionsRes.json();
          const editions = editionsData.entries || [];

          // Try to find an edition with a downloadable IA item
          const publicEdition = editions.find(
            (e: Record<string, unknown>) =>
              e.ebook_access === 'public' || e.ebook_access === 'borrowable'
          );

          let downloadUrl: string | null = null;

          if (publicEdition?.ia) {
            const iaId = publicEdition.ia as string;
            downloadUrl = `https://archive.org/download/${iaId}/${iaId}.pdf`;
          } else {
            // Fallback: try any edition with an ia identifier
            const anyIaEdition = editions.find((e: Record<string, unknown>) => e.ia);
            if (anyIaEdition?.ia) {
              const iaId = anyIaEdition.ia as string;
              downloadUrl = `https://archive.org/download/${iaId}/${iaId}.pdf`;
            }
          }

          // Fallback: try edition_key from search results
          if (!downloadUrl && book.edition_key?.length) {
            const firstEdition = book.edition_key[0];
            downloadUrl = `https://archive.org/download/isbn_${firstEdition}/isbn_${firstEdition}.pdf`;
          }

          if (downloadUrl) {
            await supabase
              .from('books')
              .update({ pdf_url: downloadUrl })
              .eq('id', data.id);
          }
        }
      }

      toast({
        title: 'Book imported!',
        description: `"${book.title}" has been added to your library.`,
      });
      return true;
    } catch (error) {
      console.error('Import error:', error);
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import book from Open Library.',
      });
      return false;
    } finally {
      setIsImporting(false);
    }
  }, [user, fetchAuthor]);

  const clearResults = useCallback(() => setResults([]), []);

  return {
    results,
    isLoading,
    isImporting,
    search,
    importBook,
    fetchPdfUrl,
    clearResults,
    getCoverUrl,
    getAuthorCoverUrl,
  };
}
