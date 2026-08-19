import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PostCard from './PostCard';
import HomeInterestFeed from './HomeInterestFeed';
import SponsoredPost from '@/components/ads/SponsoredPost';
import { fetchFeedAds } from '@/hooks/useAds';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useMutedUsers } from '@/hooks/useSafety';
import { cn } from '@/lib/utils';
import type { FeedAd } from '@/lib/ads';

interface PostProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

interface PostMedia {
  id: string;
  url: string;
  type: string;
  alt_text: string | null;
}

interface Post {
  id: string;
  content: string;
  visibility: 'public' | 'followers' | 'private';
  star_count: number;
  comment_count: number;
  repost_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  user_id: string;
  profiles: PostProfile;
  post_media: PostMedia[];
  user_has_starred?: boolean;
}

interface FeedItem {
  type: 'post' | 'repost';
  post: Post;
  reposter?: PostProfile | null;
  date: string;
}

interface FeedAdItem {
  type: 'ad';
  ad: FeedAd;
  date: string;
}

type FeedType = 'all' | 'following' | 'interests';

interface FeedProps {
  userId?: string;
  refreshTrigger?: number;
  onRefreshComplete?: () => void;
}

const POST_SELECT = `
  id,
  content,
  visibility,
  star_count,
  comment_count,
  repost_count,
  is_pinned,
  created_at,
  updated_at,
  is_edited,
  user_id,
  profiles!inner (
    username,
    display_name,
    avatar_url,
    is_verified
  ),
  post_media (
    id,
    url,
    type,
    alt_text
  )
`;

