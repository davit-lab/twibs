import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Library } from 'lucide-react';

interface LibraryBook {
  id: string;
  title: string;
  cover_url: string | null;
  author_name: string;
  total_chapters: number;
  completed_chapters: number;
  progress_percent: number;
}

interface LibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  isOwnProfile?: boolean;
}

export default function LibraryModal({
  open,
  onOpenChange,
  userId,
  username,
  isOwnProfile,
}: LibraryModalProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;

    const fetchLibrary = async () => {
      setLoading(true);
      
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
              author_id
            )
          `)
          .eq('user_id', userId);

        if (libraryError) throw libraryError;

        if (!libraryData || libraryData.length === 0) {
          setBooks([]);
          setLoading(false);
          return;
        }

        // Get chapter counts, reading progress, and author info for each book
        const booksWithProgress = await Promise.all(
          libraryData.map(async (item: any) => {
            const book = item.books;
            
            // Get author profile
            const { data: authorProfile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('user_id', book.author_id)
              .single();

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
              author_name: authorProfile?.display_name || 'Unknown Author',
              total_chapters: total,
              completed_chapters: completedCount,
              progress_percent: progressPercent,
            };
          })
        );

        setBooks(booksWithProgress);
      } catch (error) {
        console.error('Error fetching library:', error);
        setBooks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Library
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] -mx-6 px-6">
          {loading ? (
            <div className="space-y-4 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-12 h-16 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <BookOpen className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                {isOwnProfile 
                  ? "You haven't added any books yet"
                  : `@${username} hasn't added any books yet`
                }
              </p>
              {isOwnProfile && (
                <Link 
                  to="/library" 
                  onClick={() => onOpenChange(false)}
                  className="mt-3 inline-block text-primary text-sm font-medium hover:underline"
                >
                  Browse Library
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {books.map((book) => (
                <Link
                  key={book.id}
                  to={`/library/book/${book.id}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-12 h-16 rounded-md overflow-hidden bg-muted shrink-0">
                    {book.cover_url ? (
                      <img 
                        src={book.cover_url} 
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{book.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      by {book.author_name}
                    </p>
                    {book.progress_percent > 0 && (
                      <div className="mt-1.5">
                        <Progress value={book.progress_percent} className="h-1.5" />
                        <span className="text-xs text-muted-foreground mt-0.5 block">
                          {book.progress_percent}% complete
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}