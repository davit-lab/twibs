import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useBook, useBookActions } from '@/hooks/useBooks';
import { useAuth } from '@/contexts/AuthContext';
import { useLogReading } from '@/hooks/useReadingStreak';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  BookOpen,
  CheckCircle2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChapterReader() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { book, chapters, progress } = useBook(bookId);
  const { updateProgress } = useBookActions();
  const logReading = useLogReading();
  const [tocOpen, setTocOpen] = useState(false);
  const hasLoggedReading = useRef(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const startTimeRef = useRef<number>(Date.now());

  const currentChapter = chapters.find((c) => c.id === chapterId);
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const completedChapters = progress?.completed_chapters || [];
  const isCompleted = chapterId ? completedChapters.includes(chapterId) : false;
  const progressPercent = chapters.length > 0 
    ? ((currentIndex + 1) / chapters.length) * 100 
    : 0;

  useEffect(() => {
    if (user && bookId && chapterId) {
      updateProgress(bookId, chapterId);
      startTimeRef.current = Date.now();
      
      if (!hasLoggedReading.current) {
        hasLoggedReading.current = true;
        logReading.mutate({ minutesRead: 1, chaptersRead: 0 });
      }
    }

    return () => {
      if (user && startTimeRef.current) {
        const minutesRead = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000));
        logReading.mutate({ minutesRead, chaptersRead: 0 });
      }
    };
  }, [user, bookId, chapterId, updateProgress]);
  
  useEffect(() => {
    hasLoggedReading.current = false;
  }, [chapterId]);

  const handleMarkComplete = useCallback(async () => {
    if (!bookId || !chapterId) return;
    await updateProgress(bookId, chapterId, undefined, chapterId);
    logReading.mutate({ minutesRead: 0, chaptersRead: 1 });
  }, [bookId, chapterId, updateProgress, logReading]);

  const fontSizeClass = fontSize === 'xlarge' ? 'text-xl' : fontSize === 'large' ? 'text-lg' : 'text-base';

  const handleNavigate = (chapter: typeof prevChapter) => {
    if (!chapter) return;
    navigate(`/library/book/${bookId}/read/${chapter.id}`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevChapter) {
        handleNavigate(prevChapter);
      } else if (e.key === 'ArrowRight' && nextChapter) {
        handleNavigate(nextChapter);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevChapter, nextChapter]);

  if (!currentChapter) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-5">
            <BookOpen className="h-10 w-10 text-primary/60" />
          </div>
          <h2 className="text-xl font-black mb-3">Chapter not found</h2>
          <Button asChild className="h-11 px-6 rounded-xl font-bold shadow-lg shadow-primary/20">
            <Link to={`/library/book/${bookId}`}>Back to Book</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-background via-background to-background/95 backdrop-blur-sm border-b border-border/60 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="rounded-xl">
              <Link to={`/library/book/${bookId}`}>
                <X className="h-5 w-5" />
              </Link>
            </Button>
            
            <Sheet open={tocOpen} onOpenChange={setTocOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="rounded-r-2xl border-r border-border/60">
                <SheetHeader>
                  <SheetTitle className="font-black">{book?.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-1.5">
                  {chapters.map((chapter, index) => {
                    const isComplete = completedChapters.includes(chapter.id);
                    const isCurrent = chapter.id === chapterId;

                    return (
                      <button
                        key={chapter.id}
                        onClick={() => {
                          navigate(`/library/book/${bookId}/read/${chapter.id}`);
                          setTocOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all duration-200",
                          isCurrent 
                            ? "bg-gradient-to-br from-primary to-primary/90 text-white shadow-lg shadow-primary/20" 
                            : "hover:bg-muted/50"
                        )}
                      >
                        <span className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0",
                          isComplete && !isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                            ? "bg-white/20 text-white"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="flex-1 truncate text-sm font-bold">{chapter.title}</span>
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex-1 text-center min-w-0">
            <h1 className="font-bold truncate text-sm">{currentChapter.title}</h1>
            <p className="text-xs text-muted-foreground font-medium">
              Chapter {currentIndex + 1} of {chapters.length} · {currentChapter.word_count.toLocaleString()} words
            </p>
          </div>

          <div className="flex items-center justify-end gap-1 bg-card border border-border/60 rounded-xl p-1 shadow-sm">
            {([
              { size: 'normal' as const, label: 'A', cls: 'text-xs' },
              { size: 'large' as const, label: 'A', cls: 'text-sm' },
              { size: 'xlarge' as const, label: 'A', cls: 'text-base' },
            ]).map(({ size, label, cls }) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={cn(
                  "w-8 h-8 rounded-lg font-bold transition-all duration-200",
                  cls,
                  fontSize === size ? "bg-gradient-to-br from-primary to-primary/80 text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 bg-muted/50">
          <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </Progress>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className="bg-card border border-border/60 rounded-2xl p-6 md:p-8 shadow-sm">
          <article className="prose prose-neutral dark:prose-invert max-w-none">
            <h1 className="text-2xl md:text-3xl font-black mb-8 tracking-tight">{currentChapter.title}</h1>
            <div className={cn("whitespace-pre-wrap leading-relaxed text-foreground/85", fontSizeClass)}>
              {currentChapter.content || (
                <p className="text-muted-foreground italic">This chapter has no content yet.</p>
              )}
            </div>
          </article>
        </div>

        {/* Chapter Actions */}
        <div className="mt-8 space-y-6">
          {user && !isCompleted && (
            <Button
              className="w-full h-12 rounded-2xl font-bold bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
              onClick={handleMarkComplete}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Mark as Complete
            </Button>
          )}

          {isCompleted && (
            <div className="text-center py-4 bg-card border border-border/60 rounded-2xl">
              <CheckCircle2 className="h-6 w-6 inline-block mr-2 text-emerald-500" />
              <span className="text-sm font-bold text-emerald-500">Chapter completed</span>
            </div>
          )}
        </div>
      </main>

      {/* Navigation Footer */}
      <footer className="sticky bottom-0 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-sm border-t border-border/60 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => handleNavigate(prevChapter)}
            disabled={!prevChapter}
            className="h-10 px-4 rounded-xl font-bold border-border/60 gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <span className="text-sm text-muted-foreground font-bold">
            {currentIndex + 1} / {chapters.length}
          </span>

          <Button
            variant="outline"
            onClick={() => handleNavigate(nextChapter)}
            disabled={!nextChapter}
            className="h-10 px-4 rounded-xl font-bold border-border/60 gap-2"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
