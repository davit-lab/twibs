import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { useBooksByAuthor } from '@/hooks/useBooksByAuthor';
import { useMyBooks, useUserLibrary } from '@/hooks/useBooks';
import { useAuth } from '@/contexts/AuthContext';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import AuthorBooksSection from '@/components/library/AuthorBooksSection';
import LibraryBookCard from '@/components/library/LibraryBookCard';
import ContinueReadingCard from '@/components/library/ContinueReadingCard';
import CreateBookDialog from '@/components/library/CreateBookDialog';
import ReadingStreakCard from '@/components/library/ReadingStreakCard';
import BookCard from '@/components/library/BookCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookOpen,
  Search,
  X,
  Plus,
  Sparkles,
  TrendingUp,
  Clock,
  BookMarked,
  BookCheck,
  BookPlus,
  Heart,
  Flame,
  PenTool,
  Library as LibraryIcon,
  LayoutGrid,
  List,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabValue = 'my-library' | 'browse' | 'streak' | 'my-books';
type SortOption = 'recent' | 'popular';
type LibrarySort = 'recent' | 'title';
type ViewMode = 'grid' | 'list';

export default function Library() {
  const { user, profile } = useAuth();
  const { authorGroups, isLoading: loadingBrowse } = useBooksByAuthor();
  const { books: myBooks, isLoading: loadingMyBooks, refetch: refetchMyBooks } = useMyBooks();
  const { books: libraryBooks, isLoading: loadingLibrary } = useUserLibrary();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabValue>(user ? 'my-library' : 'browse');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [librarySort, setLibrarySort] = useState<LibrarySort>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeGenre, setActiveGenre] = useState('all');
  const { data: isPremium } = usePremiumStatus(user?.id);

  const isVerified = profile?.is_verified;
  const canCreateBooks = isVerified || isPremium;

  // All genres across published books
  const genres = useMemo(() => {
    const set = new Set<string>();
    authorGroups.forEach((group) =>
      group.books.forEach((book) => {
        if (book.genre) set.add(book.genre);
      })
    );
    return ['all', ...Array.from(set).sort()];
  }, [authorGroups]);

  const filteredGroups = useMemo(() => {
    const filtered = authorGroups.filter((group) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        group.author.display_name.toLowerCase().includes(query) ||
        group.author.username.toLowerCase().includes(query) ||
        group.books.some((book) => book.title.toLowerCase().includes(query))
      );
    });

    if (sortBy === 'popular') {
      return [...filtered].sort((a, b) => {
        const aViews = a.books.reduce((sum, b) => sum + (b.view_count || 0), 0);
        const bViews = b.books.reduce((sum, b) => sum + (b.view_count || 0), 0);
        return bViews - aViews;
      });
    }
    return filtered;
  }, [authorGroups, searchQuery, sortBy]);

  const genreFilteredGroups = useMemo(() => {
    if (activeGenre === 'all') return filteredGroups;
    return filteredGroups
      .map((group) => ({
        ...group,
        books: group.books.filter((book) => book.genre === activeGenre),
      }))
      .filter((group) => group.books.length > 0);
  }, [filteredGroups, activeGenre]);

  const filteredMyBooks = useMemo(() => {
    return myBooks.filter((book) =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [myBooks, searchQuery]);

  const filteredLibrary = useMemo(() => {
    const filtered = libraryBooks.filter((book) =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author?.display_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (librarySort === 'title') {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filtered;
  }, [libraryBooks, searchQuery, librarySort]);

  const currentlyReading = filteredLibrary.filter(
    (book) => book.progress && book.completed_count < book.total_chapters
  );
  const notStarted = filteredLibrary.filter(
    (book) => !book.progress || book.completed_count === 0
  );
  const completedBooks = filteredLibrary.filter(
    (book) => book.completed_count === book.total_chapters && book.total_chapters > 0
  );

  const heroBook = currentlyReading[0];

  const tabs = [
    { value: 'my-library' as const, label: 'My Library', icon: Heart, requiresAuth: true, count: libraryBooks.length },
    { value: 'browse' as const, label: 'Browse', icon: BookOpen, requiresAuth: false, count: undefined },
    { value: 'streak' as const, label: 'Streak', icon: Flame, requiresAuth: true, count: undefined },
    { value: 'my-books' as const, label: 'My Books', icon: PenTool, requiresAuth: true, requiresCreate: true, count: undefined },
  ];

  const statCards = [
    { label: 'Total Books', value: libraryBooks.length, icon: BookMarked },
    { label: 'In Progress', value: currentlyReading.length, icon: BookOpen },
    { label: 'Completed', value: completedBooks.length, icon: BookCheck },
    { label: 'Not Started', value: notStarted.length, icon: BookPlus },
  ];

  const renderSectionHeader = (title: string, icon?: React.ReactNode, action?: React.ReactNode) => (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24 lg:pb-8">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          {/* Page header */}
          <div className="flex flex-col gap-5 pt-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Reading space
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Library</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Discover books from the community and track your reading.
              </p>
            </div>

            {canCreateBooks && (
              <CreateBookDialog onBookCreated={refetchMyBooks}>
                <Button className="h-11 rounded-xl px-5 font-semibold shadow-md shadow-primary/20">
                  <Plus className="h-4 w-4" />
                  Create book
                </Button>
              </CreateBookDialog>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-border/60">
            {tabs.map((tab) => {
              if (tab.requiresAuth && !user) return null;
              if (tab.requiresCreate && !canCreateBooks) return null;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'relative flex items-center gap-2 whitespace-nowrap px-3.5 py-3 text-sm transition-colors',
                    isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
                  )}
                >
                  <tab.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {tab.count}
                    </span>
                  )}
                  <span
                    className={cn(
                      'absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Search + controls */}
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search books, authors..."
                className="h-11 rounded-xl border-border/60 bg-card pl-10 pr-10 focus-visible:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'browse' && (
                <>
                  <div className="flex items-center rounded-xl border border-border/60 bg-card p-1">
                    {(
                      [
                        { value: 'recent', label: 'Recent', icon: Clock },
                        { value: 'popular', label: 'Popular', icon: TrendingUp },
                      ] as { value: SortOption; label: string; icon: React.ElementType }[]
                    ).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSortBy(option.value)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                          sortBy === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <option.icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'my-library' && (
                <button
                  onClick={() => setLibrarySort(librarySort === 'recent' ? 'title' : 'recent')}
                  className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {librarySort === 'recent' ? 'Recently read' : 'Title A–Z'}
                </button>
              )}

              {(activeTab === 'my-library' || activeTab === 'my-books') && (
                <div className="flex items-center rounded-xl border border-border/60 bg-card p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'rounded-lg p-1.5 transition-colors',
                      viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'rounded-lg p-1.5 transition-colors',
                      viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="mt-8 min-h-[400px]">
            {/* ===== My Library ===== */}
            {activeTab === 'my-library' && user && (
              <>
                {loadingLibrary ? (
                  <div className="space-y-6">
                    <Skeleton className="h-64 w-full rounded-3xl" />
                    <div className="grid gap-4 md:grid-cols-2">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                      ))}
                    </div>
                  </div>
                ) : filteredLibrary.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <Heart className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">Your library is empty</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                      Browse books and add them to your library to track your reading progress.
                    </p>
                    <Button onClick={() => setActiveTab('browse')} className="mt-6 rounded-xl px-6 font-semibold">
                      <Sparkles className="h-4 w-4" />
                      Browse books
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {heroBook && <ContinueReadingCard book={heroBook} />}

                    {currentlyReading.length > 0 && (
                      <section>
                        {renderSectionHeader('Continue reading', (
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <BookOpen className="h-4 w-4 text-primary" />
                          </span>
                        ))}
                        {viewMode === 'grid' ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {currentlyReading.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {currentlyReading.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        )}
                      </section>
                    )}

                    {notStarted.length > 0 && (
                      <section>
                        {renderSectionHeader('Pick up later', (
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          </span>
                        ))}
                        {viewMode === 'grid' ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {notStarted.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {notStarted.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        )}
                      </section>
                    )}

                    {completedBooks.length > 0 && (
                      <section>
                        {renderSectionHeader('Finished', (
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                            <BookCheck className="h-4 w-4 text-emerald-500" />
                          </span>
                        ))}
                        {viewMode === 'grid' ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {completedBooks.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {completedBooks.map((book) => (
                              <LibraryBookCard key={book.id} book={book} />
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ===== Browse ===== */}
            {activeTab === 'browse' && (
              <>
                {/* Genre chips */}
                {genres.length > 1 && (
                  <div className="mb-6 flex flex-wrap gap-2">
                    {genres.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => setActiveGenre(genre)}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                          activeGenre === genre
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        )}
                      >
                        {genre === 'all' ? 'All genres' : genre}
                      </button>
                    ))}
                  </div>
                )}

                {loadingBrowse ? (
                  <div className="space-y-10">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-4">
                        <Skeleton className="h-8 w-52" />
                        <div className="flex gap-5 overflow-hidden">
                          {[1, 2, 3, 4, 5].map((j) => (
                            <Skeleton key={j} className="h-56 w-40 flex-shrink-0 rounded-2xl" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : genreFilteredGroups.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <LibraryIcon className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">No books found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {searchQuery || activeGenre !== 'all'
                        ? 'Try a different search or filter'
                        : 'Be the first to publish a book!'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {genreFilteredGroups.map((group) => (
                      <AuthorBooksSection key={group.author.user_id} authorGroup={group} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ===== Streak ===== */}
            {activeTab === 'streak' && user && (
              <div className="mx-auto max-w-xl">
                <ReadingStreakCard />
              </div>
            )}

            {/* ===== My Books ===== */}
            {activeTab === 'my-books' && canCreateBooks && (
              <>
                {loadingMyBooks ? (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
                    ))}
                  </div>
                ) : filteredMyBooks.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                      <PenTool className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">No books yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Start writing your first book today.</p>
                    <CreateBookDialog onBookCreated={refetchMyBooks}>
                      <Button className="mt-6 rounded-xl px-6 font-semibold">
                        <Plus className="h-4 w-4" />
                        Create book
                      </Button>
                    </CreateBookDialog>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'grid gap-4',
                      viewMode === 'grid'
                        ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                        : 'grid-cols-1'
                    )}
                  >
                    {filteredMyBooks.map((book) => (
                      <BookCard key={book.id} book={book} showStatus />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stats */}
          {user && libraryBooks.length > 0 && activeTab === 'my-library' && (
            <div className="mt-12">
              <div className="mb-4 flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight">Your reading stats</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {statCards.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-border/60 bg-card p-4">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                        <stat.icon className="h-3.5 w-3.5 text-primary" />
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info for non-verified users */}
          {!canCreateBooks && user && (
            <div className="mt-12 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card to-card/60">
              <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center md:p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <PenTool className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Want to publish your own books?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get verified or upgrade to premium to create and publish books in the library.
                  </p>
                </div>
                <Button variant="outline" className="h-11 rounded-xl border-primary/30 font-semibold hover:bg-primary/10" asChild>
                  <Link to="/pricing">
                    <Sparkles className="h-4 w-4" />
                    View plans
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
