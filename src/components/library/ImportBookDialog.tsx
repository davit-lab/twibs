import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOpenLibrary, type OpenLibraryBook } from '@/hooks/useOpenLibrary';
import {
  Search,
  Download,
  Book,
  Calendar,
  Globe,
  Loader2,
  Check,
  X,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportBookDialogProps {
  onBookImported?: () => void;
  children?: React.ReactNode;
}

export default function ImportBookDialog({ onBookImported, children }: ImportBookDialogProps) {
  const { results, isLoading, isImporting, search, importBook, clearResults, getCoverUrl } = useOpenLibrary();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());

  const handleSearch = (value: string) => {
    setQuery(value);
    search(value);
  };

  const handleImport = async (book: OpenLibraryBook) => {
    const success = await importBook(book);
    if (success) {
      setImportedKeys((prev) => new Set(prev).add(book.key));
      onBookImported?.();
    }
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
    clearResults();
    setImportedKeys(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Import Book
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import from Open Library
          </DialogTitle>
          <DialogDescription>
            Search 40M+ free public domain books. Covers, metadata, and PDF/EPUB links are imported automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="h-11 rounded-xl border-border/60 bg-card pl-10 pr-10 focus-visible:ring-primary/30"
            autoFocus
          />
          {query && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 max-h-[55vh] mt-4 -mx-6 px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching Open Library...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <BookOpen className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {query ? 'No results found. Try a different search.' : 'Type to search for books to import.'}
              </p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                Search by book title, author name, ISBN, or subject keywords.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((book) => {
                const isImported = importedKeys.has(book.key);
                const coverUrl = book.cover_i ? getCoverUrl(book.cover_i, 'M') : null;

                return (
                  <div
                    key={book.key}
                    className={cn(
                      'flex gap-3.5 rounded-xl border border-border/60 bg-card p-3.5 transition-all duration-200',
                      isImported
                        ? 'opacity-60 border-emerald-500/30 bg-emerald-500/5'
                        : 'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
                    )}
                  >
                    <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={book.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Book className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold leading-tight line-clamp-1">{book.title}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {book.author_name?.join(', ') || 'Unknown author'}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {book.first_publish_year && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            <Calendar className="mr-0.5 h-2.5 w-2.5" />
                            {book.first_publish_year}
                          </Badge>
                        )}
                        {book.has_fulltext && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600">
                            Free full text
                          </Badge>
                        )}
                        {book.language?.length && book.language.length > 1 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            <Globe className="mr-0.5 h-2.5 w-2.5" />
                            {book.language.length} langs
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center">
                      {isImported ? (
                        <Badge variant="default" className="bg-emerald-500 text-white text-[10px] px-2.5 h-6 rounded-lg">
                          <Check className="mr-1 h-3 w-3" />
                          Added
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg border-primary/30 text-xs font-semibold px-3 hover:bg-primary/10"
                          onClick={() => handleImport(book)}
                          disabled={isImporting}
                        >
                          {isImporting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5 mr-1.5" />
                              Import
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
          <p className="text-[11px] text-muted-foreground">
            Powered by Open Library — public domain books only
          </p>
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
