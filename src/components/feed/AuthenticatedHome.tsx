import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import PostComposer from '@/components/feed/PostComposer';
import Feed from '@/components/feed/Feed';
import StoriesBar from '@/components/stories/StoriesBar';
import PullToRefresh from '@/components/feed/PullToRefresh';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import WhoToFollow from '@/components/social/WhoToFollow';
import ConfessionWall from '@/components/social/ConfessionWall';

export default function AuthenticatedHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [activeFeedType, setActiveFeedType] = useState<'all' | 'following' | 'interests'>('all');

  useEffect(() => {
    if (searchParams.get('compose') !== '1') return;
    const timer = setTimeout(() => window.dispatchEvent(new Event('focus-composer')), 150);
    setSearchParams({}, { replace: true });
    return () => clearTimeout(timer);
  }, [searchParams, setSearchParams]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshingFeed(true);
    setRefreshTrigger((previous) => previous + 1);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshingFeed(false);
  }, []);

  const { containerRef, pullDistance, isRefreshing, progress, shouldRefresh } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  return (
    <MainLayout>
      <PullToRefresh
        ref={containerRef}
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        progress={progress}
        shouldRefresh={shouldRefresh}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pb-24 lg:grid-cols-[minmax(0,600px)_1fr] lg:pb-8">
          <div className="mx-auto w-full max-w-xl">
            <div className="border-b border-border">
              <StoriesBar />
            </div>
            {activeFeedType !== 'interests' && (
              <div className="border-b border-border p-4">
                <PostComposer onPostCreated={() => setRefreshTrigger((previous) => previous + 1)} />
              </div>
            )}
            <Feed
              refreshTrigger={refreshTrigger}
              onRefreshComplete={() => setIsRefreshingFeed(false)}
              onFeedTypeChange={setActiveFeedType}
            />
          </div>

          <aside className="hidden pt-2 lg:block">
            <div className="sticky top-20 space-y-5">
              <WhoToFollow />
              <ConfessionWall />
            </div>
          </aside>
        </div>
      </PullToRefresh>
    </MainLayout>
  );
}
