import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useBook, useBookActions } from '@/hooks/useBooks';
import { useAuth } from '@/contexts/AuthContext';
import { useLogReading } from '@/hooks/useReadingStreak';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { BookAI } from '@/components/bookai/BookAI';
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
  Settings2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type ReaderTheme = 'dark' | 'light' | 'sepia';
type ReaderLineHeight = 'compact' | 'relaxed' | 'loose';

const READER_SETTINGS_KEY = 'twibs:reader:settings';

function loadReaderSettings() {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return { theme: 'dark' as ReaderTheme, lineHeight: 'relaxed' as ReaderLineHeight };
    const parsed = JSON.parse(raw);
    return {
      theme: (parsed.theme as ReaderTheme) || 'dark',
      lineHeight: (parsed.lineHeight as ReaderLineHeight) || 'relaxed',
    };
  } catch {
    return { theme: 'dark' as ReaderTheme, lineHeight: 'relaxed' as ReaderLineHeight };
  }
}

export default function ChapterReader() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { book, chapters, progress } = useBook(bookId);
  const { updateProgress } = useBookActions();
  const logReading = useLogReading();
  const [tocOpen, setTocOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [settings, setSettings] = useState(loadReaderSettings);
  const startTimeRef = useRef<number>(Date.now());
  const saveScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentChapter = chapters.find((c) => c.id === chapterId);
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const completedChapters = progress?.completed_chapters || [];
  const isCompleted = chapterId ? completedChapters.includes(chapterId) : false;
  const progressPercent = chapters.length > 0
    ? ((currentIndex + 1) / chapters.length) * 100
    : 0;

  // Track one reading session per visit; log today's minutes once on leave.
  useEffect(() => {
    startTimeRef.current = Date.now();
    return () => {
      const minutesRead = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000));
      if (user && minutesRead > 0) {
        logReading.mutate({ minutesRead, chaptersRead: 0 });
      }
    };
  }, [user, logReading]);

  // Keep reading progress pointing at the open chapter, restore saved scroll.
  useEffect(() => {
    if (user && bookId && chapterId) {
      updateProgress(bookId, chapterId);
    }
  }, [user, bookId, chapterId, updateProgress]);

  useEffect(() => {
    const savedScroll = progress?.scroll_position;
    if (!savedScroll) return;
    const id = requestAnimationFrame(() => window.scrollTo(0, savedScroll));
    return () => cancelAnimationFrame(id);
  }, [progress?.scroll_position, chapterId]);

  // Persist reading scroll position so we can resume where the reader left off.
  useEffect(() => {
    if (!user || !bookId || !chapterId) return;
    const onScroll = () => {
      if (saveScrollTimerRef.current) clearTimeout(saveScrollTimerRef.current);
      saveScrollTimerRef.current = setTimeout(() => {
        updateProgress(bookId, chapterId, window.scrollY);
      }, 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (saveScrollTimerRef.current) clearTimeout(saveScrollTimerRef.current);
    };
  }, [user, bookId, chapterId, updateProgress]);

  const handleMarkComplete = useCallback(async () => {
    if (!bookId || !chapterId) return;
    await updateProgress(bookId, chapterId, undefined, chapterId);
    logReading.mutate({ minutesRead: 0, chaptersRead: 1 });
  }, [bookId, chapterId, updateProgress, logReading]);

  const fontSizeClass = fontSize === 'xlarge' ? 'text-xl' : fontSize === 'large' ? 'text-lg' : 'text-base';
  const lineHeightClass = settings.lineHeight === 'compact' ? 'leading-snug' : settings.lineHeight === 'loose' ? 'leading-loose' : 'leading-relaxed';
  const themeClasses: Record<ReaderTheme, { container: string; prose: string; body: string }> = {
    dark: { container: 'bg-card', prose: 'prose-neutral dark:prose-invert', body: 'text-foreground/85' },
    light: { container: 'bg-white', prose: 'prose-zinc dark:prose-invert', body: 'text-zinc-800' },
    sepia: { container: 'bg-[#f6efdf]', prose: 'prose-stone', body: 'text-[#3d342a]' },
  };
  const theme = themeClasses[settings.theme];

  const updateSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

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
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
            <BookOpen className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-xl font-bold mb-3">Chapter not found</h2>
          <Button asChild className="h-10 px-5 rounded-lg font-semibold">
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
                            ? "bg-primary text-primary-foreground" 
                            : "hover:bg-muted/50"
                        )}
                      >
                        <span className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                          isComplete && !isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                            ? "bg-white/20 text-primary-foreground"
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

          <div className="flex items-center justify-end gap-1 rounded-lg border border-border/60 bg-card p-1">
            {([
              { size: 'normal' as const, label: 'A', cls: 'text-xs' },
              { size: 'large' as const, label: 'A', cls: 'text-sm' },
              { size: 'xlarge' as const, label: 'A', cls: 'text-base' },
            ]).map(({ size, label, cls }) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                aria-label={`Font size ${size}`}
                className={cn(
                  "w-8 h-8 rounded-md font-bold transition-colors duration-200",
                  cls,
                  fontSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Reading preferences"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 rounded-xl p-3">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Theme</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['dark', 'light', 'sepia'] as ReaderTheme[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateSettings({ theme: t })}
                          className={cn(
                            'rounded-md border px-2 py-1.5 text-xs font-semibold capitalize transition-colors',
                            settings.theme === t
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/60 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Line height</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['compact', 'relaxed', 'loose'] as ReaderLineHeight[]).map((lh) => (
                        <button
                          key={lh}
                          type="button"
                          onClick={() => updateSettings({ lineHeight: lh })}
                          className={cn(
                            'rounded-md border px-2 py-1.5 text-xs font-semibold capitalize transition-colors',
                            settings.lineHeight === lh
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/60 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {lh}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 bg-muted/50" indicatorClassName="bg-primary" />
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className={cn('border border-border/60 rounded-xl p-6 md:p-8 shadow-sm', theme.container)}>
          <article className={cn('prose max-w-none', theme.prose)}>
            <h1 className="text-2xl md:text-3xl font-bold mb-8 tracking-tight">{currentChapter.title}</h1>
            <div className={cn('whitespace-pre-wrap', fontSizeClass, lineHeightClass, theme.body)}>
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
              className="w-full h-11 rounded-lg font-semibold text-primary-foreground"
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

      {/* Book AI — mobile: FAB + bottom sheet. Desktop (lg): untouched reader. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          aria-label="Open Book AI"
          className="fixed right-4 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background shadow-lg shadow-black/30"
        >
          <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />
        </button>

        <Sheet open={aiOpen} onOpenChange={setAiOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Ask about this book</SheetTitle>
            </SheetHeader>
            <div className="flex h-full min-h-0 flex-col">
              <BookAI
                  context={{
                    bookId: bookId ?? '',
                    bookTitle: book?.title ?? currentChapter.title,
                    chapterTitle: currentChapter.title,
                    chapter: currentIndex >= 0 ? currentIndex + 1 : undefined,
                  }}
                />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
