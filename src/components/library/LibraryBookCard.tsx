import { Link, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Book, BookOpen, Play, BadgeCheck, CheckCircle2, Clock, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRef, useState } from 'react';
import type { LibraryBookWithProgress } from '@/hooks/useBooks';

interface LibraryBookCardProps {
  book: LibraryBookWithProgress;
  onRemove?: () => void;
}

export default function LibraryBookCard({ book, onRemove }: LibraryBookCardProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressPercent = book.total_chapters > 0
    ? (book.completed_count / book.total_chapters) * 100
    : 0;

  const isComplete = book.completed_count === book.total_chapters && book.total_chapters > 0;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const handleContinueReading = () => {
    if (book.progress?.current_chapter_id) {
      navigate(`/library/book/${book.id}/read/${book.progress.current_chapter_id}`);
    } else {
      navigate(`/library/book/${book.id}`);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirming(false);
      onRemove?.();
    } else {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 2500);
    }
  };

  return (
    <div className="group flex gap-4 rounded-2xl border border-border/60 bg-card p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <Link to={`/library/book/${book.id}`} className="w-20 flex-shrink-0 self-start sm:w-24">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/60 bg-muted">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
              <Book className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
          {isComplete && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 p-1 shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </span>
          )}
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/library/book/${book.id}`}
              className="line-clamp-1 font-bold tracking-tight transition-colors hover:text-primary"
            >
              {book.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {book.genre && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {book.genre}
                </span>
              )}
              {book.progress?.last_read_at && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(book.progress.last_read_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {onRemove && (
            <button
              onClick={handleRemoveClick}
              title={confirming ? 'Confirm removal' : 'Remove from library'}
              className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
                confirming
                  ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                  : 'text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive focus:opacity-100 group-hover:opacity-100'
              }`}
            >
              {confirming ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  Remove?
                </>
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        {book.author && (
          <div className="mt-2 flex items-center gap-1.5">
            <Avatar className="h-5 w-5 border border-border/60">
              <AvatarImage src={book.author.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-[8px] font-bold text-primary">
                {getInitials(book.author.display_name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm text-muted-foreground">{book.author.display_name}</span>
            {book.author.is_verified && <BadgeCheck className="h-3 w-3 flex-shrink-0 text-primary" />}
          </div>
        )}

        <div className="mt-auto pt-3">
          {isComplete ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {book.completed_count} of {book.total_chapters} chapters
                </span>
                <span className="font-semibold text-primary">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                />
              </div>
            </>
          )}

          {book.current_chapter_title && !isComplete && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="h-3 w-3 text-primary" />
              <span className="truncate font-medium">Reading: {book.current_chapter_title}</span>
            </p>
          )}
        </div>

        <div className="mt-3">
          <Button
            size="sm"
            onClick={handleContinueReading}
            className="h-9 rounded-xl px-4 font-semibold"
          >
            <Play className="h-3.5 w-3.5" />
            {isComplete ? 'Read again' : book.progress ? 'Continue' : 'Start reading'}
          </Button>
        </div>
      </div>
    </div>
  );
}
