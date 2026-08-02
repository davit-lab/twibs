import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Book, BookOpen, Eye, BadgeCheck } from 'lucide-react';
import type { Book as BookType } from '@/hooks/useBooks';

interface BookCardProps {
  book: BookType;
  showStatus?: boolean;
}

export default function BookCard({ book, showStatus = false }: BookCardProps) {
  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const isFree = book.is_free || !book.price || book.price === 0;
  const priceDisplay = isFree ? 'Free' : `$${((book.price || 0) / 100).toFixed(2)}`;

  return (
    <Link
      to={`/library/book/${book.id}`}
      className="group block overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/40">
            <Book className="h-10 w-10 text-muted-foreground/30" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {book.genre || 'Book'}
            </span>
          </div>
        )}

        {showStatus && book.status !== 'published' && (
          <Badge
            variant={book.status === 'draft' ? 'secondary' : 'outline'}
            className="absolute right-2.5 top-2.5 text-[10px] font-semibold capitalize backdrop-blur-sm"
          >
            {book.status}
          </Badge>
        )}

        {!isFree && (
          <div className="absolute left-2.5 top-2.5 rounded-lg bg-background/85 px-2 py-0.5 text-xs font-semibold shadow-sm backdrop-blur-sm">
            {priceDisplay}
          </div>
        )}

        {book.genre && (
          <Badge variant="secondary" className="absolute bottom-2.5 left-2.5 text-[10px] font-semibold">
            {book.genre}
          </Badge>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight transition-colors group-hover:text-primary">
          {book.title}
        </h3>

        {book.author && (
          <div className="mt-2 flex items-center gap-1.5">
            <Avatar className="h-5 w-5 border border-border/60">
              <AvatarImage src={book.author.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-[8px] font-bold text-primary">
                {getInitials(book.author.display_name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {book.author.display_name}
            </span>
            {book.author.is_verified && (
              <BadgeCheck className="h-3 w-3 flex-shrink-0 text-primary" />
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-3 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 font-semibold">
            <BookOpen className="h-3 w-3" />
            {book.chapter_count || 0}
          </span>
          <span className="flex items-center gap-1 font-semibold">
            <Eye className="h-3 w-3" />
            {book.view_count}
          </span>
        </div>
      </div>
    </Link>
  );
}
