import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useReels, ReelsFeedType } from '@/hooks/useReels';
import { useReelsNavigation } from '@/hooks/useReelsNavigation';
import { useStories } from '@/hooks/useStories';
import { useToast } from '@/hooks/use-toast';
import ReelCard from '@/components/reels/ReelCard';
import ReelCommentsSheet from '@/components/reels/ReelComments';
import ReelShareSheet from '@/components/reels/ReelShareSheet';
import ReelEmptyState from '@/components/reels/ReelEmptyState';
import AudioDetailsSheet from '@/components/reels/AudioDetailsSheet';
import FeedTabs from '@/components/reels/FeedTabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ChevronDown, ChevronUp, MessageCircle, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

export default function Reels() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [feedType, setFeedType] = useState<ReelsFeedType>('foryou');
  const { uploadStory } = useStories();

  const { reels, loading, refreshing, error, refetch, currentIndex, setCurrentIndex, likeReel, incrementView } = useReels(feedType);

  const { containerRef, goToReel } = useReelsNavigation({
    totalReels: reels.length,
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
  const [savedReels, setSavedReels] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentIndex(0);
    setPaused(false);
  }, [feedType, setCurrentIndex]);

  useEffect(() => { setPaused(false); }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'm') setMuted(m => !m);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSaveReel = (reelId: string) => {
    setSavedReels(prev => {
      const next = new Set(prev);
      if (next.has(reelId)) { next.delete(reelId); toast({ title: 'Removed from saved' }); }
      else { next.add(reelId); toast({ title: 'Saved to collection' }); }
      return next;
    });
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
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/40">Loading reels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="max-w-sm">
          <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
          <p className="mb-4 text-sm text-white/50">{error}</p>
          <button onClick={() => refetch()} disabled={refreshing} className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90">
            {refreshing ? 'Retrying...' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black">
        <FeedTabs feedType={feedType} onFeedTypeChange={setFeedType} onClose={() => navigate('/')} />
        <ReelEmptyState isRefreshing={refreshing} onRefresh={() => refetch()} isFollowingFeed={feedType === 'following'} />
      </div>
    );
  }

  const shareReel = showShareFor ? reels.find(r => r.id === showShareFor) : undefined;
  const currentReel = reels[currentIndex];
  const similarAudioReels = audioReel?.audio_name
    ? reels.filter(r => r.audio_name === audioReel.audio_name && r.id !== audioReel.id)
    : [];

  return (
    <div ref={containerRef} className="relative h-screen w-full select-none overflow-hidden bg-neutral-950 text-white">
      <FeedTabs feedType={feedType} onFeedTypeChange={setFeedType} onClose={() => navigate('/')} />

      <div className="mx-auto flex h-full max-w-6xl items-center justify-center gap-6 px-0 sm:px-6">
        <div className="relative h-full w-full sm:max-w-[430px]">
          <motion.div
            drag="y"
            dragConstraints={{ top: -(reels.length - 1) * viewportHeight, bottom: 0 }}
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
            {reels.map((reel, index) => (
              <div key={reel.id} className="relative flex w-full items-center justify-center" style={{ height: viewportHeight }}>
                <ReelCard
                  reel={reel}
                  isActive={index === currentIndex}
                  isMuted={muted}
                  isPaused={paused}
                  isSaved={savedReels.has(reel.id)}
                  preload={Math.abs(index - currentIndex) <= 2 ? 'auto' : 'none'}
                  onTogglePause={() => setPaused(p => !p)}
                  onToggleMute={() => setMuted(m => !m)}
                  onLike={() => likeReel(reel.id)}
                  onComment={() => { setSelectedReelId(reel.id); setShowComments(true); }}
                  onSave={() => handleSaveReel(reel.id)}
                  onShare={() => setShowShareFor(reel.id)}
                  onOpenAudio={() => setAudioReel(reel)}
                  onViewIncrement={() => incrementView(reel.id)}
                />
              </div>
            ))}
          </motion.div>
        </div>

        <div className="hidden w-80 shrink-0 space-y-4 lg:block">
          {currentReel && (
            <aside className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={currentReel.profile?.avatar_url || defaultAvatar} />
                  <AvatarFallback>
                    {(currentReel.profile?.display_name || currentReel.profile?.username || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{currentReel.profile?.display_name || 'Unknown user'}</p>
                    {currentReel.profile?.is_verified && <BadgeCheck className="h-4 w-4 text-white/80" />}
                  </div>
                  <p className="truncate text-xs text-white/50">@{currentReel.profile?.username || 'unknown'}</p>
                </div>
              </div>

              {currentReel.caption && (
                <p className="mt-4 text-sm leading-relaxed text-white/80">{currentReel.caption}</p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/[0.06] px-2 py-2">
                  <p className="text-sm font-semibold">{currentReel.like_count.toLocaleString()}</p>
                  <p className="text-[11px] text-white/45">Likes</p>
                </div>
                <div className="rounded-xl bg-white/[0.06] px-2 py-2">
                  <p className="text-sm font-semibold">{currentReel.comment_count.toLocaleString()}</p>
                  <p className="text-[11px] text-white/45">Comments</p>
                </div>
                <div className="rounded-xl bg-white/[0.06] px-2 py-2">
                  <p className="text-sm font-semibold">{currentReel.view_count.toLocaleString()}</p>
                  <p className="text-[11px] text-white/45">Views</p>
                </div>
              </div>
            </aside>
          )}

          <aside className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold">Controls</p>
            <div className="mt-3 grid gap-2 text-sm text-white/60">
              <p>Scroll or press ↓ / ↑ to move between reels.</p>
              <p>Press Space to pause or play.</p>
              <p>Press M to mute or unmute.</p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" className="gap-2" onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="secondary" size="sm" className="gap-2" onClick={() => { setSelectedReelId(currentReel?.id ?? null); setShowComments(true); }} disabled={!currentReel}>
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
          disabled={currentIndex >= reels.length - 1}
          aria-label="Next reel"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs text-white/60 backdrop-blur-md sm:flex">
        <span>{currentIndex + 1} / {reels.length}</span>
        {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
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
