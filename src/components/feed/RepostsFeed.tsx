import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PostCard from './PostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Repeat, Loader2, RefreshCw } from 'lucide-react';

interface ReposterProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

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

interface RepostItem {
  post: Post;
  reposter: ReposterProfile;
  date: string;
}

interface RepostsFeedProps {
  userId: string;
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

export default function RepostsFeed({ userId, refreshTrigger, onRefreshComplete }: RepostsFeedProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<RepostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 10;

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

  const fetchReposts = useCallback(async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      let cursor: string | null = null;
      if (loadMore && items.length > 0) {
        cursor = items[items.length - 1].date;
      }

      let repostsQuery = supabase
        .from('reposts')
        .select('post_id, user_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        repostsQuery = repostsQuery.lt('created_at', cursor);
      }

      const { data: reposts } = await repostsQuery;
      if (!reposts || reposts.length === 0) {
        if (loadMore) {
          setHasMore(false);
        } else {
          setItems([]);
          setHasMore(false);
        }
        onRefreshComplete?.();
        return;
      }

      const repostIds = reposts.map(r => r.post_id);
      const reposterIds = [...new Set(reposts.map(r => r.user_id))];

      const [{ data: repostedPosts }, { data: reposterProfiles }] = await Promise.all([
        supabase.from('posts').select(POST_SELECT).in('id', repostIds),
        supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', reposterIds),
      ]);

      const postMap = new Map((repostedPosts || []).map(p => [p.id, p]));
      const profileMap = new Map((reposterProfiles || []).map(p => [p.user_id, p]));

      let nextItems: RepostItem[] = reposts
        .filter(r => postMap.has(r.post_id))
        .map(r => ({
          post: {
            ...(postMap.get(r.post_id) as Post),
            profiles: Array.isArray(postMap.get(r.post_id)?.profiles)
              ? postMap.get(r.post_id)!.profiles[0]
              : postMap.get(r.post_id)!.profiles,
            post_media: postMap.get(r.post_id)?.post_media || [],
          },
          reposter: (profileMap.get(r.user_id) || {
            username: '',
            display_name: 'Someone',
            avatar_url: null,
            is_verified: false,
          }) as ReposterProfile,
          date: r.created_at,
        }));

      const postsToAnnotate = [...new Map(nextItems.map(i => [i.post.id, i.post])).values()];
      const annotated = await attachStars(postsToAnnotate);
      const annotatedMap = new Map(annotated.map(p => [p.id, p]));
      nextItems = nextItems.map(item => ({
        ...item,
        post: annotatedMap.get(item.post.id) || item.post,
      }));

      if (loadMore) {
        setItems(prev => [...prev, ...nextItems]);
      } else {
        setItems(nextItems);
      }

      setHasMore(nextItems.length === PAGE_SIZE);
    } catch (err: unknown) {
      console.error('Reposts fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reposts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      onRefreshComplete?.();
    }
  }, [userId, items.length, onRefreshComplete, attachStars]);

  useEffect(() => {
    fetchReposts();
  }, [userId, refreshTrigger]);

  useEffect(() => {
    const channel = supabase
      .channel('reposts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reposts',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchReposts()
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'reposts',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchReposts()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const updated = payload.new as Post;
          setItems(prev => prev.map(item =>
            item.post.id === updated.id
              ? { ...item, post: { ...item.post, ...updated } }
              : item
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchReposts]);

  if (loading) {
    return (
      <div className="space-y-3">
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
          <p className="text-destructive font-semibold text-lg mb-2">Failed to load reposts</p>
          <p className="text-sm text-muted-foreground mb-6">Something went wrong. Please try again.</p>
          <Button onClick={() => fetchReposts()} className="rounded-xl gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="bg-card rounded-3xl border border-border/60 shadow-sm shadow-black/[0.03] p-8 max-w-sm mx-auto">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Repeat className="h-9 w-9 text-primary" />
            </div>
            <p className="font-bold text-xl mb-2">No reposts yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Posts this user reposts will appear here.
            </p>
          </div>
        </div>
      ) : (
        <>
          {items.map((item, index) => (
            <div key={`${item.post.id}-${item.date}`} className="animate-fade-in" style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}>
              <PostCard post={item.post} reposter={item.reposter} />
            </div>
          ))}

          {hasMore && (
            <div className="text-center py-6">
              <Button
                variant="outline"
                onClick={() => fetchReposts(true)}
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
