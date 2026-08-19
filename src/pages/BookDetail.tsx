import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { useBook, useBookActions, useBooks } from '@/hooks/useBooks';
import { useBookPurchaseStatus, useAuthorStripeStatus } from '@/hooks/useBookPurchase';
import { useOpenLibrary } from '@/hooks/useOpenLibrary';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import BookPurchaseButton from '@/components/library/BookPurchaseButton';
import FullScreenPdfViewer from '@/components/library/FullScreenPdfViewer';
import BookCard from '@/components/library/BookCard';
import {
  Book,
  BookOpen,
  Eye,
  Calendar,
  BadgeCheck,
  Heart,
  HeartOff,
  Play,
  Edit,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileText,
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile: currentProfile } = useAuth();
  const { book, chapters, progress, isInLibrary, isLoading, refetch, setIsInLibrary } = useBook(bookId);
  const { addToLibrary, removeFromLibrary } = useBookActions();
  const { data: purchaseStatus } = useBookPurchaseStatus(bookId);
  const { data: authorHasStripe } = useAuthorStripeStatus(book?.author_id);
  const { books: moreBooks, isLoading: loadingMoreBooks } = useBooks({ status: 'published' });
  const [isUpdatingLibrary, setIsUpdatingLibrary] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(null);
  const [isResolvingPdf, setIsResolvingPdf] = useState(false);
  const { fetchPdfUrl } = useOpenLibrary();

  const isAuthor = user && book?.author_id === user.id;
  const completedCount = progress?.completed_chapters?.length || 0;
  const totalChapters = chapters.length;
  const progressPercent = totalChapters > 0 ? (completedCount / totalChapters) * 100 : 0;

  useEffect(() => {
    if (searchParams.get('purchased') === 'true') {
      toast({
        title: 'Purchase successful!',
        description: 'You now have access to this book.',
      });
      refetch();
    } else if (searchParams.get('canceled') === 'true') {
      toast({
        variant: 'destructive',
        title: 'Purchase canceled',
        description: "You can try again when you're ready.",
      });
    }
  }, [searchParams]);

  const isFree = book?.is_free || !book?.price || book?.price === 0;
  const hasPdf = !!(book?.pdf_url || resolvedPdfUrl);
  const hasAccess = isAuthor || isFree || purchaseStatus?.hasPurchased;
  const pdfUrlToUse = book?.pdf_url || resolvedPdfUrl;
  const isExternalPdf = pdfUrlToUse && (pdfUrlToUse.startsWith('http://') || pdfUrlToUse.startsWith('https://'));
  const isEpub = pdfUrlToUse?.endsWith('.epub');
  const priceDisplay = isFree ? 'Free' : `$${((book?.price || 0) / 100).toFixed(2)}`;

  const relatedBooks = moreBooks
    .filter((b) => b.id !== bookId)
    .slice(0, 8);

  // Resolve PDF URL on-demand for imported books that don't have one yet
  useEffect(() => {
    if (!book || !hasAccess || book.pdf_url || resolvedPdfUrl || isResolvingPdf) return;

    const olTag = book.tags?.find((t) => t.startsWith('ol:'));
    if (!olTag) return;

    const olKey = olTag.replace('ol:', '');
    const resolve = async () => {
      setIsResolvingPdf(true);
      try {
        const url = await fetchPdfUrl(`/works/${olKey}`, book.tags?.filter((t) => !t.startsWith('ol:')));
        if (url) setResolvedPdfUrl(url);
      } finally {
        setIsResolvingPdf(false);
      }
    };
    resolve();
  }, [book, hasAccess, resolvedPdfUrl, isResolvingPdf, fetchPdfUrl]);

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const handleToggleLibrary = async () => {
    if (!user || !bookId) return;
    setIsUpdatingLibrary(true);
    if (isInLibrary) {
      const success = await removeFromLibrary(bookId);
      if (success) setIsInLibrary(false);
    } else {
      const success = await addToLibrary(bookId);
      if (success) setIsInLibrary(true);
    }
    setIsUpdatingLibrary(false);
  };

  const handleStartReading = () => {
    if (chapters.length === 0) return;
    const chapterToRead = progress?.current_chapter_id
      ? chapters.find((c) => c.id === progress.current_chapter_id)
      : chapters[0];
    if (chapterToRead) {
      navigate(`/library/book/${bookId}/read/${chapterToRead.id}`);
    }
  };

  const handleReadPdf = () => {
    if (isEpub && pdfUrlToUse) {
      // For EPUBs, open the Internet Archive reader in a new tab
      const iaId = pdfUrlToUse.match(/download\/([^/]+)/)?.[1];
      if (iaId) {
        window.open(`https://archive.org/details/${iaId}`, '_blank');
      } else {
        window.open(pdfUrlToUse, '_blank');
      }
    } else {
      setShowPdfViewer(true);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row gap-10">
            <Skeleton className="w-full md:w-60 aspect-[3/4] rounded-2xl" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-12 w-52 rounded-xl" />
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!book) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Book className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Book not found</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            This book may have been removed or you don't have access.
          </p>
          <Button asChild className="mt-6 rounded-xl px-6 font-semibold">
            <Link to="/library">Back to Library</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (showPdfViewer && hasPdf && hasAccess && !isEpub) {
    return (
      <FullScreenPdfViewer
        bookId={bookId!}
        bookTitle={book.title}
        pdfUrl={isExternalPdf ? pdfUrlToUse! : undefined}
        onClose={() => setShowPdfViewer(false)}
      />
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 pb-24 md:px-6">
        <div className="pt-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/library')}
            className="-ml-2 mb-8 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Button>

          {/* Header */}
          <div className="flex flex-col gap-10 md:flex-row">
            {/* Cover */}
            <div className="flex w-full flex-shrink-0 flex-col items-start gap-5 md:w-60">
              <div className="group relative w-full max-w-[240px]">
                <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-primary/10" />
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-lg shadow-black/5">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/40">
                      <Book className="h-12 w-12 text-muted-foreground/30" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                        {book.genre || 'Book'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {isAuthor && (
                <Button
                  variant="outline"
                  className="w-full max-w-[240px] rounded-xl border-border/60 font-semibold hover:border-primary/30 hover:bg-primary/5"
                  asChild
                >
                  <Link to={`/library/book/${bookId}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit book
                  </Link>
                </Button>
              )}
            </div>

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                {book.genre || 'Book'}
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                {book.title}
              </h1>

              {book.author && (
                <Link
                  to={`/profile/${book.author.username}`}
                  className="mt-3 inline-flex items-center gap-2"
                >
                  <Avatar className="h-6 w-6 border border-border/60">
                    <AvatarImage src={book.author.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                      {getInitials(book.author.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-semibold transition-colors hover:text-primary">
                    {book.author.display_name}
                  </span>
                  {book.author.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                </Link>
              )}

              {book.description && (
                <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  {book.description}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {hasPdf ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    PDF edition
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    {totalChapters} {totalChapters === 1 ? 'chapter' : 'chapters'}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  {book.view_count} {book.view_count === 1 ? 'view' : 'views'}
                </span>
                {book.published_at && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(book.published_at), 'MMMM d, yyyy')}
                  </span>
                )}
              </div>

              {/* Reading progress */}
              {user && progress && totalChapters > 0 && (
                <div className="mt-6 max-w-xl rounded-2xl border border-border/60 bg-card p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">Reading progress</span>
                    <span className="font-semibold text-primary">{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                      style={{ width: `${Math.min(progressPercent, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {completedCount} of {totalChapters} chapters completed
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {hasPdf && hasAccess ? (
                  <Button onClick={handleReadPdf} className="h-11 rounded-xl px-6 font-semibold shadow-md shadow-primary/20">
                    {isEpub ? <ExternalLink className="mr-2 h-4 w-4" /> : <BookOpen className="mr-2 h-4 w-4" />}
                    {isEpub ? 'Read on Open Library' : 'Read book'}
                  </Button>
                ) : hasPdf && !hasAccess ? (
                  <BookPurchaseButton
                    bookId={bookId!}
                    price={book.price || 0}
                    isFree={isFree}
                    isAuthor={!!isAuthor}
                    hasPdf={hasPdf}
                    authorHasStripe={authorHasStripe}
                    authorId={book.author_id}
                    onReadPdf={handleReadPdf}
                  />
                ) : totalChapters > 0 && hasAccess ? (
                  <Button onClick={handleStartReading} className="h-11 rounded-xl px-6 font-semibold shadow-md shadow-primary/20">
                    <Play className="mr-2 h-4 w-4" />
                    {progress ? 'Continue reading' : 'Start reading'}
                  </Button>
                ) : !hasAccess && !isFree ? (
                  <BookPurchaseButton
                    bookId={bookId!}
                    price={book.price || 0}
                    isFree={false}
                    isAuthor={false}
                    hasPdf={false}
                    authorHasStripe={authorHasStripe}
                    authorId={book.author_id}
                  />
                ) : isResolvingPdf ? (
                  <Button disabled className="h-11 rounded-xl px-6 font-semibold">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading book...
                  </Button>
                ) : null}

                {user && !isAuthor && (
                  <Button
                    variant="outline"
                    onClick={handleToggleLibrary}
                    disabled={isUpdatingLibrary}
                    className="h-11 rounded-xl border-border/60 px-5 font-semibold hover:border-primary/30 hover:bg-primary/5"
                  >
                    {isInLibrary ? (
                      <>
                        <HeartOff className="mr-2 h-4 w-4" />
                        Remove
                      </>
                    ) : (
                      <>
                        <Heart className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                )}

                <span className={cn('text-lg font-semibold', isFree ? 'text-emerald-500' : 'text-primary')}>
                  {priceDisplay}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chapters */}
        {totalChapters > 0 && (
          <div className="mt-14">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </span>
                <h2 className="text-lg font-bold tracking-tight">Chapters</h2>
              </div>
              <span className="text-sm text-muted-foreground">{totalChapters} total</span>
            </div>

            <div className="space-y-2">
              {chapters.map((chapter, index) => {
                const isCompleted = progress?.completed_chapters?.includes(chapter.id);
                const isCurrent = progress?.current_chapter_id === chapter.id;

                return (
                  <Link
                    key={chapter.id}
                    to={`/library/book/${bookId}/read/${chapter.id}`}
                    className={cn(
                      'group flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
                      isCurrent && 'border-primary/60 bg-primary/5'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-semibold',
                        isCompleted
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold transition-colors group-hover:text-primary">
                        {chapter.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {chapter.word_count.toLocaleString()} words
                      </p>
                    </div>

                    {isCurrent && (
                      <Badge variant="outline" className="flex-shrink-0 border-primary/30 text-xs font-semibold text-primary">
                        <Clock className="mr-1 h-3 w-3" />
                        Reading
                      </Badge>
                    )}

                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* More books */}
        {relatedBooks.length > 0 && (
          <div className="mt-14">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </span>
                <h2 className="text-lg font-bold tracking-tight">More from the library</h2>
              </div>
              <Button variant="ghost" size="sm" className="-mr-2 gap-1 text-muted-foreground" asChild>
                <Link to="/library">
                  View all
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-4 pb-4">
                {relatedBooks.map((relatedBook) => (
                  <div key={relatedBook.id} className="w-[140px] flex-shrink-0">
                    <BookCard book={relatedBook} />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-1.5" />
            </ScrollArea>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
