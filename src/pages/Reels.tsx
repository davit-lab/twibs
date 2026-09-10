import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useReels, useReelSaves, ReelsFeedType } from '@/hooks/useReels';
import { useReelsNavigation } from '@/hooks/useReelsNavigation';
import { useStories } from '@/hooks/useStories';
import { useToast } from '@/hooks/use-toast';
import { useFeedAds } from '@/hooks/useFeedAds';
import type { FeedAd } from '@/lib/ads';
import ReelCard from '@/components/reels/ReelCard';
import SponsoredReel from '@/components/reels/SponsoredReel';
import ReelCommentsSheet from '@/components/reels/ReelComments';
import ReelShareSheet from '@/components/reels/ReelShareSheet';
import ReelEmptyState from '@/components/reels/ReelEmptyState';
import AudioDetailsSheet from '@/components/reels/AudioDetailsSheet';
import FeedTabs from '@/components/reels/FeedTabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ChevronDown, ChevronUp, Eye, Heart, MessageCircle, RefreshCw, Volume2, VolumeX, X } from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

export default function Reels() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const userFilter = searchParams.get('user');
  const reelToOpen = searchParams.get('reel');
  const [feedType, setFeedType] = useState<ReelsFeedType>('foryou');
  const { uploadStory } = useStories();

  const { reels, loading, refreshing, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, currentIndex, setCurrentIndex, likeReel, incrementView } = useReels(feedType, userFilter);
  const { savedIds, toggleSave } = useReelSaves();

  const { ads } = useFeedAds(2);

  type FeedItem = { type: 'reel'; reel: typeof reels[0] } | { type: 'ad'; ad: FeedAd };
  const feedItems: FeedItem[] = [];
  let adIdx = 0;
  reels.forEach((reel, i) => {
    feedItems.push({ type: 'reel', reel });
    if ((i + 1) % 4 === 0 && adIdx < ads.length) feedItems.push({ type: 'ad', ad: ads[adIdx++] });
  });
  while (adIdx < ads.length) feedItems.push({ type: 'ad', ad: ads[adIdx++] });

  const { containerRef, goToReel } = useReelsNavigation({
    totalReels: feedItems.length,
    currentIndex,
    setCurrentIndex,
  });

  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [showShareFor, setShowShareFor] = useState<string | null>(null);
  const [audioReel, setAudioReel] = useState<typeof reels[0] | null>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setPaused(false);
  }, [feedType, setCurrentIndex]);

  useEffect(() => {
    if (userFilter) setCurrentIndex(0);
  }, [userFilter, setCurrentIndex]);

  useEffect(() => { setPaused(false); }, [currentIndex]);

  useEffect(() => {
    if (currentIndex >= feedItems.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, feedItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const jumpToReelDoneRef = useRef(false);
  useEffect(() => {
    if (!reelToOpen) {
      jumpToReelDoneRef.current = false;
      return;
    }
    if (loading || feedItems.length === 0 || jumpToReelDoneRef.current) return;

    const target = feedItems.findIndex((item) => item.type === 'reel' && item.reel.id === reelToOpen);
    if (target === -1) {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      return;
    }

    jumpToReelDoneRef.current = true;
    setCurrentIndex(target);
    setPaused(false);

    const params = new URLSearchParams(searchParams);
    params.delete('reel');
    setSearchParams(params, { replace: true });
  }, [reelToOpen, loading, feedItems, hasNextPage, isFetchingNextPage, fetchNextPage, searchParams, setSearchParams, setCurrentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'm') setMuted(m => !m);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSaveReel = (reelId: string) => {
    toggleSave(reelId);
    if (savedIds.has(reelId)) toast({ title: 'Removed from saved' });
    else toast({ title: 'Saved to collection' });
  };

  const handleShareToStory = async (reel: typeof reels[0]) => {
    if (!user) { toast({ title: 'Sign in required' }); return; }
    try {
      const response = await fetch(reel.thumbnail_url || reel.video_url);
      const blob = await response.blob();
      const file = new File([blob], 'reel-share.jpg', { type: 'image/jpeg' });
      await uploadStory(file, `Check out this reel by @${reel.profile?.username}!`);
      toast({ title: 'Shared to your story' });
    } catch { toast({ variant: 'destructive', title: 'Failed to share' }); }
  };

  const handleCopyLink = (reelId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/reels/${reelId}`);
    toast({ title: 'Link copied' });
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-5">
          <div className="h-9 w-9 animate-spin rounded-full border-[1.5px] border-white/15 border-t-white/80" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35">Reels</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35">Reels</p>
          <h2 className="mb-1.5 text-lg font-semibold">Something went wrong</h2>
          <p className="mb-5 text-sm text-white/50">{error}</p>
          <button
            onClick={() => refetch()}
            disabled={refreshing}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? 'Retrying...' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black">
        {userFilter ? (
          <div className="absolute inset-x-0 top-0 z-[60] flex items-center px-4 pt-4 sm:pt-6 pb-4">
            <Button
              variant="ghost" size="icon"
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
              aria-label="Go back"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <FeedTabs feedType={feedType} onFeedTypeChange={setFeedType} onClose={() => navigate('/')} />
        )}
        <ReelEmptyState isRefreshing={refreshing} onRefresh={() => refetch()} isFollowingFeed={feedType === 'following'} />
      </div>
    );
  }

  const shareReel = showShareFor ? reels.find(r => r.id === showShareFor) : undefined;
  const currentItem = feedItems[currentIndex];
  const currentReel = currentItem?.type === 'reel' ? currentItem.reel : undefined;
  const currentAd = currentItem?.type === 'ad' ? currentItem.ad : undefined;
  const similarAudioReels = audioReel?.audio_name
    ? reels.filter(r => r.audio_name === audioReel.audio_name && r.id !== audioReel.id)
    : [];

  return (
    <div ref={containerRef} className="relative h-screen w-full select-none overflow-hidden bg-neutral-950 text-white">
      {userFilter ? (
        <div className="absolute inset-x-0 top-0 z-[60] flex items-center px-4 pt-4 sm:pt-6 pb-4">
          <Button
            variant="ghost" size="icon"
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
            aria-label="Go back"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      ) : (
        <FeedTabs feedType={feedType} onFeedTypeChange={setFeedType} onClose={() => navigate('/')} />
      )}

      <div className="mx-auto flex h-full max-w-6xl items-center justify-center gap-6 px-0 sm:px-6">
        <div className="relative h-full w-full sm:max-w-[430px]">
          <motion.div
            drag="y"
            dragConstraints={{ top: -(feedItems.length - 1) * viewportHeight, bottom: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => {
              const { offset, velocity } = info;
              const threshold = viewportHeight * 0.16;
              if (velocity.y < -500 || offset.y < -threshold) goToReel(currentIndex + 1);
              else if (velocity.y > 500 || offset.y > threshold) goToReel(currentIndex - 1);
            }}
            animate={{ y: -currentIndex * viewportHeight }}
            transition={{ type: 'spring', stiffness: 320, damping: 36, mass: 0.85 }}
            className="relative w-full"
          >
            {feedItems.map((item, index) =>
              item.type === 'ad' ? (
                <div key={item.ad.advertisement_id} className="relative flex w-full items-center justify-center" style={{ height: viewportHeight }}>
                  <SponsoredReel ad={item.ad} isActive={index === currentIndex} />
                </div>
              ) : (
              <div key={item.reel.id} className="relative flex w-full items-center justify-center" style={{ height: viewportHeight }}>
                <ReelCard
                  reel={item.reel}
                  isActive={index === currentIndex}
                  isMuted={muted}
                  isPaused={paused}
                  isSaved={savedIds.has(item.reel.id)}
                  preload={Math.abs(index - currentIndex) <= 2 ? 'auto' : 'none'}
                  onTogglePause={() => setPaused(p => !p)}
                  onToggleMute={() => setMuted(m => !m)}
                  onLike={() => likeReel(item.reel.id)}
                  onComment={() => { setSelectedReelId(item.reel.id); setShowComments(true); }}
                  onSave={() => handleSaveReel(item.reel.id)}
                  onShare={() => setShowShareFor(item.reel.id)}
                  onOpenAudio={() => setAudioReel(item.reel)}
                  onViewIncrement={() => incrementView(item.reel.id)}
                />
              </div>
            ))}
          </motion.div>
        </div>

        <div className="hidden w-80 shrink-0 flex-col gap-3 lg:flex">
          {currentAd && (
            <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={currentAd.advertiser_avatar_url || undefined} />
                  <AvatarFallback>
                    {(currentAd.advertiser_name || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{currentAd.advertiser_name}</p>
                    {currentAd.advertiser_is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="truncate text-xs text-white/45">@{currentAd.advertiser_username}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Sponsored</span>
              </div>

              {currentAd.headline && (
                <p className="mt-3.5 text-sm font-semibold leading-relaxed text-white">{currentAd.headline}</p>
              )}
              {currentAd.description && (
                <p className="mt-1 text-[13px] leading-relaxed text-white/60">{currentAd.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Partnered content</span>
                <span className="text-sm font-medium text-white/80">{currentAd.cta || 'Learn More'}</span>
              </div>
            </aside>
          )}

          {currentReel && (
            <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Now playing</p>

              <div className="mt-3 flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={currentReel.profile?.avatar_url || defaultAvatar} />
                  <AvatarFallback>
                    {(currentReel.profile?.display_name || currentReel.profile?.username || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{currentReel.profile?.display_name || 'Unknown user'}</p>
                    {currentReel.profile?.is_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="truncate text-xs text-white/45">@{currentReel.profile?.username || 'unknown'}</p>
                </div>
              </div>

              {currentReel.caption && (
                <p className="mt-3.5 line-clamp-4 text-sm leading-relaxed text-white/75">{currentReel.caption}</p>
              )}

              <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-xs text-white/50">
                <span className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-white/40" />
                  {currentReel.like_count.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-white/40" />
                  {currentReel.comment_count.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-white/40" />
                  {currentReel.view_count.toLocaleString()}
                </span>
              </div>
            </aside>
          )}

          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Controls</p>
            <div className="mt-3 space-y-2.5 text-sm text-white/60">
              <p className="leading-relaxed">
                Scroll or press{' '}
                <kbd className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[11px] text-white/70">↓</kbd>
                <span className="mx-1 text-white/30">/</span>
                <kbd className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[11px] text-white/70">↑</kbd>{' '}
                to move between reels.
              </p>
              <p className="leading-relaxed">
                Press{' '}
                <kbd className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[11px] text-white/70">Space</kbd>{' '}
                to pause or play.
              </p>
              <p className="leading-relaxed">
                Press{' '}
                <kbd className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[11px] text-white/70">M</kbd>{' '}
                to mute or unmute.
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={() => { setSelectedReelId(currentReel?.id ?? null); setShowComments(true); }} disabled={!currentReel}>
                <MessageCircle className="h-4 w-4" />
                Comments
              </Button>
            </div>
          </aside>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
        <button
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 backdrop-blur-md transition-colors hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={() => goToReel(currentIndex - 1)}
          disabled={currentIndex === 0}
          aria-label="Previous reel"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
        <button
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 backdrop-blur-md transition-colors hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={() => goToReel(currentIndex + 1)}
          disabled={currentIndex >= feedItems.length - 1}
          aria-label="Next reel"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs backdrop-blur-md sm:flex">
        <span className="font-medium text-white/85">
          <span className="tabular-nums">{currentIndex + 1}</span>
          <span className="mx-1 text-white/40">/</span>
          <span className="tabular-nums text-white/55">{feedItems.length}</span>
        </span>
        {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-white/40" />}
      </div>

      <ReelCommentsSheet reelId={selectedReelId} open={showComments} onOpenChange={setShowComments} />

      {shareReel && (
        <ReelShareSheet
          reelId={shareReel.id}
          shareCount={shareReel.share_count}
          creatorUsername={shareReel.profile?.username || 'unknown'}
          open={!!showShareFor}
          onOpenChange={(open) => { if (!open) setShowShareFor(null); }}
          onShareToStory={() => handleShareToStory(shareReel)}
          onCopyLink={() => handleCopyLink(shareReel.id)}
        />
      )}

      <AudioDetailsSheet reel={audioReel} similarReels={similarAudioReels} open={!!audioReel} onOpenChange={(open) => !open && setAudioReel(null)} />
    </div>
  );
}
