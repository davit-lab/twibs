import { useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import GroupCard from '@/components/groups/GroupCard';
import CreateGroupDialog from '@/components/groups/CreateGroupDialog';
import { useGroups, useGroupActions } from '@/hooks/useGroups';
import { Users, Search, X, Plus, Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'discover' | 'mine';
type PrivacyFilter = 'all' | 'public' | 'private';

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'discover', label: 'Discover', icon: Globe },
  { value: 'mine', label: 'My Groups', icon: Lock },
];

const PRIVACY_FILTERS: { value: PrivacyFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

export default function Groups() {
  const [tab, setTab] = useState<Tab>('discover');
  const [search, setSearch] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const { groups, isLoading, error } = useGroups(search);
  const { joinGroup, leaveGroup } = useGroupActions();

  const [joiningId, setJoiningId] = useState<string | null>(null);

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

  const handleJoin = async (groupId: string) => {
    setJoiningId(groupId);
    try {
      await joinGroup.mutateAsync(groupId);
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

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24">
        {/* Editorial hero */}
        <div className="border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary mb-4">Communities</p>
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none">Groups</h1>
              <Button onClick={() => setCreateOpen(true)} className="h-11 px-5 rounded-xl font-bold">
                <Plus className="h-4 w-4 mr-2" />
                Create Group
              </Button>
            </div>

            <div className="relative mt-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 pr-12 h-12 text-base bg-card border border-border/60 focus:border-primary/50 rounded-xl font-medium"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Stats strip */}
            <div className="mt-6 flex items-center gap-6 sm:gap-10">
              {[
                { value: counts.all, label: 'Communities' },
                { value: mine.length, label: 'Joined' },
                { value: counts.private, label: 'Private' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-black text-2xl md:text-3xl leading-none tracking-tight">{stat.value}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Underline tabs */}
        <div className="max-w-5xl mx-auto px-4 pt-5">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide border-b border-border">
            {TABS.map(({ value, label, icon: Icon }) => {
              const active = tab === value;
              const count = value === 'mine' ? mine.length : groups.length;
              return (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={cn(
                    'relative flex items-center gap-2 pb-3 text-sm font-bold whitespace-nowrap transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active && 'text-primary')} />
                  {label}
                  <span className="text-xs font-bold text-muted-foreground/70">{count}</span>
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
              );
            })}

            {/* Privacy chips */}
            <div className="flex items-center gap-1.5 ml-auto pb-2 overflow-x-auto scrollbar-hide">
              {PRIVACY_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPrivacy(f.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap',
                    privacy === f.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border/60 hover:text-foreground hover:border-border'
                  )}
                >
                  {f.label}
                  <span className="ml-1 opacity-60">{counts[f.value]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 space-y-5 pt-6">
          {/* Search meta */}
          {search.trim() && !isLoading && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {visible.length} result{visible.length === 1 ? '' : 's'} for “{search.trim()}”
            </p>
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
                {search.trim()
                  ? 'No matches'
                  : privacy !== 'all'
                    ? `No ${privacy} groups`
                    : tab === 'mine'
                      ? 'Not a member yet'
                      : 'Nothing here'}
              </p>
              <h3 className="font-black text-2xl tracking-tight mb-2">
                {search.trim()
                  ? `No groups found for “${search.trim()}”`
                  : privacy !== 'all'
                    ? `No ${privacy} groups to show`
                    : tab === 'mine'
                      ? 'You haven’t joined any groups yet'
                      : 'No groups found'}
              </h3>
              <p className="text-sm text-muted-foreground font-medium max-w-sm mx-auto">
                {search.trim()
                  ? 'Try a different search term, or clear the privacy filter.'
                  : tab === 'mine'
                    ? 'Discover groups or create your own community.'
                    : 'Create your own group and start a community.'}
              </p>
              {!search.trim() && (
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
                  onJoin={handleJoin}
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
