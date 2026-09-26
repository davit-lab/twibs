import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen, Play, Book } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { LibraryBookWithProgress } from '@/hooks/useBooks';

interface ContinueReadingCardProps {
  book: LibraryBookWithProgress;
}

export default function ContinueReadingCard({ book }: ContinueReadingCardProps) {
  const navigate = useNavigate();

  const progressPercent =
    book.total_chapters > 0 ? (book.completed_count / book.total_chapters) * 100 : 0;

  const handleResume = () => {
    if (book.progress?.current_chapter_id) {
      navigate(`/library/book/${book.id}/read/${book.progress.current_chapter_id}`);
    } else {
      navigate(`/library/book/${book.id}`);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-3">
      <Link to={`/library/book/${book.id}`} className="flex-shrink-0 self-stretch">
        <div className="relative h-[70px] w-12 overflow-hidden rounded-md border border-border/60 bg-muted">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Book className="h-5 w-5 text-muted-foreground/30" />
            </span>
          )}
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to={`/library/book/${book.id}`}
          className="line-clamp-1 font-semibold tracking-tight transition-colors hover:text-primary"
        >
          {book.title}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {book.author?.display_name}
          {book.progress?.last_read_at ? (
            <span className="ml-1.5">
              · {formatDistanceToNow(new Date(book.progress.last_read_at), { addSuffix: true })}
            </span>
          ) : null}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">
            {book.current_chapter_title
              ? `Reading · ${book.current_chapter_title}`
              : `${book.completed_count} of ${book.total_chapters} chapters · ${Math.round(progressPercent)}%`}
          </span>
        </p>
      </div>

      <Button
        onClick={handleResume}
        size="sm"
        className="h-9 shrink-0 rounded-md px-3.5 font-semibold"
      >
        <Play className="h-3.5 w-3.5" />
        Continue
      </Button>
    </div>
  );
}