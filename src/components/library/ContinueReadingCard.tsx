import { useNavigate, Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BookOpen, BadgeCheck, ChevronRight, Play, Book } from 'lucide-react';
import type { LibraryBookWithProgress } from '@/hooks/useBooks';

interface ContinueReadingCardProps {
  book: LibraryBookWithProgress;
}

function ProgressRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative h-16 w-16">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="4" className="stroke-white/25" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-white"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
        {clamped}%
      </span>
    </div>
  );
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

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -left-16 -bottom-24 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative grid gap-6 p-6 md:grid-cols-[200px_1fr] md:gap-8 md:p-8">
        {/* Cover */}
        <Link
          to={`/library/book/${book.id}`}
          className="group mx-auto w-36 md:w-full max-w-[200px] flex-shrink-0 self-center"
        >
          <div className="relative">
            <div className="absolute inset-0 translate-x-2.5 translate-y-2.5 rounded-xl bg-primary/10" />
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/60 bg-muted shadow-lg shadow-black/5">
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
                  <Book className="h-10 w-10 text-muted-foreground/30" />
                </div>
              )}
            </div>
            <div className="absolute -bottom-3 -right-3 rounded-full bg-primary p-1 shadow-lg shadow-primary/25">
              <ProgressRing percent={progressPercent} />
            </div>
          </div>
        </Link>

        {/* Content */}
        <div className="flex flex-col justify-center">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Continue reading
          </p>

          <Link
            to={`/library/book/${book.id}`}
            className="mt-3 text-2xl font-bold tracking-tight text-foreground transition-colors hover:text-primary md:text-3xl"
          >
            {book.title}
          </Link>

          {book.author && (
            <div className="mt-2 flex items-center gap-2">
              <Avatar className="h-5 w-5 border border-border/60">
                <AvatarImage src={book.author.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-[8px] font-bold text-primary">
                  {getInitials(book.author.display_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">{book.author.display_name}</span>
              {book.author.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
            </div>
          )}

          {book.current_chapter_title && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-medium">Currently at:</span>
              <span className="truncate font-semibold text-foreground">{book.current_chapter_title}</span>
            </div>
          )}

          <div className="mt-4 max-w-md">
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
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={handleResume} className="h-11 rounded-xl px-6 font-semibold shadow-md shadow-primary/20">
              <Play className="h-4 w-4" />
              Resume reading
            </Button>
            <Button variant="outline" size="lg" className="h-11 rounded-xl border-border/60 font-semibold" asChild>
              <Link to={`/library/book/${book.id}`}>
                View details
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
