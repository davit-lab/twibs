import { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import GroupCard from '@/components/groups/GroupCard';
import CreateGroupDialog from '@/components/groups/CreateGroupDialog';
import { useGroups, useGroupActions, Group } from '@/hooks/useGroups';
import { Users, Search, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'discover' | 'mine';
type PrivacyFilter = 'all' | 'public' | 'private';

const EmptyIcon: React.FC = () => null;
const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'discover', label: 'Discover', icon: EmptyIcon },
  { value: 'mine', label: 'My Groups', icon: Users },
];

// privacy filters removed from UI

export default function Groups() {
  const [tab, setTab] = useState<Tab>('discover');
  const [search, setSearch] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { groups, isLoading, error } = useGroups(search);
  const { joinGroup, requestJoinGroup, leaveGroup } = useGroupActions();

  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key === '/' && el?.tagName !== 'INPUT' && el?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearch('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const mine = useMemo(() => groups.filter((g) => !!g.membership), [groups]);

  const visible = useMemo(() => {
    const base = tab === 'mine' ? mine : groups;
    if (privacy === 'all') return base;
    return base.filter((g) => g.privacy === privacy);
  }, [tab, mine, groups, privacy]);

  const counts = useMemo(
    () => ({
      all: groups.length,
      public: groups.filter((g) => g.privacy === 'public').length,
      private: groups.filter((g) => g.privacy === 'private').length,
    }),
    [groups]
  );

  const pendingRequests = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => {
      if (g.join_request?.status === 'pending') ids.add(g.id);
    });
    return ids.size;
  }, [groups]);

  const handleJoin = async (group: Group) => {
    setJoiningId(group.id);
    try {
      if (group.privacy === 'private') await requestJoinGroup.mutateAsync(group.id);
      else await joinGroup.mutateAsync(group.id);
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeave = async (groupId: string) => {
    setJoiningId(groupId);
    try {
      await leaveGroup.mutateAsync(groupId);
    } finally {
      setJoiningId(null);
    }
  };

  const trimmed = search.trim();

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24">
        {/* Editorial hero */}
        <div className="border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none">Groups</h1>
                <p className="text-muted-foreground text-sm font-medium mt-3 max-w-md leading-relaxed">
                  Find your people. Join public communities or request access to private ones.
                </p>
              </div>
              <Button onClick={() => setCreateOpen(true)} className="h-11 px-5 rounded-xl font-bold shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Create Group
              </Button>
            </div>

            {/* Redesigned search bar */}
            <div className="relative mt-8 group/search">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/10 rounded-2xl blur-md opacity-0 group-focus-within/search:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-center bg-card border border-border/70 focus-within:border-primary/50 rounded-2xl shadow-sm focus-within:shadow-lg focus-within:shadow-primary/10 transition-all duration-300 overflow-hidden">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search groups..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-12 pr-20 h-14 text-base bg-transparent border-0 shadow-none focus-visible:ring-0 rounded-2xl font-medium"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {search ? (
                    <button
                      onClick={() => setSearch('')}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <kbd className="hidden sm:inline-flex items-center h-6 px-2 rounded-md bg-surface-2 text-[10px] font-bold text-muted-foreground border border-border/60">
                      /
                    </kbd>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip removed */}
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
              {TABS.map(({ value, label, icon: Icon }) => {
                const active = tab === value;
                const count = value === 'mine' ? mine.length : groups.length;
                return (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200',
                      active
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums',
                        active ? 'bg-background/20 text-background' : 'bg-surface-2 text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              <div className="ml-auto" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 pt-6">
          {/* Search meta */}
          {trimmed && !isLoading && (
            <div className="flex items-center justify-between gap-4 mb-5">
              <p className="text-sm font-semibold text-muted-foreground min-w-0 truncate">
                Results for <span className="font-black text-foreground">“{trimmed}”</span>
                <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
                  · {visible.length} group{visible.length === 1 ? '' : 's'}
                </span>
              </p>
              <button onClick={() => setSearch('')} className="text-xs font-bold text-primary hover:underline flex-shrink-0">
                Clear
              </button>
            </div>
          )}

          {/* Pending requests banner */}
          {!isLoading && pendingRequests > 0 && tab === 'discover' && privacy === 'all' && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <p className="text-sm font-semibold min-w-0 truncate">
                  {pendingRequests} request{pendingRequests === 1 ? '' : 's'} awaiting approval
                </p>
              </div>
              <button
                onClick={() => setPrivacy('private')}
                className="text-xs font-bold text-primary hover:underline flex-shrink-0"
              >
                View private
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  <Skeleton className="h-28 rounded-none" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-9 w-full rounded-xl mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Error</p>
              <h3 className="font-black text-2xl tracking-tight mb-2">Failed to load groups</h3>
              <p className="text-sm text-muted-foreground font-medium">Please try again later</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
                {trimmed
                  ? 'No matches'
                  : privacy !== 'all'
                    ? `No ${privacy} groups`
                    : tab === 'mine'
                      ? 'Not a member yet'
                      : 'Nothing here'}
              </p>
              <h3 className="font-black text-2xl tracking-tight mb-2">
                {trimmed
                  ? `No groups found for “${trimmed}”`
                  : privacy !== 'all'
                    ? `No ${privacy} groups to show`
                    : tab === 'mine'
                      ? 'You haven’t joined any groups yet'
                      : 'No groups found'}
              </h3>
              <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">
                {trimmed
                  ? 'Try a different search term, or clear the privacy filter.'
                  : tab === 'mine'
                    ? 'Discover groups or create your own community.'
                    : 'Create your own group and start a community.'}
              </p>
              {!trimmed && (
                <Button
                  onClick={() => {
                    if (tab === 'mine' && privacy !== 'all') setPrivacy('all');
                    else if (tab === 'mine') setTab('discover');
                    else setCreateOpen(true);
                  }}
                  className="mt-5 rounded-xl font-bold"
                >
                  {tab === 'mine' ? 'Discover Groups' : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create a Group
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onJoin={() => handleJoin(group)}
                  onLeave={handleLeave}
                  isJoining={joiningId === group.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </MainLayout>
  );
}
