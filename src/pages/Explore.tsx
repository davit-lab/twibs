import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import FollowButton from '@/components/social/FollowButton';
import FollowRequests from '@/components/social/FollowRequests';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeCheck, Search, Users, Sparkles, X, Crown, Star, Eye, Play, FileText, ArrowRight, Clapperboard, Heart, MessageCircle, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useExplore, ExploreTab, ExploreUser, ExplorePost, ExploreReel } from '@/hooks/useExplore';
import { formatDistanceKm } from '@/lib/geolocation';
import { formatDistanceToNow } from 'date-fns';

const TABS: { value: ExploreTab; label: string; icon: React.ElementType }[] = [
  { value: 'all', label: 'All', icon: Sparkles },
  { value: 'reels', label: 'Reels', icon: Clapperboard },
  { value: 'posts', label: 'Posts', icon: FileText },
  { value: 'people', label: 'People', icon: Users },
];

function SectionHeader({ title, seeAll, href }: { title: string; seeAll?: () => void; href?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        {seeAll && (
          <button onClick={seeAll} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary transition-colors whitespace-nowrap">
            See all <ArrowRight className="h-3 w-3" />
          </button>
        )}
        {href && !seeAll && (
          <a href={href} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary transition-colors whitespace-nowrap">
            See all <ArrowRight className="h-3 w-3" />
          </a>
        )}
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

  return (
    <div className="group relative flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/60 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <a href={`/profile/${userProfile.username}`} className="relative flex-shrink-0">
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
          <Avatar className="h-14 w-14">
            <AvatarImage src={userProfile.avatar_url || undefined} />
            <AvatarFallback
              style={{ backgroundColor: `hsl(${hue} 40% 14%)`, color: `hsl(${hue} 85% 72%)` }}
              className="font-bold text-sm"
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </a>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <a href={`/profile/${userProfile.username}`} className="font-bold hover:text-primary transition-colors min-w-0">
            <span className="truncate">{userProfile.display_name}</span>
          </a>
          {userProfile.is_verified && <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />}
          {isPremium && <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
        </div>

        <p className="mt-0.5 text-sm leading-snug text-muted-foreground truncate">
          @{userProfile.username}
          {userProfile.bio ? ` · ${userProfile.bio}` : ''}
        </p>

        <div className="mt-2 flex items-center gap-x-2.5 gap-y-1.5 flex-wrap">
          {showDistance ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5" />
              {formatDistanceKm(userProfile.distanceKm!)}
            </span>
          ) : userProfile.location ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 text-muted-foreground text-xs font-bold px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" />
              {userProfile.location}
            </span>
          ) : null}

          <span className="text-[11px] font-semibold text-muted-foreground">
            {formatCount(userProfile.follower_count)}{' '}
            <span className="uppercase tracking-wider text-[9px]">followers</span>
          </span>
        </div>
      </div>

      <FollowButton
        targetUserId={userProfile.user_id}
        targetUsername={userProfile.username}
        isPrivateAccount={userProfile.privacy === 'private'}
        onFollowChange={onFollowChange}
        size="sm"
        className="flex-shrink-0 self-start"
      />
    </div>
  );
}

