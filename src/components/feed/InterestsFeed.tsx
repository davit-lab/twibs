import { useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserInterests, useInterestCategories, useInterestActions } from '@/hooks/useInterests';
import { useInterestPosts } from '@/hooks/useInterestPosts';
import { useCreateInterestPost } from '@/hooks/useCreateInterestPost';
import { useMutedUsers } from '@/hooks/useSafety';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import InterestPostCard from './InterestPostCard';
import SavedInterestPosts from './SavedInterestPosts';
import CreatePostTrigger from './CreatePostTrigger';
import CreatePostDialog from './CreatePostDialog';
import InterestCard from '@/components/onboarding/InterestCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  PlusCircle,
  Loader2,
  Plus,
  Bookmark,
} from 'lucide-react';

interface InterestsFeedProps {
  userId: string;
  isOwnProfile?: boolean;
}

export default function InterestsFeed({ userId, isOwnProfile = false }: InterestsFeedProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests(userId);
  const { data: allCategories } = useInterestCategories();
  const { addInterest, removeInterest } = useInterestActions();

  const [createOpen, setCreateOpen] = useState(false);
  const [addInterestsOpen, setAddInterestsOpen] = useState(false);
  const [view, setView] = useState<'posts' | 'saved'>('posts');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const publish = useCreateInterestPost();

  const handlePublish = async (input: {
    content: string;
    categoryId: string;
    file: File | null;
  }) => {
    const result = await publish(input);
    if (result.ok) {
      // Reset to the unfiltered view so the new post is visible.
      setActiveCategory('all');
    }
    return result;
  };

  const ownerCategories = useMemo(
    () =>
      (userInterests
        ?.map((ui) => ui.interest_categories)
        .filter((c): c is { id: string; name: string; icon: string; color: string } => !!c) || []),
    [userInterests]
  );

  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInterestPosts(
    activeCategory !== 'all'
      ? { userId, categoryId: activeCategory }
      : { userId, includeAll: true }
  );
  const queryClient = useQueryClient();
  const { data: mutedIds = [] } = useMutedUsers();

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  const isLoading = interestsLoading || postsLoading;

  // Real-time interest posts
  useEffect(() => {
    const channel = supabase
      .channel('interest-posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interest_posts' },
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

  const interests = ownerCategories;
  const availableCategories = interests;
  const interestIds = new Set(interests.map((i) => i.id));

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

  return (
    <div className="space-y-5">
      {/* Posted / Added toggle (visible to everyone on the profile) */}
      <div className="flex gap-1 p-1 bg-muted border border-border/60 rounded-full w-fit">
        <button
          onClick={() => setView('posts')}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200',
            view === 'posts'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Posted
        </button>
        <button
          onClick={() => setView('saved')}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200',
            view === 'saved'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Added
        </button>
      </div>

      {view === 'saved' ? (
        <SavedInterestPosts userId={userId} isOwnProfile={isOwnProfile} />
      ) : (
        <>
          {/* Category filter */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 pr-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                activeCategory === 'all'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
            >
              All posts
            </button>
            {ownerCategories.map((c) => {
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={cn(
                    'inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* User's Interests Display */}
      <div className="flex flex-wrap items-center gap-2">
        {interests.map((interest) => (
          <span
            key={interest.id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-surface text-muted-foreground"
          >
            {interest.name}
          </span>
        ))}

        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setAddInterestsOpen(true)}
            aria-label="Add interest"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Create post entry (own profile) */}
      {isOwnProfile && (
        <CreatePostTrigger
          onClick={() =>
            availableCategories.length > 0 ? setCreateOpen(true) : setAddInterestsOpen(true)
          }
        />
      )}

      {/* Interest Posts List */}
      {posts.length > 0 ? (
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
                You've seen all posts
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-10">
          <h3 className="font-bold text-lg tracking-tight">No interest posts yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-1.5">
            {isOwnProfile
              ? 'Share your first post to your interests feed!'
              : 'This user has not posted any interest content yet'}
          </p>
          {isOwnProfile && availableCategories.length > 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create post
            </Button>
          )}
          {isOwnProfile && availableCategories.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setAddInterestsOpen(true)}>
              Add interests
            </Button>
          )}
        </div>
      )}

      {/* Create post dialog */}
      <CreatePostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={availableCategories}
        profile={profile}
        onPublish={handlePublish}
        onManageInterests={() => {
          setCreateOpen(false);
          setAddInterestsOpen(true);
        }}
      />

      {/* Add interests dialog */}
      <Dialog open={addInterestsOpen} onOpenChange={setAddInterestsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add interests</DialogTitle>
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

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground font-medium">
              {interests.length} {interests.length === 1 ? 'interest' : 'interests'} selected
            </p>
            <Button variant="outline" onClick={() => setAddInterestsOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
