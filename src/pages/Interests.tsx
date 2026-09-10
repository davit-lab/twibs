import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import InterestPostCard from '@/components/feed/InterestPostCard';
import InterestCard from '@/components/onboarding/InterestCard';
import CreatePostTrigger from '@/components/feed/CreatePostTrigger';
import CreatePostDialog from '@/components/feed/CreatePostDialog';
import {
  useUserInterests,
  useInterestCategories,
  useInterestActions,
} from '@/hooks/useInterests';
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
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Interests() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests(user?.id);
  const { data: allCategories } = useInterestCategories();
  const { saveInterests } = useInterestActions();
  const publish = useCreateInterestPost();
  const { data: mutedIds = [] } = useMutedUsers();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSelection, setManageSelection] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const interestCategories = useMemo(
    () =>
      (userInterests
        ?.map((ui) => ui.interest_categories)
        .filter((c): c is { id: string; name: string; icon: string; color: string } => !!c) || []),
    [userInterests]
  );

  const activeCategoryIds = useMemo(() => {
    if (activeCategory === 'all') return interestCategories.map((c) => c.id);
    if (!interestCategories.some((c) => c.id === activeCategory)) return interestCategories.map((c) => c.id);
    return [activeCategory];
  }, [activeCategory, interestCategories]);

  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInterestPosts({
    categoryIds: activeCategoryIds,
    limit: 12,
  });

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  // Real-time interest posts
  useEffect(() => {
    const channel = supabase
      .channel('interests-page-realtime')
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

  const handlePublish = async ({
    content,
    categoryId,
    file,
  }: {
    content: string;
    categoryId: string;
    file: File | null;
  }): Promise<{ ok: boolean; error?: string }> => {
    const result = await publish({ content, categoryId, file });
    if (result.ok) {
      setActiveCategory('all');
    }
    return result;
  };

  const handleCreateClick = () => {
    if (interestCategories.length === 0) {
      openManage();
      return;
    }
    setCreateOpen(true);
  };

  const openManage = () => {
    setManageSelection(userInterests?.map((ui) => ui.category_id) || []);
    setManageOpen(true);
  };

  const toggleManage = (id: string) => {
    setManageSelection((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSaveInterests = async () => {
    await saveInterests.mutateAsync(manageSelection);
    setManageOpen(false);
  };

  const categoryChips = [
    { id: 'all', name: 'For you' },
    ...interestCategories,
  ];

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-28">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 px-4 pt-5 pb-4 border-b border-border/70">
            <div className="min-w-0">
              <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight leading-tight">
                Interests
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Posts from the topics you follow.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={openManage}
              className="shrink-0 -mr-2 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Manage
            </Button>
          </header>

{/* Category filter (scrolls away) */}
          <div className="border-b border-border/70">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-4 py-2.5">
                {categoryChips.map((chip) => {
                  const active = activeCategory === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setActiveCategory(chip.id)}
                      className={cn(
                        'inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                        chip.id === 'all'
                          ? active
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                          : active
                            ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25'
                            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                      )}
                    >
                      {chip.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Composer — stays visible while scrolling */}
            <div className="sticky top-0 z-30 bg-background border-b border-border/70 px-4 py-2.5">
              <CreatePostTrigger
                onClick={handleCreateClick}
                avatarUrl={profile?.avatar_url}
                displayName={profile?.display_name}
              />
            </div>

          {/* Feed */}
          {postsLoading || interestsLoading ? (
            <div className="mt-2 divide-y divide-border/60">
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
                  <div className="h-44 w-full bg-muted rounded-xl" />
                </div>
              ))}
            </div>
          ) : posts.length > 0 ? (
            <div className="mt-2 divide-y divide-border/60">
              {posts.map((post) => (
                <InterestPostCard key={post.id} post={post} />
              ))}

              <div ref={loadMoreRef} className="px-4 py-5">
                {isFetchingNextPage && (
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!hasNextPage && (
                  <p className="text-center text-sm text-muted-foreground font-medium">
                    You're all caught up
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-6 py-20 text-center">
              <h3 className="text-lg font-bold tracking-tight">
                {interestCategories.length === 0 ? 'No interests yet' : 'Nothing here yet'}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                {interestCategories.length === 0
                  ? "Pick a few things you love and we'll fill this space with posts and discussions."
                  : 'There are no posts from these interests yet. Be the first to start one.'}
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={interestCategories.length === 0 ? openManage : handleCreateClick}
              >
                {interestCategories.length === 0 ? 'Choose interests' : 'Create a post'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create post dialog */}
      <CreatePostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={interestCategories}
        profile={profile}
        onPublish={handlePublish}
        onManageInterests={() => {
          setCreateOpen(false);
          openManage();
        }}
      />

      {/* Manage interests dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Manage interests</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose the topics you want to see in your feed.
            </p>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[55vh] overflow-y-auto pr-1">
            {allCategories?.map((category) => (
              <InterestCard
                key={category.id}
                name={category.name}
                icon={category.icon}
                selected={manageSelection.includes(category.id)}
                onToggle={() => toggleManage(category.id)}
              />
            ))}
          </div>

          <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 px-6 py-3.5 bg-background border-t border-border/60 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground font-medium">
              {manageSelection.length} {manageSelection.length === 1 ? 'interest' : 'interests'} selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setManageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveInterests}
                disabled={manageSelection.length === 0 || saveInterests.isPending}
              >
                {saveInterests.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}