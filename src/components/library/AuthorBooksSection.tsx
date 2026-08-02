import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeCheck, Book, ChevronRight } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { AuthorWithBooks } from '@/hooks/useBooksByAuthor';

interface AuthorBooksSectionProps {
  authorGroup: AuthorWithBooks;
}

export default function AuthorBooksSection({ authorGroup }: AuthorBooksSectionProps) {
  const { author, books } = authorGroup;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          to={`/profile/${author.username}`}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <Avatar className="h-8 w-8 border border-border/60">
            <AvatarImage src={author.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
              {getInitials(author.display_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold transition-colors group-hover:text-primary">
              {author.display_name}
            </span>
            {author.is_verified && <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
            <span className="hidden flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </span>
          </div>
        </Link>

        <Link
          to={`/profile/${author.username}`}
          className="flex flex-shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          View library
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-1">
          {books.map((book) => (
            <BookMiniCard key={book.id} book={book} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </section>
  );
}

interface BookMiniCardProps {
  book: AuthorWithBooks['books'][0];
}

function BookMiniCard({ book }: BookMiniCardProps) {
  return (
    <Link
      to={`/library/book/${book.id}`}
      className="group flex w-[132px] flex-shrink-0 flex-col"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border/60 bg-muted transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40">
            <Book className="h-9 w-9 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        <h4 className="line-clamp-2 whitespace-normal text-sm font-medium leading-snug transition-colors group-hover:text-primary">
          {book.title}
        </h4>
        <span className="text-xs text-muted-foreground">
          {book.chapter_count} {book.chapter_count === 1 ? 'chapter' : 'chapters'}
        </span>
      </div>
    </Link>
  );
}
