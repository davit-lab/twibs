import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import FollowButton from '@/components/social/FollowButton';
import FollowRequests from '@/components/social/FollowRequests';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X, Users, BadgeCheck, Crown, Star, Eye, Play, FileText, ArrowRight, Clapperboard, MessageCircle, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useExplore, ExploreTab, ExploreUser, ExplorePost, ExploreReel } from '@/hooks/useExplore';
import { useMutedUsers } from '@/hooks/useSafety';
import TrendingList from '@/components/social/TrendingList';
import SponsoredPost from '@/components/ads/SponsoredPost';
import { fetchFeedAds } from '@/hooks/useAds';
import { formatDistanceKm } from '@/lib/geolocation';
import { formatDistanceToNow } from 'date-fns';
import type { FeedAd } from '@/lib/ads';

const TABS: { value: ExploreTab; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: BadgeCheck },
  { value: 'reels', label: 'Reels', icon: Clapperboard },
  { value: 'posts', label: 'Posts', icon: FileText },
  { value: 'people', label: 'People', icon: Users },
];

function SectionHeader({ title, subtitle, seeAll, href }: { title: string; subtitle?: string; seeAll?: () => void; href?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight md:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {seeAll ? (
          <button
            onClick={seeAll}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap pb-0.5 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
          >
            See all <ArrowRight className="h-3 w-3" />
          </button>
        ) : href ? (
          <a
            href={href}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap pb-0.5 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
          >
            See all <ArrowRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <div className="mt-3 h-px bg-border" />
    </div>
  );
}

function getHue(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 360;
  }
  return h;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

function UserCard({ userProfile, onFollowChange }: { userProfile: ExploreUser; onFollowChange: () => void }) {
  const { data: isPremium } = usePremiumStatus(userProfile.user_id);
  const hue = getHue(userProfile.username || userProfile.display_name);
  const initials = userProfile.display_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const showDistance = userProfile.distanceKm != null;
  const href = `/profile/${userProfile.username}`;

  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-all duration-200 hover:border-primary/35 hover:shadow-md hover:shadow-primary/5 motion-safe:hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <a href={href} className="relative shrink-0">
          <div
            className={cn(
              'rounded-full transition-shadow duration-300',
              isPremium
                ? 'ring-2 ring-amber-400/50'
                : userProfile.is_verified
                  ? 'ring-2 ring-primary/40'
                  : 'ring-1 ring-border'
            )}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={userProfile.avatar_url || undefined} />
              <AvatarFallback
                style={{ backgroundColor: `hsl(${hue} 40% 14%)`, color: `hsl(${hue} 85% 72%)` }}
                className="text-sm font-bold"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a href={href} className="min-w-0 font-bold hover:text-primary transition-colors">
              <span className="truncate">{userProfile.display_name}</span>
            </a>
            {userProfile.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
            {isPremium && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">@{userProfile.username}</p>
        </div>

        <FollowButton
          targetUserId={userProfile.user_id}
          targetUsername={userProfile.username}
          isPrivateAccount={userProfile.privacy === 'private'}
          onFollowChange={onFollowChange}
          size="sm"
          className="shrink-0"
        />
      </div>

      {userProfile.bio && (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/75">{userProfile.bio}</p>
      )}

      <div className="flex items-center gap-x-2.5 gap-y-1.5 border-t border-border/60 pt-3">
        {showDistance ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            <MapPin className="h-3.5 w-3.5" />
            {formatDistanceKm(userProfile.distanceKm!)}
          </span>
        ) : userProfile.location ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" />
            {userProfile.location}
          </span>
        ) : null}

        <span className="text-[11px] font-semibold text-muted-foreground">
          {formatCount(userProfile.follower_count)}{' '}
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">followers</span>
        </span>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: ExplorePost }) {
  const [image, ...rest] = post.post_media?.filter(m => m.type === 'image') || [];
  const profiles = post.profiles || {
    username: 'unknown',
    display_name: 'Unknown User',
    avatar_url: null,
    is_verified: false,
  };

  return (
    <a href={`/profile/${profiles.username}`} className="group block rounded-2xl border border-border/60 bg-card p-4 transition-all duration-200 hover:border-primary/35 hover:shadow-md hover:shadow-primary/5 motion-safe:hover:-translate-y-0.5">
      <div className="mb-3 flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={profiles.avatar_url || undefined} />
          <AvatarFallback className="bg-surface-2 text-xs font-bold text-foreground">{profiles.display_name?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{profiles.display_name}</span>
            {profiles.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </div>
          <p className="truncate text-xs font-medium text-muted-foreground">
            @{profiles.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      <p className="mb-3 line-clamp-4 text-[15px] leading-relaxed text-foreground/90">{post.content}</p>

      {image && (
        <div className="relative mb-3 overflow-hidden rounded-xl bg-muted">
          <img src={image.url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.01]" />
          {rest.length > 0 && (
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
              +{rest.length}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-5 border-t border-border/60 pt-3 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" />{formatCount(post.star_count)}</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />{formatCount(post.comment_count)}</span>
      </div>
    </a>
  );
}

function ReelThumb({ reel }: { reel: ExploreReel }) {
  const [frame, setFrame] = useState<string | null>(reel.thumbnail_url);

  useEffect(() => {
    if (reel.thumbnail_url) {
      setFrame(reel.thumbnail_url);
      return;
    }
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = reel.video_url;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const onError = () => { if (!cancelled) cleanup(); };

    video.addEventListener('error', onError);
    video.addEventListener('loadeddata', () => {
      if (cancelled) return;
      try {
        const target = video.duration && isFinite(video.duration) ? Math.min(0.5, video.duration * 0.15) : 0.5;
        video.currentTime = target;
      } catch { /* seek unsupported */ }
    });
    video.addEventListener('seeked', () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setFrame(canvas.toDataURL('image/jpeg', 0.72));
        }
      } catch (err) {
        console.warn('Reel frame capture failed', err);
      } finally {
        cleanup();
      }
    });

    return () => { cancelled = true; cleanup(); };
  }, [reel.video_url, reel.thumbnail_url]);

  return (
    <div className="h-full w-full bg-muted">
      {frame ? (
        <img src={frame} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Play className="h-8 w-8 text-primary/40" />
        </div>
      )}
    </div>
  );
}

function ReelCard({ reel, grid }: { reel: ExploreReel; grid?: boolean }) {
  const dur = (s: number | null) => { if (!s) return '0:00'; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; };

  return (
    <a
      href="/reels"
      className={cn(
        'group block rounded-2xl border border-border/60 bg-card transition-all duration-200 hover:border-primary/40 motion-safe:hover:-translate-y-0.5',
        grid ? 'overflow-hidden' : 'w-[160px] shrink-0 snap-start sm:w-44 lg:w-48'
      )}
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        <ReelThumb reel={reel} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
        <span className="absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">{dur(reel.duration)}</span>

        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30">
            <Play className="ml-0.5 h-5 w-5 text-white" fill="currentColor" />
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white">{reel.caption || 'Untitled reel'}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-white/70">
            <Eye className="h-3 w-3" />{formatCount(reel.view_count)} views
          </p>
        </div>
      </div>

      {!grid && (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar className="h-5 w-5 shrink-0">
            <AvatarImage src={reel.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-surface-2 text-[9px] font-bold text-foreground">{reel.profiles?.display_name?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] font-semibold">{reel.profiles?.display_name}</span>
          {reel.profiles?.is_verified && <BadgeCheck className="h-3 w-3 shrink-0 text-primary" />}
        </div>
      )}
    </a>
  );
}

export default function Explore() {
  const { profile: currentUserProfile, user } = useAuth();
  const { users, posts, reels, loading, error, refetch, searchQuery, setSearchQuery, activeTab, setActiveTab, handleFollowChange, hasAny, viewerLocationKnown, distancesReady, distancesLoading } = useExplore();
  const { data: mutedIds = [] } = useMutedUsers();
  const [ads, setAds] = useState<FeedAd[]>([]);
  const visiblePosts = posts.filter(p => !mutedIds.includes(p.user_id));
  const trimmedQuery = searchQuery.trim();
  const counts = { people: users.length, posts: visiblePosts.length, reels: reels.length };

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchFeedAds(user.id, 2)
      .then((data) => { if (!cancelled) setAds((data as FeedAd[]) || []); })
      .catch((e) => console.error('Explore ads fetch error:', e));
    return () => { cancelled = true; };
  }, [user]);

  const withAds = (postCards: React.ReactNode[]) => {
    if (ads.length === 0) return postCards;
    const out: React.ReactNode[] = [];
    const pool = [...ads];
    postCards.forEach((card, i) => {
      out.push(card);
      if ((i + 1) % 4 === 0 && pool.length > 0) {
        const ad = pool.shift() as FeedAd;
        out.push(
          <div key={`ad-${ad.advertisement_id}`} className="md:col-span-2">
            <SponsoredPost ad={ad} />
          </div>
        );
      }
    });
    if (pool.length > 0) {
      const ad = pool.shift() as FeedAd;
      out.push(
        <div key={`ad-${ad.advertisement_id}`} className="md:col-span-2">
          <SponsoredPost ad={ad} />
        </div>
      );
    }
    return out;
  };

  const searchPlaceholder = {
    all: 'Search people, posts, reels...',
    people: 'Search people by name, username, city...',
    posts: 'Search posts...',
    reels: 'Search reels...',
  }[activeTab];

  const distanceNote = () => {
    if (distancesLoading) {
      return (
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Navigation className="h-3.5 w-3.5 animate-pulse text-primary" />
          Locating people near you…
        </div>
      );
    }
    if (distancesReady && viewerLocationKnown) {
      return (
        <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-primary/80">
          <MapPin className="h-3.5 w-3.5" />
          Sorted by distance from you
        </div>
      );
    }
    return null;
  };

  const skeletons = {
    reels: (
      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="w-[160px] shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card sm:w-44">
            <Skeleton className="aspect-[9/16] rounded-none" />
          </div>
        ))}
      </div>
    ),
    posts: (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="aspect-[16/9] w-full rounded-xl" />
            <div className="flex gap-5">
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          </div>
        ))}
      </div>
    ),
    users: (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
            <Skeleton className="mt-4 h-4 w-24" />
          </div>
        ))}
      </div>
    ),
  };

  const emptyState = (type: string) => {
    const searching = !!trimmedQuery;
    return (
      <div className="py-14 text-center">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
          {searching ? 'No results' : 'Nothing here'}
        </p>
        <h3 className="mb-1.5 text-xl font-black tracking-tight md:text-2xl">
          {searching ? `No ${type} match "${trimmedQuery}"` : type === 'results' ? 'Nothing to explore yet' : `No ${type} yet`}
        </h3>
        <p className="text-sm font-medium text-muted-foreground">
          {searching ? 'Try a different search term.' : 'Check back soon for something new.'}
        </p>
      </div>
    );
  };

  const reelsRail = (reelsList: ExploreReel[]) => (
    <section>
      <SectionHeader title="Reels" subtitle="Short videos from the community" href="/reels" />
      {reelsList.length === 0 ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">No reels to show yet</p>
          <a href="/reels" className="text-xs font-bold text-primary hover:underline">Open Reels</a>
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide snap-x snap-mandatory">
          {reelsList.map(r => <ReelCard key={r.id} reel={r} />)}
        </div>
      )}
    </section>
  );

  const renderContent = () => {
    if (loading) {
      if (activeTab === 'all') return <div className="space-y-10 md:space-y-12">{skeletons.reels}{skeletons.posts}{skeletons.users}</div>;
      if (activeTab === 'reels') return skeletons.reels;
      if (activeTab === 'posts') return skeletons.posts;
      return skeletons.users;
    }

    if (error && !hasAny) {
      return (
        <div className="py-16 text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">Couldn’t load</p>
          <h3 className="mb-1.5 text-xl font-black tracking-tight md:text-2xl">Something went wrong</h3>
          <p className="mb-6 text-sm font-medium text-muted-foreground">We couldn’t fetch results right now.</p>
          <Button onClick={refetch} variant="outline" className="rounded-full">Try again</Button>
        </div>
      );
    }

    if (activeTab === 'all') {
      if (!hasAny) return emptyState('results');
      return (
        <div className="space-y-10 md:space-y-12">
          {reels.length > 0 && reelsRail(reels.slice(0, 10))}

          {visiblePosts.length > 0 && (
            <section>
              <SectionHeader title="Popular posts" subtitle="What the community is posting" seeAll={() => setActiveTab('posts')} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {withAds(visiblePosts.slice(0, 6).map(p => <PostCard key={p.id} post={p} />))}
              </div>
            </section>
          )}

          {users.length > 0 && (
            <section>
              <SectionHeader title="People to discover" seeAll={() => setActiveTab('people')} />
              {distanceNote()}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {users.slice(0, 4).map(u => <UserCard key={u.id} userProfile={u} onFollowChange={handleFollowChange} />)}
              </div>
            </section>
          )}

          {!trimmedQuery && (
            <section>
              <SectionHeader title="Trending" subtitle="The posts everyone is talking about" />
              <TrendingList />
            </section>
          )}
        </div>
      );
    }

    if (activeTab === 'reels') {
      return (
        <div>
          <SectionHeader title="Reels" subtitle="Short videos from the community" href="/reels" />
          {reels.length === 0
            ? emptyState('reels')
            : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{reels.map(r => <ReelCard key={r.id} reel={r} grid />)}</div>}
        </div>
      );
    }

    if (activeTab === 'posts') {
      return visiblePosts.length === 0
        ? emptyState('posts')
        : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{withAds(visiblePosts.map(p => <PostCard key={p.id} post={p} />))}</div>;
    }

    return (
      <div>
        <SectionHeader title="People to discover" href="/people" />
        {distanceNote()}
        {users.length === 0
          ? emptyState('people')
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{users.map(u => <UserCard key={u.id} userProfile={u} onFollowChange={handleFollowChange} />)}</div>}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24 md:pb-10">
        {/* Editorial Hero */}
        <div className="border-b border-border">
          <div className="mx-auto max-w-5xl px-4 pt-9 pb-8 md:px-6 md:pt-12 md:pb-10">
            <div className="flex items-end justify-between gap-8">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">Discover</p>
                <h1 className="mt-2 text-[2.4rem] font-black leading-[1.05] tracking-tight md:text-6xl md:leading-none">Explore</h1>
                <p className="mt-3 text-[15px] text-muted-foreground md:text-base">People, posts and reels worth discovering.</p>
              </div>
              <p className="hidden max-w-[220px] pb-0.5 text-right text-[13px] leading-relaxed text-muted-foreground/70 md:block">
                A living feed from the community — reels, conversations and people, refreshed as they happen.
              </p>
            </div>

            <div className="relative mt-7">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Search Explore"
                className="h-12 rounded-xl border-border/60 bg-card pl-12 pr-12 text-base font-medium focus-visible:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Segmented Navigation */}
        <div className="sticky top-0 z-40 border-b border-border bg-background/95">
          <div className="mx-auto max-w-5xl px-4 md:px-6">
            <div className="flex items-center gap-2 overflow-x-auto py-3 pr-24 scrollbar-hide lg:pr-0">
              {TABS.map(({ value, label, icon: Icon }) => {
                const active = activeTab === value;
                const count = value === 'all' ? null : counts[value as 'people' | 'posts' | 'reels'];
                return (
                  <button
                    key={value}
                    onClick={() => setActiveTab(value)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors duration-200',
                      active
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 1.75} />
                    {label}
                    {count != null && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums',
                          active ? 'bg-background/20 text-background' : 'bg-surface-2 text-muted-foreground'
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-5xl space-y-10 px-4 pt-6 md:space-y-12 md:px-6 md:pt-8">
          {trimmedQuery && (
            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
                Results for <span className="font-black text-foreground">“{trimmedQuery}”</span>
                <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
                  · {counts.people} people · {counts.posts} posts · {counts.reels} reels
                </span>
              </p>
              <button onClick={() => setSearchQuery('')} className="shrink-0 text-xs font-bold text-primary hover:underline">
                Clear
              </button>
            </div>
          )}

          {activeTab === 'all' && currentUserProfile?.privacy === 'private' && <FollowRequests onRequestHandled={handleFollowChange} />}

          {renderContent()}
        </div>
      </div>
    </MainLayout>
  );
}