import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X, ChevronLeft, ChevronRight, Volume2, VolumeX, Trash2, Music, Eye, Users, Loader2,
  Megaphone, ExternalLink, Heart, Send,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { blockCallOverlay, unblockCallOverlay } from '@/lib/callOverlayLayers';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import { useToast } from '@/hooks/use-toast';
import type { GroupedStories, StoryViewerProfile } from '@/hooks/useStories';
import { storyMediaFilterStyle } from '@/lib/stories';
import StoryOverlayRenderer from '@/components/stories/StoryOverlayRenderer';

interface StoryViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupedStories[];
  currentUserId: string | null;
  initialGroupIndex?: number;
  onView: (storyId: string) => void;
  onDelete: (storyId: string) => void;
  onFetchViewers: (storyId: string) => Promise<StoryViewerProfile[]>;
  onToggleLike: (storyId: string) => void;
  onReact?: (storyId: string, reaction: string) => void;
  onSendReply: (storyOwnerId: string, content: string) => Promise<unknown>;
}

const REACTIONS = ['😀', '😂', '😮', '🔥', '😍', '💜'];

const REACTION_META: Record<string, { label: string; emoji: string }> = {
  smile: { label: 'Laughing', emoji: '😂' },
  love: { label: 'Love', emoji: '💜' },
};

function getInitials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function reactionLabel(reaction: string): string {
  return REACTION_META[reaction]?.label ?? reaction ?? 'Like';
}

