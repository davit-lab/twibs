import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import PostComposer from '@/components/feed/PostComposer';
import Feed from '@/components/feed/Feed';
import StoriesBar from '@/components/stories/StoriesBar';
import PullToRefresh from '@/components/feed/PullToRefresh';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import Landing from '@/components/landing/Landing';
import WhoToFollow from '@/components/social/WhoToFollow';
import TrendingList from '@/components/social/TrendingList';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);

  // When the create dialog navigates here to compose a post, focus the composer
  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('focus-composer'));
      }, 150);
      setSearchParams({}, { replace: true });
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams]);

  const handlePostCreated = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshingFeed(true);
    setRefreshTrigger(prev => prev + 1);
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsRefreshingFeed(false);
  }, []);

  const {
    containerRef,
    pullDistance,
    isRefreshing,
    progress,
    shouldRefresh,
  } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return (
      <MainLayout>
        <PullToRefresh
          ref={containerRef}
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          progress={progress}
          shouldRefresh={shouldRefresh}
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,600px)_1fr] gap-8 px-4 pb-24 lg:pb-8">
            <div className="mx-auto w-full max-w-xl">
              <div className="border-b border-border">
                <StoriesBar />
              </div>
              <div className="p-4 border-b border-border">
                <PostComposer onPostCreated={handlePostCreated} />
              </div>
              <Feed
                refreshTrigger={refreshTrigger}
                onRefreshComplete={() => setIsRefreshingFeed(false)}
              />
            </div>

            <aside className="hidden lg:block pt-2">
              <div className="sticky top-20 space-y-5">
                <WhoToFollow />
                <TrendingList />
              </div>
            </aside>
          </div>
        </PullToRefresh>
      </MainLayout>
    );
  }

  return <Landing />;
}
