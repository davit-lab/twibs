import { useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSavedInterestPosts } from '@/hooks/useInterestPosts';
import { useMutedUsers } from '@/hooks/useSafety';
import InterestPostCard from './InterestPostCard';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface SavedInterestPostsProps {
  userId: string;
  isOwnProfile?: boolean;
}

export default function SavedInterestPosts({ userId, isOwnProfile = false }: SavedInterestPostsProps) {
  const { data: postsData, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSavedInterestPosts(userId);
  const queryClient = useQueryClient();
  const { data: mutedIds = [] } = useMutedUsers();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  // Real-time: refresh saved posts when a save is added/removed
  useEffect(() => {
    const channel = supabase
      .channel('saved-interest-posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interest_post_saves' },
        () => queryClient.invalidateQueries({ queryKey: ['saved-interest-posts'] })
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'interest_post_saves' },
        () => queryClient.invalidateQueries({ queryKey: ['saved-interest-posts'] })
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interest_posts' },
        () => queryClient.invalidateQueries({ queryKey: ['saved-interest-posts'] })
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
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-10">
        <h3 className="font-bold text-lg tracking-tight">No added posts yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-1.5">
          {isOwnProfile
            ? "Use the bookmark on any interest post to build your collection here."
            : "This user hasn't added any posts to their interests collection yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {posts.map((post) => (
        <InterestPostCard key={post.id} post={post} />
      ))}

      <div ref={loadMoreRef} className="py-4">
        {isFetchingNextPage && (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="text-center text-sm text-muted-foreground font-medium">
            You've seen all added posts
          </p>
        )}
      </div>
    </div>
  );
}