function PostCard({ post }: { post: ExplorePost }) {
  const [image, ...rest] = post.post_media?.filter(m => m.type === 'image') || [];

  return (
    <a href={`/profile/${post.profiles.username}`} className="block p-4 rounded-xl bg-card border border-border/60 transition-colors hover:border-border group">
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={post.profiles.avatar_url || undefined} />
          <AvatarFallback className="bg-surface-2 text-foreground font-bold text-xs">{post.profiles.display_name?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold truncate">{post.profiles.display_name}</span>
            {post.profiles.is_verified && <BadgeCheck className="h-3 w-3 text-primary flex-shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground font-medium">@{post.profiles.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed mb-3 line-clamp-4">{post.content}</p>
      {image && (
        <div className="relative mb-3 rounded-lg overflow-hidden bg-muted">
          <img src={image.url} alt="" className="w-full h-44 object-cover" loading="lazy" />
          {rest.length > 0 && (
            <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-mono">
              +{rest.length}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-5 text-xs text-muted-foreground pt-3 border-t border-border/60">
        <span className="flex items-center gap-1.5 font-bold"><Star className="h-3.5 w-3.5" />{post.star_count}</span>
        <span className="flex items-center gap-1.5 font-bold"><MessageCircle className="h-3.5 w-3.5" />{post.comment_count}</span>
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
    <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/5">
      {frame ? (
        <img src={frame} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
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
        'group block bg-card',
        grid ? 'overflow-hidden rounded-xl border border-border/60 transition-colors hover:border-border' : 'w-40 sm:w-48 flex-shrink-0 snap-start'
      )}
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        <ReelThumb reel={reel} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">{dur(reel.duration)}</span>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className={cn('bg-primary flex items-center justify-center shadow-lg shadow-primary/30', grid ? 'w-14 h-14 rounded-2xl' : 'w-12 h-12 rounded-full')}>
            <Play className={cn('text-white ml-0.5', grid ? 'h-6 w-6' : 'h-5 w-5')} fill="currentColor" />
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 p-2.5">
          <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">{reel.caption || 'Untitled reel'}</p>
          <p className="text-white/70 text-[10px] font-medium mt-1.5 flex items-center gap-1"><Eye className="h-3 w-3" />{reel.view_count.toLocaleString()} views</p>
        </div>
      </div>
      {!grid && (
        <div className="flex items-center gap-2 pt-2 px-0.5">
          <Avatar className="h-5 w-5 flex-shrink-0">
            <AvatarImage src={reel.profiles?.avatar_url || undefined} />
            <AvatarFallback className="bg-surface-2 text-foreground text-[9px] font-bold">{reel.profiles?.display_name?.[0] || 'U'}</AvatarFallback>
          </Avatar>
          <span className="text-[11px] font-bold truncate">{reel.profiles?.display_name}</span>
          {reel.profiles?.is_verified && <BadgeCheck className="h-3 w-3 text-primary flex-shrink-0" />}
        </div>
      )}
    </a>
  );
}

export default function Explore() {
  const { profile: currentUserProfile } = useAuth();
  const { users, posts, reels, loading, searchQuery, setSearchQuery, activeTab, setActiveTab, handleFollowChange, hasAny, viewerLocationKnown, distancesReady, distancesLoading } = useExplore();
  const trimmedQuery = searchQuery.trim();
  const counts = { people: users.length, posts: posts.length, reels: reels.length };

  const searchPlaceholder = {
    all: 'Search people, posts, reels...',
    people: 'Search people by name, username, city...',
    posts: 'Search posts...',
    reels: 'Search reels...',
  }[activeTab];

  const distanceNote = () => {
    if (distancesLoading) {
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
          <Navigation className="h-3.5 w-3.5 text-primary animate-pulse" />
          Locating people near you…
        </div>
      );
    }
    if (distancesReady && viewerLocationKnown) {
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-primary/80 mb-3">
          <Navigation className="h-3.5 w-3.5 text-primary" />
          Sorted by distance from you
        </div>
      );
    }
    return null;
  };

  const skeletons = {
    reels: <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map(i => <div key={i} className="w-40 sm:w-48 flex-shrink-0 rounded-xl bg-card border border-border/60 overflow-hidden"><Skeleton className="aspect-[9/16] rounded-none" /></div>)}</div>,
    posts: <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="p-4 rounded-xl bg-card border border-border/60 space-y-3"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div></div><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div>,
    users: <div className="divide-y divide-border/70">{[1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-4 py-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></div>
        <Skeleton className="hidden sm:block h-4 w-12" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
    ))}</div>,
  };

  const empty = (type: string) => (
    <div className="text-center py-16">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Nothing here</p>
      <h3 className="font-black text-2xl tracking-tight mb-2">No {type} found</h3>
      <p className="text-sm text-muted-foreground font-medium">{searchQuery ? 'Try a different search term' : `No ${type} to show yet`}</p>
    </div>
  );

  const reelsRail = (reels: ExploreReel[]) => (
    <div>
      <SectionHeader title="Reels" href="/reels" />
      {reels.length === 0 ? (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/60">
          <p className="text-sm font-medium text-muted-foreground">No reels to show yet</p>
          <a href="/reels" className="text-xs font-bold text-primary hover:underline">Open Reels</a>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1 -mx-1 px-1">
          {reels.map(r => <ReelCard key={r.id} reel={r} />)}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (loading) {
      if (activeTab === 'all') return <div className="space-y-9">{skeletons.reels}{skeletons.posts}{skeletons.users}</div>;
      if (activeTab === 'reels') return skeletons.reels;
      if (activeTab === 'posts') return skeletons.posts;
      return skeletons.users;
    }

    if (activeTab === 'all') {
      if (!hasAny) return empty('results');
      return (
        <div className="space-y-10">
          {reelsRail(reels.slice(0, 10))}

          {posts.length > 0 && (
            <section>
              <SectionHeader title="Popular Posts" seeAll={() => setActiveTab('posts')} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {posts.slice(0, 6).map(p => <PostCard key={p.id} post={p} />)}
              </div>
            </section>
          )}

          {users.length > 0 && (
            <section>
              <SectionHeader title="People" seeAll={() => setActiveTab('people')} />
              {distanceNote()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {users.slice(0, 4).map(u => <UserCard key={u.id} userProfile={u} onFollowChange={handleFollowChange} />)}
              </div>
            </section>
          )}
        </div>
      );
    }

    if (activeTab === 'reels') {
      return reels.length === 0
        ? empty('reels')
        : (
          <div>
            <SectionHeader title="Reels" href="/reels" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {reels.map(r => <ReelCard key={r.id} reel={r} grid />)}
            </div>
          </div>
        );
    }

    if (activeTab === 'posts') return posts.length === 0 ? empty('posts') : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{posts.map(p => <PostCard key={p.id} post={p} />)}</div>;
    return users.length === 0
      ? empty('people')
      : (
        <div>
          <SectionHeader title="People" href="/people" />
          {distanceNote()}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{users.map(u => <UserCard key={u.id} userProfile={u} onFollowChange={handleFollowChange} />)}</div>
        </div>
      );
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24">
        {/* Editorial Hero */}
        <div className="border-b border-border">
          <div className="max-w-3xl mx-auto px-4 py-10 md:py-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary mb-4">Discover</p>
            <div className="flex items-end justify-between gap-6">
              <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none">Explore</h1>
              <p className="text-muted-foreground text-sm font-medium pb-1 hidden sm:block text-right leading-relaxed">
                People, posts &amp; reels
                <br />from the community
              </p>
            </div>

            <div className="relative mt-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                className="pl-12 pr-12 h-12 text-base bg-card border border-border/60 focus:border-primary/50 rounded-xl font-medium"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>}
            </div>
          </div>
        </div>

        {/* Segmented Section Tabs */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide pr-24 lg:pr-0">
              {TABS.map(({ value, label, icon: Icon }) => {
                const active = activeTab === value;
                const count = value === 'all' ? null : counts[value as 'people' | 'posts' | 'reels'];
                return (
                  <button
                    key={value}
                    onClick={() => setActiveTab(value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200',
                      active
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
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

        <div className="max-w-3xl mx-auto px-4 space-y-6 pt-6">
          {trimmedQuery && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-muted-foreground min-w-0 truncate">
                Results for <span className="font-black text-foreground">“{trimmedQuery}”</span>
                <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
                  · {counts.people} people · {counts.posts} posts · {counts.reels} reels
                </span>
              </p>
              <button onClick={() => setSearchQuery('')} className="text-xs font-bold text-primary hover:underline flex-shrink-0">
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
