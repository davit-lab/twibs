import { useRef, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUserInterests,
  useInterestCategories,
  useInterestActions,
  InterestCategory,
} from '@/hooks/useInterests';
import { useInterestPosts, InterestPost } from '@/hooks/useInterestPosts';
import { useMutedUsers } from '@/hooks/useSafety';
import { useFeedAds } from '@/hooks/useFeedAds';
import InterestPostCard from './InterestPostCard';
import InterestPostComposer from './InterestPostComposer';
import InterestCard from '@/components/onboarding/InterestCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SponsoredPost from '@/components/ads/SponsoredPost';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedAd } from '@/lib/ads';

type FeedItem =
  | { type: 'post'; post: InterestPost }
  | { type: 'ad'; ad: FeedAd };

export default function HomeInterestFeed() {
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests();
  const { data: allCategories } = useInterestCategories();
  const { addInterest, removeInterest } = useInterestActions();
  const { ads } = useFeedAds(2);
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [manageOpen, setManageOpen] = useState(false);

  const categories: InterestCategory[] =
    userInterests?.map((ui) => ui.interest_categories).filter((c): c is InterestCategory => !!c) ||
    [];

  const interestIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);

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

  const toggleInterest = (categoryId: string) => {
    if (interestIds.has(categoryId)) {
      removeInterest.mutateAsync(categoryId).catch(() =>
        toast({ variant: 'destructive', title: 'Failed', description: 'Could not remove interest.' })
      );
    } else {
      addInterest.mutateAsync(categoryId).catch(() =>
        toast({ variant: 'destructive', title: 'Failed', description: 'Could not add interest.' })
      );
    }
  };

  const handleComposerPosted = () => {
    // Reset to the unfiltered "For you" view so the new post is visible.
    setActiveCategory('all');
  };

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
      <div className="divide-y divide-border/60">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 sm:px-5 py-4 space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-28 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            </div>
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-2/3 bg-muted rounded" />
          </div>
        ))}
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
    <div>
      {/* Sticky interest chips + inline composer */}
      <div className="sticky top-0 z-30 -mx-4 bg-background border-b border-border/70">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-4 py-2.5">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors',
              activeCategory === 'all'
                ? 'bg-foreground text-background'
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
                  'inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors',
                  active
                    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                )}
              >
                {c.name}
              </button>
            );
          })}

          <button
            onClick={() => setManageOpen(true)}
            className={cn(
              'inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
              activeCategory === 'all' ? 'ml-1' : 'ml-2'
            )}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Manage
          </button>
        </div>

        <InterestPostComposer
          onPosted={handleComposerPosted}
          onManageInterests={() => setManageOpen(true)}
        />
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <h3 className="text-lg font-bold tracking-tight">
            {hasInterests ? 'No posts in your interests yet' : 'Pick some interests'}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            {hasInterests
              ? 'Posts shared to your interest categories will show up here.'
              : 'Choose the topics you care about to fill this feed.'}
          </p>
          {!hasInterests && (
            <button
              onClick={() => setManageOpen(true)}
              className="mt-5 inline-flex items-center rounded-xl border border-border/60 bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border hover:bg-surface-2"
            >
              Choose interests
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/60">
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

          <div ref={loadMoreRef} className="px-4 py-5">
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
      )}

      {/* Manage interests dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Manage interests</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose the topics you want to see in this feed.
            </p>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[55vh] overflow-y-auto pr-1">
            {allCategories?.map((category) => (
              <InterestCard
                key={category.id}
                name={category.name}
                icon={category.icon}
                selected={interestIds.has(category.id)}
                onToggle={() => toggleInterest(category.id)}
              />
            ))}
          </div>

          <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 px-6 py-3.5 bg-background border-t border-border/60 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground font-medium">
              {categories.length} {categories.length === 1 ? 'interest' : 'interests'} selected
            </p>
            <button
              onClick={() => setManageOpen(false)}
              className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}