export default function StoryViewer({
  open,
  onOpenChange,
  groups,
  currentUserId,
  initialGroupIndex = 0,
  onView,
  onDelete,
  onFetchViewers,
  onToggleLike,
  onReact,
  onSendReply,
}: StoryViewerProps) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [dragY, setDragY] = useState(0);
  const [likeBurst, setLikeBurst] = useState<string | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerProfile[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pressStart = useRef<{ x: number; y: number; t: number; rect: DOMRect } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const adMediaRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories[storyIndex];
  const currentStoryId = currentStory?.id;
  const isOwnStory = currentGroup?.user_id === currentUserId;
  const currentAd = currentGroup?.ad ?? null;
  const isLiked = !!currentStory?.is_liked;
  const likeCount = currentStory?.like_count ?? 0;
  const currentReaction = currentStory?.reaction ?? null;
  const overlays = currentStory?.overlays ?? [];
  const mediaFilter = storyMediaFilterStyle(overlays);

  useAdImpression(adMediaRef, open ? currentAd : null, !!currentAd, 'stories');

  const handleAdCta = useCallback(async () => {
    if (!currentAd) return;
    await recordAdEvent(currentAd.campaign_id, currentAd.advertisement_id, 'click', 'stories');
    const cta = currentAd.cta || 'Learn More';
    if (cta === 'Follow' || cta === 'Visit Profile') {
      await recordAdEvent(currentAd.campaign_id, currentAd.advertisement_id, 'profile_visit', 'stories');
      onOpenChange(false);
      navigate(`/profile/${currentAd.profile_username}`);
      return;
    }
    if (cta === 'View Post' && currentAd.post_id) {
      await recordAdEvent(currentAd.campaign_id, currentAd.advertisement_id, 'profile_visit', 'stories');
      onOpenChange(false);
      navigate(`/post/${currentAd.post_id}`);
      return;
    }
    if (currentAd.cta_url) {
      await recordAdEvent(currentAd.campaign_id, currentAd.advertisement_id, 'website_click', 'stories');
      onOpenChange(false);
      window.open(currentAd.cta_url, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: 'No link available', description: 'This ad has no destination link yet.' });
    }
  }, [currentAd, navigate, onOpenChange, toast]);

  const resetTo = useCallback((gIndex: number, sIndex: number) => {
    setGroupIndex(gIndex);
    setStoryIndex(sIndex);
    setPaused(false);
    setVideoProgress(0);
    setMediaLoading(true);
    setDragY(0);
    setLikeBurst(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetTo(initialGroupIndex, 0);
  }, [open, initialGroupIndex, resetTo]);

  // Full-screen viewer takes priority over the minimized call overlay.
  useEffect(() => {
    if (!open) return;
    blockCallOverlay();
    return () => unblockCallOverlay();
  }, [open]);

  const markViewed = useCallback((storyId: string) => {
    onView(storyId);
  }, [onView]);

  const handleNext = useCallback(() => {
    const group = groups[groupIndex];
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      const nextIdx = storyIndex + 1;
      setStoryIndex(nextIdx);
      setVideoProgress(0);
      setMediaLoading(true);
      const story = group.stories[nextIdx];
      if (story && !story.is_viewed) markViewed(story.id);
    } else if (groupIndex < groups.length - 1) {
      const nextGroupIdx = groupIndex + 1;
      setGroupIndex(nextGroupIdx);
      setStoryIndex(0);
      setVideoProgress(0);
      setMediaLoading(true);
      const story = groups[nextGroupIdx]?.stories[0];
      if (story && !story.is_viewed) markViewed(story.id);
    } else {
      setPaused(false);
      onOpenChange(false);
    }
  }, [groups, groupIndex, storyIndex, markViewed, onOpenChange]);

  const handlePrev = useCallback(() => {
    const group = groups[groupIndex];
    if (!group) return;
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
      setVideoProgress(0);
      setMediaLoading(true);
    } else if (groupIndex > 0) {
      const prevGroupIdx = groupIndex - 1;
      setGroupIndex(prevGroupIdx);
      setStoryIndex(groups[prevGroupIdx].stories.length - 1);
      setVideoProgress(0);
      setMediaLoading(true);
    }
  }, [groups, groupIndex, storyIndex]);

  useEffect(() => {
    if (!open) return;
    const story = groups[groupIndex]?.stories[storyIndex];
    if (story && !story.is_viewed) markViewed(story.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupIndex, storyIndex]);

  // Pause / play video when toggled or when the story changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || deleteConfirmOpen) v.pause();
    else v.play().catch(() => { /* autoplay blocked until interaction */ });
  }, [paused, deleteConfirmOpen, currentStory?.id, open]);

  // Auto-pause when the tab/window loses focus, resume when it returns
  useEffect(() => {
    if (!open) return;
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
      else setPaused(false);
    };
    const onBlur = () => setPaused(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [open]);

  // Keyboard controls
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewersOpen) setViewersOpen(false);
        else onOpenChange(false);
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, viewersOpen, handleNext, handlePrev, onOpenChange]);

  // Fetch viewers when the sheet opens (or the story changes while open)
  useEffect(() => {
    if (!viewersOpen || !currentStoryId) return;
    let cancelled = false;
    setViewersLoading(true);
    setViewers([]);
    onFetchViewers(currentStoryId)
      .then(list => { if (!cancelled) setViewers(list); })
      .catch(() => { if (!cancelled) setViewers([]); })
      .finally(() => { if (!cancelled) setViewersLoading(false); });
    return () => { cancelled = true; };
  }, [viewersOpen, currentStoryId, onFetchViewers]);

  const handleDelete = useCallback(() => {
    if (!currentStory) return;
    setDeleteConfirmOpen(false);
    onDelete(currentStory.id);
    handleNext();
  }, [currentStory, onDelete, handleNext]);

  const handleConfirmDelete = useCallback(() => {
    setPaused(true);
    setDeleteConfirmOpen(true);
  }, []);

  const beforeMediaUnload = useCallback(() => {
    setMediaLoading(true);
  }, []);

  // Media interactions: hold to pause, tap / swipe / double-tap / swipe-down
  const handleMediaPointerDown = useCallback((e: React.PointerEvent) => {
    pressStart.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      rect: e.currentTarget.getBoundingClientRect(),
    };
    setPaused(true);
  }, []);

  const handleMediaPointerMove = useCallback((e: React.PointerEvent) => {
    const start = pressStart.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (dy > 8 && Math.abs(dy) > Math.abs(e.clientX - start.x)) {
      setDragY(Math.min(220, dy * 1.4));
    }
  }, []);

  const handleMediaPointerUp = useCallback((e: React.PointerEvent) => {
    const start = pressStart.current;
    pressStart.current = null;
    setDragY(0);
    setPaused(false);
    if (!start) return;
    const dt = performance.now() - start.t;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Swipe down to close
    if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.2 && dt < 900) {
      onOpenChange(false);
      return;
    }
    // Horizontal swipe navigates
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) handleNext(); else handlePrev();
      return;
    }
    // Tap navigation by thirds
    if (dt < 260) {
      const rect = start.rect;
      const x = e.clientX - rect.left;
      if (x < rect.width / 3) {
        handlePrev();
        return;
      }
      if (x > (rect.width * 2) / 3) {
        handleNext();
        return;
      }
      // Center tap: double-tap to like
      if (!isOwnStory && !currentAd && currentStoryId) {
        const now = performance.now();
        const prev = lastTap.current;
        if (prev && prev.id === currentStoryId && now - prev.t < 320) {
          lastTap.current = null;
          onToggleLike(currentStoryId);
          setLikeBurst(now.toString());
          window.setTimeout(() => setLikeBurst(null), 700);
        } else {
          lastTap.current = { id: currentStoryId, t: now };
        }
      }
    }
  }, [handleNext, handlePrev, isOwnStory, currentAd, currentStoryId, onToggleLike, onOpenChange]);

  const handleMediaPointerCancel = useCallback(() => {
    pressStart.current = null;
    setDragY(0);
    setPaused(false);
  }, []);

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || !currentGroup || sendingReply) return;
    setSendingReply(true);
    setReplyText('');
    try {
      await onSendReply(currentGroup.user_id, text);
      toast({
        title: 'Reply sent',
        description: `Your reply was sent as a message to ${currentGroup.user_id === currentUserId ? 'your story' : currentGroup.display_name}.`,
      });
    } catch (err) {
      setReplyText(text);
      toast({
        variant: 'destructive',
        title: "Couldn't send reply",
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSendingReply(false);
    }
  };

  const handleToggleLike = () => {
    if (!currentStoryId || isOwnStory) return;
    onToggleLike(currentStoryId);
  };

  const handleToggleLikeTab = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleLike();
    }
  };

  const handleReact = (reaction: string) => {
    if (!currentStoryId || isOwnStory || !onReact) return;
    onReact(currentStoryId, reaction);
  };

  const handleReactTab = (reaction: string) => (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleReact(reaction);
    }
  };

  const activeSegment = (story: typeof currentGroup.stories[number], i: number) => {
    if (i > storyIndex) {
      return <div className="h-full w-0 rounded-full" />;
    }
    if (i < storyIndex) {
      return <div className="h-full w-full rounded-full bg-white/80" />;
    }
    if (story.media_type === 'video') {
      return (
        <div
          className="h-full rounded-full bg-white/90 transition-[width] duration-100 ease-linear"
          style={{ width: `${videoProgress}%` }}
        />
      );
    }
    return (
      <div
        key={`${story.id}-${storyIndex}`}
        className="h-full rounded-full bg-white/90 story-progress-anim"
        style={{ animationDuration: `${story.duration || 5}s`, animationPlayState: paused ? 'paused' : 'running' }}
        onAnimationEnd={() => {
          if (groups[groupIndex]?.stories[storyIndex]?.media_type === 'image') handleNext();
        }}
      />
    );
  };

  const groupName = currentAd
    ? currentGroup?.display_name ?? 'Sponsored'
    : currentGroup?.user_id === currentUserId
      ? 'Your story'
      : currentGroup?.display_name ?? '';

  const windowStyle = { transform: dragY ? `translateY(${dragY}px)` : undefined };
  const closeHintVisible = dragY > 40;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="w-full h-[100dvh] p-0 border-none overflow-hidden bg-black"
        >
          <div className="relative h-full w-full bg-black overflow-hidden">
            {currentStory && currentGroup && (
              <>
                {/* ─── Progress ─── */}
                <div className="absolute inset-x-0 top-0 z-30 px-3 pt-[max(env(safe-area-inset-top,0px),12px)]">
                  <div className="flex gap-1.5">
                    {currentGroup.stories.map((story, i) => (
                      <div key={story.id} className="flex-1 h-[3px] rounded-full bg-white/15 overflow-hidden">
                        {activeSegment(story, i)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ─── Header ─── */}
                <div className="absolute inset-x-0 top-[max(env(safe-area-inset-top,0px),20px)] z-30 flex items-center justify-between gap-2 px-3 pt-[10px]">
                  <Link to={currentAd ? '#' : `/profile/${currentGroup.username}`} className="flex items-center gap-2.5 min-w-0">
                    <div className="flex-shrink-0 rounded-full">
                      <Avatar className="w-9 h-9 border border-black/30">
                        <AvatarImage src={currentGroup.avatar_url || undefined} />
                        <AvatarFallback className="bg-neutral-800 text-white text-sm">
                          {getInitials(currentGroup.display_name)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm leading-tight truncate">{groupName}</p>
                      {currentAd ? (
                        <p className="flex items-center gap-1 text-white/60 text-[11px] font-medium leading-tight">
                          <Megaphone className="h-3 w-3" /> Sponsored
                        </p>
                      ) : (
                        <p className="text-white/60 text-[11px] font-medium leading-tight">
                          {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </Link>

                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {isOwnStory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewersOpen(true)}
                        title="View story stats"
                        className="h-8 rounded-full text-white hover:bg-white/15 gap-1 !px-2"
                      >
                        <Eye className="h-[18px] w-[18px]" />
                        <span className="text-xs font-semibold tabular-nums">{currentStory.view_count ?? 0}</span>
                        {likeCount > 0 && (
                          <span className="flex items-center gap-1 text-xs font-semibold tabular-nums">
                            <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                            {likeCount}
                          </span>
                        )}
                      </Button>
                    )}
                    {currentStory.media_type === 'video' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMuted(!muted)}
                        className="h-8 w-8 rounded-full text-white hover:bg-white/15"
                        title={muted ? 'Unmute' : 'Mute'}
                      >
                        {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
                      </Button>
                    )}
                    {isOwnStory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleConfirmDelete}
                        className="h-8 w-8 rounded-full text-white hover:bg-white/15"
                        title="Delete story"
                      >
                        <Trash2 className="h-[18px] w-[18px]" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpenChange(false)}
                      className="h-8 w-8 rounded-full text-white hover:bg-white/15"
                      title="Close"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {/* ─── Media (interactive) ─── */}
                <div
                  ref={adMediaRef}
                  className="absolute inset-0 z-10"
                  style={{ touchAction: 'pan-y', transition: dragY ? 'none' : 'transform 0.25s ease-out', transform: dragY ? `translateY(${dragY}px)` : undefined }}
                  onPointerDown={handleMediaPointerDown}
                  onPointerMove={handleMediaPointerMove}
                  onPointerUp={handleMediaPointerUp}
                  onPointerCancel={handleMediaPointerCancel}
                >
                  <div className="relative w-full h-full" style={windowStyle}>
                    {currentStory.media_type === 'video' ? (
                      <video
                        key={currentStory.id}
                        ref={videoRef}
                        src={currentStory.media_url}
                        className="absolute inset-0 w-full h-full object-contain story-enter"
                        style={mediaFilter}
                        autoPlay
                        loop={false}
                        muted={muted || !!currentStory.music_url}
                        playsInline
                        onLoadedMetadata={e => { e.currentTarget.currentTime = 0; setMediaLoading(false); }}
                        onWaiting={beforeMediaUnload}
                        onCanPlay={() => setMediaLoading(false)}
                        onEnded={handleNext}
                        onTimeUpdate={e => {
                          const v = e.currentTarget;
                          if (v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
                        }}
                      />
                    ) : (
                      <img
                        key={currentStory.id}
                        src={currentStory.media_url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain story-enter"
                        style={mediaFilter}
                        onLoad={() => setMediaLoading(false)}
                        draggable={false}
                      />
                    )}

                    {/* Creative overlays */}
                    {overlays.length > 0 && (
                      <StoryOverlayRenderer
                        key={`${currentStory.id}-overlays`}
                        overlays={overlays}
                        className="z-[15]"
                      />
                    )}

                    {/* Double-tap burst */}
                    {likeBurst && (
                      <div key={likeBurst} className="absolute inset-0 z-[18] flex items-center justify-center pointer-events-none">
                        <Heart className="h-24 w-24 fill-red-500 text-red-500 story-burst" />
                      </div>
                    )}

                    {closeHintVisible && (
                      <div className="absolute inset-x-0 top-[max(env(safe-area-inset-top,0px),40px)] z-[19] flex justify-center pointer-events-none">
                        <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/80">Release to close</span>
                      </div>
                    )}

                    {/* Scrims for legibility only */}
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10 pointer-events-none" />

                    {mediaLoading && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center">
                        <Loader2 className="h-7 w-7 animate-spin text-white/70" />
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Caption / music ─── */}
                {(currentStory.caption || currentStory.music_url) && (
                  <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-20 flex flex-col items-center gap-2 pointer-events-none">
                    {currentStory.music_url && (
                      <>
                        <audio
                          key={`music-${currentStory.id}`}
                          src={currentStory.music_url}
                          autoPlay
                          loop
                          muted={musicMuted}
                          className="hidden"
                        />
                        {!mediaLoading && (
                          <div className="pointer-events-auto flex items-center gap-2 bg-black/50 border border-white/10 rounded-full pl-3 pr-1.5 py-1.5">
                            {!musicMuted && (
                              <span className="flex items-end gap-[2px] h-4 w-4 story-eq">
                                <span /><span /><span />
                              </span>
                            )}
                            <Music className={cn('h-4 w-4 flex-shrink-0', musicMuted ? 'text-white/40' : 'text-white')} />
                            <span className="text-white text-xs font-medium max-w-[130px] truncate">
                              {currentStory.music_name || 'Audio'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setMusicMuted(!musicMuted)}
                              className="h-7 w-7 rounded-full text-white hover:bg-white/20"
                            >
                              {musicMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    {currentStory.caption && !mediaLoading && (
                      <p className="text-white text-center text-sm font-medium max-w-full [text-shadow:0_1px_8px_rgba(0,0,0,0.65)]">
                        {currentStory.caption}
                      </p>
                    )}
                  </div>
                )}

                {currentAd && !mediaLoading && (
                  <div className="absolute inset-x-4 bottom-6 z-20 flex flex-col items-center gap-2.5 pointer-events-none">
                    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/15 bg-black/60 p-4">
                      {currentAd.headline && (
                        <p className="text-white text-base font-bold leading-snug">{currentAd.headline}</p>
                      )}
                      {(currentAd.description || currentAd.post_content) && (
                        <p className="mt-1 text-sm leading-relaxed text-white/85 line-clamp-3">{currentAd.description || currentAd.post_content}</p>
                      )}
                      {currentAd.cta && (
                        <Button
                          onClick={handleAdCta}
                          className="mt-3 h-9 w-full rounded-full bg-white text-sm font-bold text-black hover:bg-white/90"
                        >
                          {currentAd.cta}
                          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Bottom: reactions + like + reply ─── */}
                {!currentAd && !mediaLoading && (
                  <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
                    {!isOwnStory && onReact && (
                      <div className="mx-auto mb-2 flex w-full max-w-md items-center justify-center gap-0.5 rounded-full bg-black/45 px-2 py-1.5 ring-1 ring-white/10">
                        {REACTIONS.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReact(emoji)}
                            onKeyDown={handleReactTab(emoji)}
                            aria-label={`React ${emoji}`}
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-white/15',
                              currentReaction === emoji && 'bg-violet-500/25 ring-1 ring-violet-400',
                            )}
                          >
                            <span className="translate-y-px">{emoji}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={handleToggleLike}
                          onKeyDown={handleToggleLikeTab}
                          aria-label={isLiked ? `Remove reaction (${reactionLabel(currentReaction ?? 'like')})` : 'Like this story'}
                          aria-pressed={isLiked}
                          className="flex h-8 items-center gap-1 rounded-full px-1.5 text-lg transition hover:bg-white/15"
                        >
                          <Heart
                            key={`${currentStory.id}-${isLiked}`}
                            className={cn(
                              'h-5 w-5 transition-colors',
                              isLiked ? 'fill-red-500 text-red-500 story-like-pop' : 'text-white/90',
                            )}
                          />
                          {likeCount > 0 && (
                            <span className="text-xs font-semibold tabular-nums text-white">{likeCount}</span>
                          )}
                        </button>
                      </div>
                    )}

                    <div className="mx-auto flex w-full items-center gap-3 max-w-md">
                      {!isOwnStory && !onReact && (
                        <button
                          type="button"
                          onClick={handleToggleLike}
                          onKeyDown={handleToggleLikeTab}
                          className="flex items-center gap-1.5 rounded-full bg-black/45 border border-white/15 px-2.5 py-1.5 transition-colors hover:bg-black/60"
                          aria-label={isLiked ? 'Unlike this story' : 'Like this story'}
                          aria-pressed={isLiked}
                        >
                          <Heart
                            key={`${currentStory.id}-${isLiked}`}
                            className={cn(
                              'h-5 w-5 transition-colors',
                              isLiked ? 'fill-red-500 text-red-500 story-like-pop' : 'text-white'
                            )}
                          />
                          {likeCount > 0 && (
                            <span className="text-xs font-semibold tabular-nums text-white">{likeCount}</span>
                          )}
                        </button>
                      )}

                      <div className="flex-1 flex items-center gap-1.5 bg-black/45 border border-white/15 rounded-full pl-4 pr-1.5 py-1.5">
                        <input
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          onFocus={() => setPaused(true)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
                          }}
                          placeholder={`Reply to ${currentGroup.display_name}…`}
                          className="flex-1 min-w-0 bg-transparent text-white text-sm placeholder:text-white/50 focus:outline-none"
                          aria-label="Reply to this story as a message"
                        />
                        <button
                          type="button"
                          onClick={sendReply}
                          disabled={!replyText.trim() || sendingReply}
                          className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-opacity disabled:opacity-40"
                          aria-label="Send reply"
                        >
                          {sendingReply ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Nav arrows (desktop) ─── */}
                {(groupIndex > 0 || storyIndex > 0) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrev}
                    className="hidden sm:inline-flex absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 text-white hover:bg-black/60"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                {(groupIndex < groups.length - 1 || storyIndex < currentGroup.stories.length - 1) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNext}
                    className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 text-white hover:bg-black/60"
                    aria-label="Next"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Viewers sheet ─── */}
      <Sheet open={viewersOpen} onOpenChange={setViewersOpen}>
        <SheetContent
          side="bottom"
          className="p-0 gap-0 rounded-t-[1.5rem] sm:mx-auto sm:mb-4 sm:max-w-[440px] sm:rounded-[1.25rem] sm:border border-t-border overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <SheetTitle className="text-lg font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Story viewers
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                {viewersLoading ? 'Loading…' : `${viewers.length} ${viewers.length === 1 ? 'person' : 'people'} viewed your story`}
              </SheetDescription>
            </div>
          </div>

          <div className="px-5 pb-2">
            <div className="h-px bg-border" />
          </div>

          <ScrollArea className="h-[min(52dvh,420px)]">
            {viewersLoading ? (
              <div className="flex flex-col gap-2 px-4 py-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                    <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-20 rounded bg-muted/70 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : viewers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Eye className="h-8 w-8 opacity-40" />
                <p className="text-sm font-medium">No views yet</p>
                <p className="text-xs">Share your story to see who views it.</p>
              </div>
            ) : (
              <div className="py-1">
                {viewers.map(v => (
                  <Link
                    key={v.viewer_id}
                    to={`/profile/${v.username}`}
                    onClick={() => setViewersOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={v.avatar_url || undefined} alt={v.display_name} />
                      <AvatarFallback className="bg-neutral-700 text-white text-xs">
                        {getInitials(v.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{v.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">@{v.username}</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNowStrict(new Date(v.viewed_at), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ─── Delete confirmation ─── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              Your story will be removed for everyone immediately. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" onClick={() => setPaused(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`
        @keyframes story-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .story-progress-anim {
          animation-name: story-progress;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
        @keyframes story-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .story-enter {
          animation: story-enter 0.3s ease-out;
        }
        @keyframes story-like-pop {
          0% { transform: scale(1); }
          40% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .story-like-pop {
          animation: story-like-pop 0.2s ease-out;
        }
        @keyframes story-burst {
          0% { transform: scale(0.3); opacity: 0; }
          25% { transform: scale(1.15); opacity: 1; }
          60% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        .story-burst {
          animation: story-burst 0.7s ease-out forwards;
        }
        @keyframes eq-a { 0%, 100% { height: 30%; } 50% { height: 95%; } }
        @keyframes eq-b { 0%, 100% { height: 80%; } 50% { height: 25%; } }
        @keyframes eq-c { 0%, 100% { height: 45%; } 50% { height: 100%; } }
        .story-eq span {
          width: 3px;
          border-radius: 2px;
          background: white;
          display: inline-block;
          height: 100%;
        }
        .story-eq span:nth-child(1) { animation: eq-a 0.8s ease-in-out infinite; }
        .story-eq span:nth-child(2) { animation: eq-b 0.6s ease-in-out infinite; }
        .story-eq span:nth-child(3) { animation: eq-c 0.9s ease-in-out infinite; }
      `}</style>
    </>
  );
}