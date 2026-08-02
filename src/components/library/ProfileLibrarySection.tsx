import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Library } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LibraryBook {
  id: string;
  title: string;
  cover_url: string | null;
  total_chapters: number;
  completed_chapters: number;
  progress_percent: number;
}

interface ProfileLibrarySectionProps {
  userId: string;
  isOwnProfile?: boolean;
}

export default function ProfileLibrarySection({ userId, isOwnProfile }: ProfileLibrarySectionProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLibrary = async () => {
      if (!userId) return;
      
      try {
        // Fetch user's library with book details
        const { data: libraryData, error: libraryError } = await supabase
          .from('user_library')
          .select(`
            book_id,
            books!inner (
              id,
              title,
              cover_url,
              status
            )
          `)
          .eq('user_id', userId);

        if (libraryError) throw libraryError;

        if (!libraryData || libraryData.length === 0) {
          setBooks([]);
          setLoading(false);
          return;
        }

        // Get chapter counts and reading progress for each book
        const booksWithProgress = await Promise.all(
          libraryData.map(async (item: any) => {
            const book = item.books;
            
            // Get total chapters
            const { count: totalChapters } = await supabase
              .from('chapters')
              .select('*', { count: 'exact', head: true })
              .eq('book_id', book.id)
              .eq('is_published', true);

            // Get reading progress
            const { data: progressData } = await supabase
              .from('reading_progress')
              .select('completed_chapters')
              .eq('user_id', userId)
              .eq('book_id', book.id)
              .single();

            const completedCount = progressData?.completed_chapters?.length || 0;
            const total = totalChapters || 1;
            const progressPercent = Math.round((completedCount / total) * 100);

            return {
              id: book.id,
              title: book.title,
              cover_url: book.cover_url,
              total_chapters: total,
              completed_chapters: completedCount,
              progress_percent: progressPercent,
            };
          })
        );

        setBooks(booksWithProgress);
      } catch (error) {
        console.error('Error fetching library:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, [userId]);

  if (loading) {
    return (
      <div className="border border-border rounded-xl mx-4 mt-4 rounded-xl border border-border/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] rounded-lg" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="border border-border rounded-xl mx-4 mt-4 rounded-xl border border-border/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Library className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">My Library</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            {isOwnProfile ? "You haven't added any books yet" : "No books in library yet"}
          </p>
          {isOwnProfile && (
            <Link 
              to="/library" 
              className="mt-3 text-primary text-sm font-medium hover:underline"
            >
              Browse Library
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl mx-4 mt-4 rounded-xl border border-border/50">
      <div className="p-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">My Library</h2>
          </div>
          <span className="text-sm text-muted-foreground">{books.length} books</span>
        </div>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {books.slice(0, 10).map((book) => (
            <Link 
              key={book.id} 
              to={`/library/book/${book.id}`}
              className="group"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm transition-transform duration-200 group-hover:scale-105 group-hover:shadow-md">
                {book.cover_url ? (
                  <img 
                    src={book.cover_url} 
                    alt={book.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                
                {/* Progress overlay */}
                {book.progress_percent > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <Progress 
                      value={book.progress_percent} 
                      className="h-1"
                    />
                    <span className="text-[10px] text-white/80 mt-1 block">
                      {book.progress_percent}%
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
                {book.title}
              </p>
            </Link>
          ))}
        </div>

        {books.length > 10 && (
          <Link 
            to="/library" 
            className="block mt-4 text-center text-sm text-primary font-medium hover:underline"
          >
            View all {books.length} books
          </Link>
        )}
      </div>
    </div>
  );
}
