import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { useBooks, type Book } from '@/hooks/useBooks';
import { useMyBooks, useUserLibrary, useBookActions } from '@/hooks/useBooks';
import { useLibraryItems } from '@/hooks/useLibraryItems';
import { useAuth } from '@/contexts/AuthContext';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useFollowingReadingFeed } from '@/hooks/useSocialReading';
import LibraryBookCard from '@/components/library/LibraryBookCard';
import { BookAI } from '@/components/bookai/BookAI';
import ContinueReadingCard from '@/components/library/ContinueReadingCard';
import CreateBookDialog from '@/components/library/CreateBookDialog';
import UploadItemModal from '@/components/library/UploadItemModal';
import BookCard from '@/components/library/BookCard';
import CollectionsSection from '@/components/library/CollectionsSection';
import ReadingHistoryPage from '@/components/library/ReadingHistoryPage';
import ContentCard, { ContentCardGrid } from '@/components/library/content/ContentCard';
import type { ContentKind, LibraryContent } from '@/lib/library-content';
import {
  bookToContent,
  libraryItemToContent,
  matchSearch,
  CONTENT_KINDS,
  kindLabel,
} from '@/lib/library-content';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BookOpen,
  Search,
  X,
  Plus,
  TrendingUp,
  Clock,
  Heart,
  CalendarDays,
  PenTool,
  Upload,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Compass,
  Home,
  FolderOpen,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type TabValue = 'home' | 'explore' | 'my-library' | 'collections' | 'streak';
type SortOption = 'recent' | 'popular';
type ViewMode = 'grid' | 'list';