export default function Feed({ userId, refreshTrigger, onRefreshComplete }: FeedProps) {
  const { user } = useAuth();
  const { data: mutedIds = [] } = useMutedUsers();
  const [items, setItems] = useState<(FeedItem | FeedAdItem)[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedType, setFeedType] = useState<FeedType>('all');
  
  const PAGE_SIZE = 10;
  const segmentedRef = useRef<HTMLDivElement | null>(null);
  const showFeedTabs = !userId && user;

  // Keep latest filter state available to the realtime channel (avoids stale closures)
  const feedTypeRef = useRef(feedType);
  feedTypeRef.current = feedType;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const attachStars = useCallback(async (posts: Post[]): Promise<Post[]> => {
    if (!user || posts.length === 0) return posts;
    const postIds = posts.map(p => p.id);
    const { data: stars } = await supabase
      .from('stars')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds);

    const starredPostIds = new Set(stars?.map(s => s.post_id) || []);
    return posts.map(post => ({
      ...post,
      user_has_starred: starredPostIds.has(post.id),
    }));
  }, [user]);

  const fetchPosts = useCallback(async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    if (feedType === 'interests' && !userId) {
      if (!loadMore) {
        setItems([]);
        setHasMore(false);
      }
      setLoading(false);
      setLoadingMore(false);
      onRefreshComplete?.();
      return;
    }

    try {
      let cursor: string | null = null;
      if (loadMore && items.length > 0) {
        cursor = items[items.length - 1].date;
      }

      // Resolve followed user ids once for the following feed
      let followedIds: string[] = [];
      if (!userId && feedType === 'following' && user) {
        const { data: followedUsers } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'accepted');

        followedIds = followedUsers?.map(f => f.following_id) || [];

        if (followedIds.length === 0) {
          setItems([]);
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          onRefreshComplete?.();
          return;
        }
      }

      const postsQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (userId) {
        postsQuery.eq('user_id', userId);
      } else if (feedType === 'following') {
        postsQuery.in('user_id', followedIds);
      }

      if (cursor) {
        postsQuery.lt('created_at', cursor);
      }

      const { data, error: fetchError } = await postsQuery;
      if (fetchError) throw fetchError;

      let nextItems: FeedItem[] = (data || []).map(post => ({
        type: 'post' as const,
        post: {
          ...post,
          profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
          post_media: post.post_media || [],
        },
        date: post.created_at,
      }));

      // In following mode, also surface reposts made by followed users
      if (feedType === 'following' && !userId) {
        let repostsQuery = supabase
          .from('reposts')
          .select('post_id, user_id, created_at')
          .in('user_id', followedIds)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (cursor) {
          repostsQuery = repostsQuery.lt('created_at', cursor);
        }

        const { data: reposts } = await repostsQuery;

        if (reposts && reposts.length > 0) {
          const repostIds = reposts.map(r => r.post_id);
          const reposterIds = [...new Set(reposts.map(r => r.user_id))];

          const [{ data: repostedPosts }, { data: reposterProfiles }] = await Promise.all([
            supabase.from('posts').select(POST_SELECT).in('id', repostIds).eq('hidden', false),
            supabase
              .from('profiles')
              .select('user_id, username, display_name, avatar_url, is_verified')
              .in('user_id', reposterIds),
          ]);

          const postMap = new Map((repostedPosts || []).map(p => [p.id, p]));
          const profileMap = new Map((reposterProfiles || []).map(p => [p.user_id, p]));

          const repostItems: FeedItem[] = reposts
            .filter(r => postMap.has(r.post_id))
            .map(r => ({
              type: 'repost' as const,
              post: {
                ...(postMap.get(r.post_id) as Post),
                profiles: Array.isArray(postMap.get(r.post_id)?.profiles)
                  ? postMap.get(r.post_id)!.profiles[0]
                  : postMap.get(r.post_id)!.profiles,
              },
              reposter: (profileMap.get(r.user_id) || {
                username: '',
                display_name: 'Someone',
                avatar_url: null,
                is_verified: false,
              }) as PostProfile,
              date: r.created_at,
            }));

          nextItems = [...nextItems, ...repostItems];
        }
      }

      // Hide content from muted users
      if (mutedIds.length > 0) {
        nextItems = nextItems.filter(item => !mutedIds.includes(item.post.user_id));
      }

      // Merge, sort newest-first, and slice to a full page
      nextItems = nextItems
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, PAGE_SIZE);

      const postsToAnnotate = [...new Map(nextItems.map(i => [i.post.id, i.post])).values()];
      const annotated = await attachStars(postsToAnnotate);
      const annotatedMap = new Map(annotated.map(p => [p.id, p]));
      nextItems = nextItems.map(item => ({
        ...item,
        post: annotatedMap.get(item.post.id) || item.post,
      }));

      // Pull sponsored posts into the home feeds ("For You" + "Following"), interleaved between posts.
      if (!loadMore && !userId && user && (feedType === 'all' || feedType === 'following')) {
        try {
          const ads = await fetchFeedAds(user.id, 2);
          const adItems: FeedAdItem[] = (ads || []).map((ad) => ({
            type: 'ad',
            ad,
            date: ad.post_created_at || new Date().toISOString(),
          }));
          const merged: (FeedItem | FeedAdItem)[] = [];
          nextItems.forEach((item, i) => {
            merged.push(item);
            if ((i + 1) % 4 === 0 && adItems.length > 0) {
              merged.push(adItems.shift() as FeedAdItem);
            }
          });
          if (adItems.length > 0) merged.push(...adItems);
          nextItems = merged;
        } catch (e) {
          console.error('Feed ads fetch error:', e);
        }
      }

      if (loadMore) {
        setItems(prev => [...prev, ...nextItems]);
      } else {
        setItems(nextItems);
      }

      setHasMore(nextItems.length === PAGE_SIZE);
    } catch (err: unknown) {
      console.error('Feed fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      onRefreshComplete?.();
    }
  }, [userId, user, feedType, items.length, onRefreshComplete, mutedIds, attachStars]);

  useEffect(() => {
    fetchPosts();
  }, [userId, refreshTrigger, feedType]);

  // Smooth slide for segmented control: position the slider under active tab
  useLayoutEffect(() => {
    const container = segmentedRef.current;
    if (!container) return;

    const update = () => {
      const active = container.querySelector('.segmented__tab--active') as HTMLElement | null;
      if (!active) return;
      const cRect = container.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      const left = aRect.left - cRect.left;
      const width = aRect.width;
      try {
        container.style.setProperty('--slider-x', `${left}px`);
        container.style.setProperty('--slider-w', `${width}px`);
        // debug logs to help diagnose layout races
        // eslint-disable-next-line no-console
        console.debug('[Feed] segmented slider update', { left, width });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Feed] failed to set slider vars', e);
      }
    };

    // run synchronously and again on the next frames for reliability
    update();
    requestAnimationFrame(update);
    requestAnimationFrame(() => requestAnimationFrame(update));

    // Some browsers/layouts need an extra delayed pass
    const delayed = setTimeout(update, 80);

    // Observe size changes of the container and its children
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(update);
      });
      ro.observe(container);
      // also observe each tab in case their size changes
      Array.from(container.querySelectorAll('.segmented__tab')).forEach((el) => ro?.observe(el as Element));
    } catch (e) {
      // ResizeObserver may not be available in some environments
    }
    const onResize = () => requestAnimationFrame(update);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(delayed);
      if (ro) {
        try { ro.disconnect(); } catch {}
      }
    };
  }, [feedType]);

  // Fetch a single post with its full embedded data + star state
  const fetchPostFull = useCallback(
    async (id: string): Promise<Post | null> => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', id)
        .eq('hidden', false)
        .maybeSingle();
      if (error || !data) return null;
      const post: Post = {
        ...(data as Post),
        profiles: Array.isArray((data as any).profiles)
          ? (data as any).profiles[0]
          : (data as any).profiles,
        post_media: (data as any).post_media || [],
      };
      const [annotated] = await attachStars([post]);
      return annotated || null;
    },
    [attachStars]
  );

  // Does a post belong in the currently visible feed view?
  const belongsInCurrentView = useCallback(
    async (p: Post): Promise<boolean> => {
      const currentFeed = feedTypeRef.current;
      const ownerId = userIdRef.current;
      const viewerId = user?.id;

      if (ownerId) return p.user_id === ownerId;
      if (currentFeed === 'interests') return false; // handled by HomeInterestFeed
      if (currentFeed === 'following') {
        if (!viewerId) return false;
        const { data: f } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', viewerId)
          .eq('following_id', p.user_id)
          .eq('status', 'accepted')
          .maybeSingle();
        return !!f;
      }
      return true;
    },
    [user]
  );

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          const newId = (payload.new as Post).id;
          const p = await fetchPostFull(newId);
          if (!p) return;
          if (!(await belongsInCurrentView(p))) return;
          if (mutedIds.includes(p.user_id)) return;
          setItems((prev) =>
            prev.some((item) => item.type !== 'ad' && item.post.id === p.id)
              ? prev
              : [{ type: 'post', post: p, date: p.created_at }, ...prev]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        async (payload) => {
          const updatedId = (payload.new as Post).id;
          const p = await fetchPostFull(updatedId);
          if (!p) return;
          setItems((prev) =>
            prev.some((item) => item.type !== 'ad' && item.post.id === updatedId)
              ? prev.map((item) =>
                  item.type !== 'ad' && item.post.id === updatedId ? { ...item, post: p } : item
                )
              : prev
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        (payload) =>
          setItems((prev) =>
            prev.filter((item) => item.type === 'ad' || item.post.id !== (payload.old as Post).id)
          )
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPostFull, belongsInCurrentView, mutedIds]);

  const handlePostDeleted = () => {};
  const handleStarChange = () => fetchPosts();

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {showFeedTabs && (
          <div className="flex gap-1 p-1 bg-muted border border-border/60 rounded-full w-fit">
            <div className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold">For You</div>
            <div className="px-5 py-2 rounded-full text-sm font-medium text-muted-foreground">Following</div>
            <div className="px-5 py-2 rounded-full text-sm font-medium text-muted-foreground">Interests</div>
          </div>
        )}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-2xl border border-border/60 shadow-sm shadow-black/[0.03] p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-3 pt-0.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28 rounded-lg" />
                  <Skeleton className="h-3 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-4 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
                <div className="flex gap-4 pt-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 px-4">
        <div className="glass-card p-8 max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="h-8 w-8 text-destructive" />
          </div>
          <p className="text-destructive font-semibold text-lg mb-2">Failed to load posts</p>
          <p className="text-sm text-muted-foreground mb-6">Something went wrong. Please try again.</p>
          <Button onClick={() => fetchPosts()} className="rounded-xl gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Feed Type Tabs */}
      {showFeedTabs && (
        <div ref={segmentedRef} className="segmented inline-flex gap-1 p-1 rounded-full w-fit" style={{'--slider-x': '0px' } as any}>
          <div className="segmented__slider" aria-hidden />
          <button
            onClick={() => setFeedType('all')}
            className={cn(
              "segmented__tab px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200",
              feedType === 'all'
                ? "segmented__tab--active"
                : "segmented__tab--idle"
            )}
          >
            For You
          </button>
          <button
            onClick={() => setFeedType('following')}
            className={cn(
              "segmented__tab px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200",
              feedType === 'following'
                ? "segmented__tab--active"
                : "segmented__tab--idle"
            )}
          >
            Following
          </button>
          <button
            onClick={() => setFeedType('interests')}
            className={cn(
              "segmented__tab px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200",
              feedType === 'interests'
                ? "segmented__tab--active"
                : "segmented__tab--idle"
            )}
          >
            Interests
          </button>
        </div>
      )}

      {/* Posts */}
      {feedType === 'interests' ? (
        <HomeInterestFeed />
      ) : (
        <>
          {items.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="bg-card rounded-3xl border border-border/60 shadow-sm shadow-black/[0.03] p-8 max-w-sm mx-auto">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-9 w-9 text-primary" />
                </div>
                <p className="font-bold text-xl mb-2">
                  {feedType === 'following' ? 'Your feed is empty' : 'No posts yet'}
                </p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {feedType === 'following'
                    ? 'Follow some people to see their posts here!'
                    : 'Be the first to share something with the community!'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={`${item.type}-${item.type === 'ad' ? item.ad.advertisement_id : item.post.id}-${index}`} className="animate-fade-in" style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}>
                  {item.type === 'ad' ? (
                    <SponsoredPost ad={item.ad} />
                  ) : (
                    <PostCard
                      post={item.post}
                      reposter={item.reposter}
                      onPostDeleted={handlePostDeleted}
                      onStarChange={handleStarChange}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && items.length > 0 && (
            <div className="text-center py-6">
              <Button
                variant="outline"
                onClick={() => fetchPosts(true)}
                disabled={loadingMore}
                className="gap-2 rounded-full border-border/60 px-6 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Show more'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
