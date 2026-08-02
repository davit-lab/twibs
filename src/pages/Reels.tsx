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
  const similarAudioReels = audioReel?.audio_name
    ? reels.filter(r => r.audio_name === audioReel.audio_name && r.id !== audioReel.id)
    : [];

  return (
    <div ref={containerRef} className="relative h-screen w-full select-none overflow-hidden bg-black">
      <FeedTabs feedType={feedType} onFeedTypeChange={setFeedType} onClose={() => navigate('/')} />

      <motion.div
        drag="y"
        dragConstraints={{ top: -(reels.length - 1) * viewportHeight, bottom: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          const { offset, velocity } = info;
          const threshold = viewportHeight * 0.18;
          if (velocity.y < -500 || offset.y < -threshold) goToReel(currentIndex + 1);
          else if (velocity.y > 500 || offset.y > threshold) goToReel(currentIndex - 1);
        }}
        animate={{ y: -currentIndex * viewportHeight }}
        transition={{ type: 'spring', stiffness: 280, damping: 32, mass: 0.9 }}
        className="relative w-full"
      >
        {reels.map((reel, index) => (
          <div key={reel.id} className="relative w-full" style={{ height: viewportHeight }}>
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