export default function Library() {
  const { user, profile } = useAuth();
  const { books: publishedBooks, isLoading: loadingExploreBooks, refetch: refetchBooks } = useBooks({ status: 'published' });
  const libraryItemsHook = useLibraryItems();
  const { books: myBooks, refetch: refetchMyBooks } = useMyBooks();
  const { books: libraryBooks, isLoading: loadingLibrary, refetch: refetchLibrary } = useUserLibrary();
  const { removeFromLibrary, toggleBookLike } = useBookActions();
  const { data: isPremium } = usePremiumStatus(user?.id);
  const { events: feedEvents, loading: loadingFeed } = useFollowingReadingFeed();

  const [activeTab, setActiveTab] = useState<TabValue>(user ? 'home' : 'explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ContentKind>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBook, setAiBook] = useState<{ id: string; title: string } | null>(null);

  const isVerified = profile?.is_verified;
  const canCreateBooks = isVerified || isPremium;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const exploreItems: LibraryContent[] = useMemo(() => {
    const books = publishedBooks.map(bookToContent);
    const media = libraryItemsHook.items.map(libraryItemToContent);
    let all = [...books, ...media];
    if (typeFilter !== 'all') all = all.filter((c) => c.kind === typeFilter);
    all = all.filter((c) => matchSearch(c, debouncedQuery));
    if (sortBy === 'popular') {
      all = [...all].sort((a, b) => b.viewCount - a.viewCount);
    } else {
      all = [...all].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return all.map((c) => (likedOverrides[c.key] !== undefined ? { ...c, liked: likedOverrides[c.key] } : c));
  }, [publishedBooks, libraryItemsHook.items, debouncedQuery, typeFilter, sortBy, likedOverrides]);

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<'all' | ContentKind, number>> = { all: exploreItems.length };
    CONTENT_KINDS.forEach((kind) => {
      counts[kind] = exploreItems.filter((c) => c.kind === kind).length;
    });
    return counts;
  }, [exploreItems]);

  const filteredLibrary = useMemo(() => {
    const filtered = libraryBooks.filter(
      (book) =>
        !debouncedQuery ||
        book.title.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        (book.author?.display_name.toLowerCase().includes(debouncedQuery.toLowerCase()) ?? false)
    );
    return filtered;
  }, [libraryBooks, debouncedQuery]);

  const currentlyReading = filteredLibrary.filter(
    (book) => book.progress && book.completed_count < book.total_chapters
  );
  const notStarted = filteredLibrary.filter(
    (book) => book.progress === undefined && book.completed_count === 0
  );
  const completedBooks = filteredLibrary.filter(
    (book) => book.completed_count === book.total_chapters && book.total_chapters > 0
  );
  const heartedBooks = filteredLibrary.filter((book) => book.is_liked);

  const handleRemoveFromLibrary = async (bookId: string) => {
    const removed = await removeFromLibrary(bookId);
    if (removed) refetchLibrary();
  };

  const handleToggleLike = async (bookId: string, isCurrentlyLiked: boolean) => {
    const success = await toggleBookLike(bookId, isCurrentlyLiked);
    if (success) {
      refetchLibrary();
      refetchBooks();
    }
  };

  const handleExploreLike = useCallback((content: LibraryContent) => {
    const next = !(content.liked ?? false);
    setLikedOverrides((prev) => ({ ...prev, [content.key]: next }));
    if (content.kind === 'book') {
      void toggleBookLike(content.id, content.liked ?? false);
    } else {
      void libraryItemsHook.likeItem(content.id);
    }
  }, [toggleBookLike, libraryItemsHook]);

  const handleMyItemsLike = useCallback((content: LibraryContent) => {
    void libraryItemsHook.likeItem(content.id);
  }, [libraryItemsHook]);

  const renderSectionHeader = (title: string, icon?: React.ReactNode, action?: React.ReactNode, count?: number) => (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-muted-foreground">{count}</span>
        )}
      </div>
      {action}
    </div>
  );

  const tabs = [
    { value: 'home' as const, label: 'Home', icon: Home, requiresAuth: false },
    { value: 'explore' as const, label: 'Explore', icon: Compass, requiresAuth: false },
    { value: 'my-library' as const, label: 'My Library', icon: BookOpen, requiresAuth: true, count: libraryBooks.length },
    { value: 'collections' as const, label: 'Collections', icon: FolderOpen, requiresAuth: true },
    { value: 'streak' as const, label: 'Activity', icon: CalendarDays, requiresAuth: true },
  ];

  const trendingBooks = useMemo(
    () => [...publishedBooks].filter((b) => (b.view_count ?? 0) > 0).sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 8),
    [publishedBooks]
  );
  const newBooks = useMemo(
    () => [...publishedBooks].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).slice(0, 8),
    [publishedBooks]
  );
  const recommendedBooks = useMemo(() => {
    const inLibrary = new Set(libraryBooks.map((b) => b.id));
    const myGenres = new Set(
      libraryBooks.map((b) => b.genre).filter((g): g is string => Boolean(g))
    );
    const candidates = publishedBooks.filter(
      (b) => !inLibrary.has(b.id) && (!user || b.author_id !== user.id)
    );
    return [...candidates]
      .sort((a, b) => {
        const ag = a.genre && myGenres.has(a.genre) ? 1 : 0;
        const bg = b.genre && myGenres.has(b.genre) ? 1 : 0;
        if (bg !== ag) return bg - ag;
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      })
      .slice(0, 8);
  }, [publishedBooks, libraryBooks, user]);
  const moreFromAuthors = useMemo(() => {
    const authorIds = new Set((libraryBooks.map((b) => b.author_id) || []).filter(Boolean) as string[]);
    const inLibrary = new Set(libraryBooks.map((b) => b.id));
    if (!authorIds.size) return [];
    return publishedBooks
      .filter((b) => authorIds.has(b.author_id) && !inLibrary.has(b.id))
      .slice(0, 8);
  }, [publishedBooks, libraryBooks]);

  const rail = (books: Book[]) => (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {books.map((book) => (
        <div key={book.id} className="w-32 shrink-0 sm:w-36">
          <BookCard book={book} />
        </div>
      ))}
    </div>
  );

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl px-4 pb-24 md:px-6 lg:pb-8">
        <div className="flex flex-col gap-5 pt-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Books, media and the reading around you.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {user && libraryBooks.length > 0 && (
              <Button
                variant="outline"
                onClick={() => { setAiBook(null); setAiOpen(true); }}
                className="h-10 rounded-lg border-border/60 px-4 font-semibold"
              >
                <BookOpen className="h-4 w-4" />
                Ask about this book
              </Button>
            )}
            <UploadItemModal onSuccess={libraryItemsHook.refetch}>
              <Button variant="outline" className="h-10 rounded-lg border-border/60 px-4 font-semibold">
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </UploadItemModal>
            {canCreateBooks && (
              <CreateBookDialog onBookCreated={refetchMyBooks}>
                <Button className="h-10 rounded-lg px-4 font-semibold">
                  <Plus className="h-4 w-4" />
                  Create book
                </Button>
              </CreateBookDialog>
            )}
          </div>
        </div>

        <div className="mt-8 flex gap-1 overflow-x-auto border-b border-border/60">
          {tabs.map((tab) => {
            if (tab.requiresAuth && !user) return null;
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
                    'absolute inset-x-2 -bottom-px h-0.5 bg-primary transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            );
          })}
        </div>

        {(activeTab === 'explore' || activeTab === 'my-library') && (
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'explore' ? 'Search books and media...' : 'Search your library...'}
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
              {activeTab === 'explore' && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-11 gap-2 rounded-xl border-border/60 bg-card px-3 text-xs font-semibold"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {typeFilter === 'all' ? 'All types' : kindLabel(typeFilter)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-52 rounded-xl p-2">
                      <TypeFilterList typeFilter={typeFilter} typeCounts={typeCounts} onChange={setTypeFilter} />
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center rounded-xl border border-border/60 bg-card p-1">
                    {([
                      { value: 'recent', label: 'Recent', icon: Clock },
                      { value: 'popular', label: 'Popular', icon: TrendingUp },
                    ] as { value: SortOption; label: string; icon: React.ElementType }[]).map((option) => (
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
            </div>
          </div>
        )}

        <div className="mt-8 min-h-[400px]">
          {/* ===== Home — social reading feed ===== */}
          {activeTab === 'home' && (
            <div className="space-y-12">
              {/* Continue reading — one section only */}
              {currentlyReading.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <h2 className="text-base font-semibold tracking-tight">Continue reading</h2>
                    <span className="text-xs text-muted-foreground">{currentlyReading.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {currentlyReading.map((book) => (
                      <ContinueReadingCard key={book.id} book={book} />
                    ))}
                  </div>
                </section>
              )}

              {/* From people you follow — real social feed */}
              <section>
                <div className="mb-4 flex items-baseline gap-2.5">
                  <Users className="h-4 w-4 self-center text-muted-foreground" />
                  <h2 className="text-base font-semibold tracking-tight">From people you follow</h2>
                </div>
                {!user ? (
                  <p className="text-sm text-muted-foreground">
                    Sign in to follow writers and see what they are reading.
                  </p>
                ) : loadingFeed ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : feedEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Reading from people you follow appears here. Explore the library to find writers
                    to follow.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {feedEvents.slice(0, 6).map((e) => {
                      const label =
                        e.action === 'finished'
                          ? 'finished'
                          : e.action === 'reading'
                            ? 'is reading'
                            : 'started reading';
                      return (
                        <div key={e.key} className="flex items-center gap-3 py-3">
                          <Link
                            to={e.username ? `/profile/${e.username}` : '#'}
                            className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted"
                          >
                            {e.avatarUrl ? (
                              <img src={e.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-muted-foreground">
                                {e.displayName.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-foreground">
                              <span className="font-semibold">{e.displayName}</span>{' '}
                              <span className="text-muted-foreground">{label}</span>{' '}
                              <Link to={`/library/book/${e.bookId}`} className="font-medium hover:underline">
                                {e.bookTitle}
                              </Link>
                            </p>
                            {e.detail && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.detail}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Recommended for you — real data, covers as visual */}
              {recommendedBooks.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <h2 className="text-base font-semibold tracking-tight">Recommended for you</h2>
                    <span className="text-xs text-muted-foreground">{recommendedBooks.length}</span>
                  </div>
                  {rail(recommendedBooks)}
                </section>
              )}

              {/* Trending — only when real engagement exists */}
              {trendingBooks.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <TrendingUp className="h-4 w-4 self-center text-muted-foreground" />
                    <h2 className="text-base font-semibold tracking-tight">Trending</h2>
                    <span className="text-xs text-muted-foreground">Most viewed right now</span>
                  </div>
                  {rail(trendingBooks)}
                </section>
              )}

              {/* New in the library */}
              {newBooks.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <Clock className="h-4 w-4 self-center text-muted-foreground" />
                    <h2 className="text-base font-semibold tracking-tight">New in the library</h2>
                  </div>
                  {rail(newBooks)}
                </section>
              )}

              {/* More from authors you read — real relationship */}
              {moreFromAuthors.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <h2 className="text-base font-semibold tracking-tight">More from authors you read</h2>
                  </div>
                  {rail(moreFromAuthors)}
                </section>
              )}

              {/* Published work — writer on Home */}
              {canCreateBooks && myBooks.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline gap-2.5">
                    <PenTool className="h-4 w-4 self-center text-muted-foreground" />
                    <h2 className="text-base font-semibold tracking-tight">Your published work</h2>
                    <Link to={`/library/book/${myBooks[0].id}`} className="ml-auto text-xs font-semibold text-primary hover:underline">
                      View writing
                    </Link>
                  </div>
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {myBooks.slice(0, 4).map((book) => (
                      <BookCard key={book.id} book={book} showStatus />
                    ))}
                  </div>
                </section>
              )}

              {user && !canCreateBooks && (
                <p className="text-sm text-muted-foreground">
                  Want to publish your own books? Get verified or upgrade to premium.
                </p>
              )}
            </div>
          )}

          {/* ===== Explore ===== */}
          {activeTab === 'explore' && (
            <>
              {loadingExploreBooks ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                  ))}
                </div>
              ) : !debouncedQuery && typeFilter === 'all' ? (
                <div className="space-y-12">
                  {trendingBooks.length > 0 && (
                    <section>
                      <div className="mb-4 flex items-baseline gap-2.5">
                        <TrendingUp className="h-4 w-4 self-center text-muted-foreground" />
                        <h2 className="text-base font-semibold tracking-tight">Trending</h2>
                        <span className="text-xs text-muted-foreground">Most viewed</span>
                      </div>
                      {rail(trendingBooks)}
                    </section>
                  )}
                  {newBooks.length > 0 && (
                    <section>
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-baseline gap-2.5">
                          <Clock className="h-4 w-4 self-center text-muted-foreground" />
                          <h2 className="text-base font-semibold tracking-tight">New in the library</h2>
                        </div>
                        <span className="text-xs text-muted-foreground">{exploreItems.length} total</span>
                      </div>
                      {rail(newBooks)}
                    </section>
                  )}
                  {exploreItems.length > 0 && (
                    <section>
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-base font-semibold tracking-tight">Everything</h2>
                        <div className="flex items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="h-9 gap-2 rounded-xl border-border/60 bg-card px-3 text-xs font-semibold"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                {typeFilter === 'all' ? 'All types' : kindLabel(typeFilter)}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-52 rounded-xl p-2">
                              <TypeFilterList typeFilter={typeFilter} typeCounts={typeCounts} onChange={setTypeFilter} />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <ContentCardGrid items={exploreItems} onLike={handleExploreLike} />
                    </section>
                  )}
                </div>
              ) : (
                <>
                  {debouncedQuery && (
                    <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{exploreItems.length}</strong> results for &ldquo;{debouncedQuery}&rdquo;
                      </span>
                      <div className="ml-auto flex gap-1.5 text-xs">
                        {CONTENT_KINDS.map((kind) => {
                          const count = exploreItems.filter((c) => c.kind === kind).length;
                          if (!count) return null;
                          return (
                            <button
                              key={kind}
                              onClick={() => setTypeFilter(typeFilter === kind ? 'all' : kind)}
                              className={cn(
                                'rounded-full border px-3 py-1 font-semibold transition-colors',
                                typeFilter === kind
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {kindLabel(kind)} · {count}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {exploreItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                      <Compass className="mx-auto mb-5 h-10 w-10 text-muted-foreground/40" />
                      <h3 className="text-lg font-bold tracking-tight">Nothing found</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {debouncedQuery || typeFilter !== 'all'
                          ? 'Try a different search or clear the type filter.'
                          : 'Be the first to publish a book or upload media!'}
                      </p>
                      {!debouncedQuery && typeFilter === 'all' && user && (
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                          <UploadItemModal onSuccess={libraryItemsHook.refetch}>
                            <Button className="rounded-lg font-semibold">
                              <Upload className="h-4 w-4" />
                              Upload something
                            </Button>
                          </UploadItemModal>
                          {canCreateBooks && (
                            <CreateBookDialog onBookCreated={refetchMyBooks}>
                              <Button variant="outline" className="rounded-lg font-semibold border-border/60">
                                <PenTool className="h-4 w-4" />
                                Create a book
                              </Button>
                            </CreateBookDialog>
                          )}
                        </div>
                      )}
                    </div>
                  ) : viewMode === 'grid' ? (
                    <ContentCardGrid items={exploreItems} onLike={handleExploreLike} />
                  ) : (
                    <div className="space-y-3">
                      {exploreItems.map((content) => (
                        <ContentCard
                          key={content.key}
                          content={content}
                          variant="list"
                          onLike={handleExploreLike}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ===== My Library — one continue section + shelves ===== */}
          {activeTab === 'my-library' && user && (
            <div className="space-y-12">
              <div className="flex items-center gap-2">
                <UploadItemModal onSuccess={libraryItemsHook.refetch}>
                  <Button size="sm" className="rounded-lg gap-1.5 font-semibold">
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                </UploadItemModal>
              </div>

              {loadingLibrary ? (
                <div className="space-y-6">
                  <Skeleton className="h-24 w-full rounded-2xl" />
                  <div className="grid gap-4 md:grid-cols-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                    ))}
                  </div>
                </div>
              ) : debouncedQuery &&
                filteredLibrary.length === 0 &&
                !libraryItemsHook.items.some((i) =>
                  i.title.toLowerCase().includes(debouncedQuery.toLowerCase())
                ) ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                  <Search className="mx-auto mb-5 h-10 w-10 text-muted-foreground/40" />
                  <h3 className="text-lg font-bold tracking-tight">No matches in your library</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nothing matching &ldquo;{debouncedQuery}&rdquo; was found.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchQuery('')}
                    className="mt-6 rounded-lg font-semibold border-border/60"
                  >
                    Clear search
                  </Button>
                </div>
              ) : filteredLibrary.length === 0 && libraryItemsHook.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-8 py-20 text-center">
                  <Heart className="mx-auto mb-5 h-10 w-10 text-primary/50" />
                  <h3 className="text-lg font-bold tracking-tight">Your library is empty</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    Save books to track your reading, or upload your own audio, PDFs, images and videos.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <Button onClick={() => setActiveTab('explore')} className="rounded-lg px-6 font-semibold">
                      <Compass className="h-4 w-4" />
                      Browse the library
                    </Button>
                    <UploadItemModal onSuccess={libraryItemsHook.refetch}>
                      <Button variant="outline" className="rounded-lg font-semibold border-border/60">
                        <Upload className="h-4 w-4" />
                        Upload media
                      </Button>
                    </UploadItemModal>
                  </div>
                </div>
              ) : (
                <div className="space-y-12">
                  {currentlyReading.length > 0 && (
                    <section>
                      <div className="mb-4 flex items-baseline gap-2.5">
                        <h2 className="text-base font-semibold tracking-tight">Continue reading</h2>
                        <span className="text-xs text-muted-foreground">{currentlyReading.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {currentlyReading.map((book) => (
                          <ContinueReadingCard key={book.id} book={book} />
                        ))}
                      </div>
                    </section>
                  )}

                  {notStarted.length > 0 && (
                    <section>
                      {renderSectionHeader(
                        'Pick up later',
                        undefined,
                        undefined,
                        notStarted.length
                      )}
                      <div className={cn('grid gap-4 md:grid-cols-2', viewMode === 'list' && 'grid-cols-1')}>
                        {notStarted.map((book) => (
                          <LibraryBookCard
                            key={book.id}
                            book={book}
                            onRemove={() => handleRemoveFromLibrary(book.id)}
                            onToggleLike={handleToggleLike}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {(completedBooks.length > 0 || heartedBooks.length > 0) && (
                    <section>
                      {renderSectionHeader(
                        'Finished & hearted',
                        undefined,
                        undefined,
                        completedBooks.length + heartedBooks.length
                      )}
                      <div className={cn('grid gap-4 md:grid-cols-2', viewMode === 'list' && 'grid-cols-1')}>
                        {[...completedBooks, ...heartedBooks].map((book) => (
                          <LibraryBookCard
                            key={book.id}
                            book={book}
                            onRemove={() => handleRemoveFromLibrary(book.id)}
                            onToggleLike={handleToggleLike}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {libraryItemsHook.items.length > 0 && (
                <section className="mt-12">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-baseline gap-2.5">
                      <h2 className="text-base font-semibold tracking-tight">My uploads</h2>
                      <span className="text-xs text-muted-foreground">{libraryItemsHook.items.length}</span>
                    </div>
                    <UploadItemModal onSuccess={libraryItemsHook.refetch}>
                      <Button variant="ghost" size="sm" className="gap-1 font-semibold text-primary">
                        <Plus className="h-4 w-4" />
                        Upload
                      </Button>
                    </UploadItemModal>
                  </div>
                  {viewMode === 'grid' ? (
                    <ContentCardGrid
                      items={libraryItemsHook.items
                        .filter((i) => !debouncedQuery || i.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
                        .map(libraryItemToContent)}
                      onLike={handleMyItemsLike}
                    />
                  ) : (
                    <div className="space-y-3">
                      {libraryItemsHook.items
                        .filter((i) => !debouncedQuery || i.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
                        .map((item) => (
                          <ContentCard
                            key={item.id}
                            content={libraryItemToContent(item)}
                            variant="list"
                            onLike={handleMyItemsLike}
                          />
                        ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ===== Collections ===== */}
          {activeTab === 'collections' && user && <CollectionsSection />}

          {/* ===== Activity (reading history) ===== */}
          {activeTab === 'streak' && user && <ReadingHistoryPage />}
        </div>
      </div>

      <Sheet open={aiOpen} onOpenChange={(open) => { if (!open) setAiOpen(false); }}>
        <SheetContent side="bottom" className="h-[85vh] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Ask about this book</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-col">
            {aiBook ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-4">
                  <button
                    type="button"
                    onClick={() => setAiBook(null)}
                    aria-label="Choose another book"
                    className="rounded text-muted-foreground hover:text-foreground"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="truncate text-sm font-semibold">{aiBook.title}</span>
                </div>
                <div className="min-h-0 flex-1">
                  <BookAI context={{ bookId: aiBook.id, bookTitle: aiBook.title }} />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
                  <span className="text-sm font-semibold">Ask about this book</span>
                  <span className="text-xs text-muted-foreground">— choose a book to discuss</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {libraryBooks.length === 0 ? (
                    <p className="pt-6 text-center text-sm text-muted-foreground">
                      Your library is empty — add a book first.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {libraryBooks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setAiBook({ id: b.id, title: b.title })}
                          className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left text-sm font-medium hover:border-primary/40"
                        >
                          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{b.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </MainLayout>
  );
}

function TypeFilterList({
  typeFilter,
  typeCounts,
  onChange,
}: {
  typeFilter: 'all' | ContentKind;
  typeCounts: Partial<Record<'all' | ContentKind, number>>;
  onChange: (value: 'all' | ContentKind) => void;
}) {
  const options: { value: 'all' | ContentKind; label: string }[] = [
    { value: 'all', label: 'All types' },
    ...CONTENT_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) })),
  ];
  return (
    <div className="space-y-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
            typeFilter === opt.value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          {opt.label}
          <span className="text-xs text-muted-foreground">{typeCounts[opt.value] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}