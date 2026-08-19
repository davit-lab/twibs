import { useRef, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUserInterests, InterestCategory } from '@/hooks/useInterests';
import { useInterestPosts, InterestPost } from '@/hooks/useInterestPosts';
import { useMutedUsers } from '@/hooks/useSafety';
import { useFeedAds } from '@/hooks/useFeedAds';
import InterestPostCard from './InterestPostCard';
import InterestComposer from './InterestComposer';
import SponsoredPost from '@/components/ads/SponsoredPost';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Settings2, Loader2, Sparkles, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedAd } from '@/lib/ads';

type FeedItem =
  | { type: 'post'; post: InterestPost }
  | { type: 'ad'; ad: FeedAd };

export default function HomeInterestFeed() {
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests();
  const { ads } = useFeedAds(2);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories: InterestCategory[] =
    userInterests?.map((ui) => ui.interest_categories).filter((c): c is InterestCategory => !!c) ||
    [];

  const categoryIds = useMemo(() => {
    const ids = categories.map((c) => c.id);
    if (activeCategory === 'all') return ids;
    return ids.includes(activeCategory) ? [activeCategory] : ids;
  }, [categories, activeCategory]);

  const { data: postsData, isLoading: postsLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInterestPosts({
      categoryIds,
    });
  const queryClient = useQueryClient();
  const { data: mutedIds = [] } = useMutedUsers();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  const isLoading = interestsLoading || postsLoading;
  const hasInterests = !!userInterests && userInterests.length > 0;

  // Real-time interest posts
  useEffect(() => {
    const channel = supabase
      .channel('home-interest-posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interest_posts' },
        () => queryClient.invalidateQueries({ queryKey: ['interest-posts'] })
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'interest_posts' },
        () => queryClient.invalidateQueries({ queryKey: ['interest-posts'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasInterests) {
    return (
      <div className="text-center py-16 px-4">
        <div className="bg-card rounded-3xl border border-border/60 p-8 max-w-sm mx-auto">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Compass className="h-9 w-9 text-primary" />
          </div>
          <p className="font-bold text-xl mb-2">Pick some interests</p>
          <p className="text-sm text-muted-foreground mb-6">
            Choose the topics you care about to fill this feed.
          </p>
          <Button className="rounded-xl" disabled>
            Choose interests
          </Button>
        </div>
      </div>
    );
  }

  const items: FeedItem[] = [];
  let adIdx = 0;
  posts.forEach((post, i) => {
    items.push({ type: 'post', post });
    if ((i + 1) % 4 === 0 && adIdx < ads.length) {
      items.push({ type: 'ad', ad: ads[adIdx++] });
    }
  });
  while (adIdx < ads.length) {
    items.push({ type: 'ad', ad: ads[adIdx++] });
  }

  return (
    <div className="space-y-4">
      {/* Interest category chips */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 pr-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'inline-flex items-center rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200',
            activeCategory === 'all'
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
          )}
        >
          For you
        </button>

        {categories.map((c) => {
          const active = activeCategory === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200 border',
                active
                  ? 'shadow-sm'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
              style={
                active
                  ? {
                      backgroundColor: 'hsl(var(--primary) / 0.08)',
                      color: 'hsl(var(--primary))',
                      borderColor: 'hsl(var(--primary) / 0.15)',
                    }
                  : { borderColor: 'hsl(var(--primary) / 0.18)' }
              }
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              {c.name}
            </button>
          );
        })}

        <div className="sticky right-0 flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors whitespace-nowrap bg-background/95 backdrop-blur shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.2)]">
          <Settings2 className="h-4 w-4" />
          Manage
        </div>
      </div>

      <InterestComposer interests={categories} defaultCategoryId={activeCategory !== 'all' ? activeCategory : undefined} />

      {items.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="bg-card rounded-3xl border border-border/60 p-8 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Compass className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-bold text-lg mb-2">No posts in your interests yet</p>
            <p className="text-sm text-muted-foreground">
              Posts shared to your interest categories will show up here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.type}-${item.type === 'ad' ? item.ad.advertisement_id : item.post.id}-${index}`}
            >
              {item.type === 'ad' ? (
                <SponsoredPost ad={item.ad} />
              ) : (
                <InterestPostCard post={item.post} />
              )}
            </div>
          ))}
        </div>
      )}

      <div ref={loadMoreRef} className="py-4">
        {isFetchingNextPage && (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="text-center text-sm text-muted-foreground font-medium">
            You've seen all posts
          </p>
        )}
      </div>
    </div>
  );
}
