import { useRef, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  BadgeCheck, Music2, Play, Pause, UserPlus, UserCheck, Loader2, Volume2, VolumeX, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reel } from '@/hooks/useReels';
import ReelActionBar from './ReelActionBar';
import ReelProgressBar from './ReelProgressBar';
import ReelLikersModal from './ReelLikersModal';
import DoubleTapHearts, { BurstHeart } from './DoubleTapHearts';
import ReactionBurst, { ReactionItem } from './ReactionBurst';
import OverlayStickers from './OverlayStickers';
import defaultAvatar from '@/assets/default-avatar.png';

const REACTION_EMOJIS = ['🔥', '😂', '😮', '👏', '❤️'];

interface ReelCardProps {
  reel: Reel;
  isActive: boolean;
  isMuted: boolean;
  isPaused: boolean;
  isSaved: boolean;
  preload: 'auto' | 'metadata' | 'none';
  onTogglePause: () => void;
  onToggleMute: () => void;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  onShare: () => void;
  onOpenAudio: () => void;
  onViewIncrement: () => void;
  onReaction?: (emoji: string) => void;
}

export default function ReelCard({
  reel,
  isActive,
  isMuted,
  isPaused,
  isSaved,
  preload,
  onTogglePause,
  onToggleMute,
  onLike,
  onComment,
  onSave,
  onShare,
  onOpenAudio,
  onViewIncrement,
  onReaction,
}: ReelCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [progress, setProgress] = useState(0);
  const [hearts, setHearts] = useState<BurstHeart[]>([]);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [reactionMenu, setReactionMenu] = useState(false);
  const [iconFeedback, setIconFeedback] = useState<{ icon: string; id: number } | null>(null);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [durationLabel, setDurationLabel] = useState('0:00');

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressActiveRef = useRef(false);
  const heartCleanupTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!user || !reel.user_id || user.id === reel.user_id) return;
    supabase
      .from('follows')
      .select('status')
      .eq('follower_id', user.id)
      .eq('following_id', reel.user_id)
      .maybeSingle()
      .then(({ data }) => { if (data?.status === 'accepted') setIsFollowing(true); });
  }, [user, reel.user_id]);

  const handleFollow = async () => {
    if (!user || user.id === reel.user_id) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', reel.user_id);
        setIsFollowing(false);
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: reel.user_id, status: 'accepted' });
        if (error?.code === '23505') setIsFollowing(true);
        else if (error) throw error;
        else setIsFollowing(true);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed.' });
    } finally {
      setFollowLoading(false);
    }
  };

  const lastActiveRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.muted = true;
      video.play().catch(() => {});
      if (!lastActiveRef.current) {
        lastActiveRef.current = true;
        onViewIncrement();
      }
    } else {
      video.pause();
      video.currentTime = 0;
      lastActiveRef.current = false;
    }
  }, [isActive, onViewIncrement]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    if (isPaused) video.pause();
    else video.play().catch(() => {});
  }, [isPaused, isActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    if (!isMuted && isActive && !isPaused) video.play().catch(() => {});
  }, [isMuted, isActive, isPaused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
        setDurationLabel(formatTime(video.currentTime));
      }
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, []);

  const seekToProgress = useCallback((nextProgress: number) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    video.currentTime = (nextProgress / 100) * video.duration;
    setProgress(nextProgress);
  }, []);

  const flashIcon = useCallback((icon: string) => {
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    setIconFeedback({ icon, id: Date.now() });
    iconTimeoutRef.current = setTimeout(() => setIconFeedback(null), 750);
  }, []);

  const unlockAudio = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
    onToggleMute();
    flashIcon('unmute');
  }, [onToggleMute, flashIcon]);

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMuted) {
      unlockAudio();
    } else {
      onToggleMute();
      flashIcon('mute');
    }
  };

  const spawnHeart = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setHearts(prev => [...prev.slice(-6), { id, x, y }]);
    const timer = setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== id));
      heartCleanupTimers.current.delete(timer);
    }, 1500);
    heartCleanupTimers.current.add(timer);
  }, []);

  const spawnReaction = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    setReactions(prev => [...prev.slice(-6), { id, x, y, emoji }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 1600);
    setReactionMenu(false);
    onReaction?.(emoji);
  }, [onReaction]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isActive) return;
    longPressActiveRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      longPressActiveRef.current = true;
      setReactionMenu(true);
    }, 320);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressActiveRef.current && longPressRef.current && pressStartRef.current) {
      const moved = Math.hypot(e.clientX - pressStartRef.current.x, e.clientY - pressStartRef.current.y);
      if (moved > 14) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isActive) return;
    if (longPressRef.current) clearTimeout(longPressRef.current);
    const start = pressStartRef.current;
    pressStartRef.current = null;

    if (longPressActiveRef.current) {
      longPressActiveRef.current = false;
      setReactionMenu(false);
      return;
    }

    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 14) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      return;
    }

    const { clientX, clientY } = e;
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < 320 && Math.hypot(clientX - last.x, clientY - last.y) < 48) {
      lastTapRef.current = null;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      spawnHeart(clientX, clientY);
      onLike();
      return;
    }

    lastTapRef.current = { time: now, x: clientX, y: clientY };
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      if (isMuted) {
        unlockAudio();
      } else {
        onTogglePause();
        flashIcon(isPaused ? 'play' : 'pause');
      }
    }, 280);
  };

  const cancelPress = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    longPressActiveRef.current = false;
    setReactionMenu(false);
  }, []);

  useEffect(() => () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    heartCleanupTimers.current.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black sm:rounded-[28px] sm:border sm:border-white/10">
      <video
        ref={videoRef}
        src={reel.video_url}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted
        playsInline
        autoPlay={false}
        preload={preload}
        onClick={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </div>

      <ReelProgressBar progress={progress} onSeek={seekToProgress} />

      <AnimatePresence>
        {isActive && iconFeedback && (
          <motion.div
            key={iconFeedback.id}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            >
              <motion.div
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-md"
            >
              {iconFeedback.icon === 'play' && <Play className="ml-1 h-8 w-8 text-white" fill="white" />}
              {iconFeedback.icon === 'pause' && <Pause className="h-8 w-8 text-white" fill="white" />}
              {iconFeedback.icon === 'mute' && <VolumeX className="h-7 w-7 text-white" />}
              {iconFeedback.icon === 'unmute' && <Volume2 className="h-7 w-7 text-white" />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <DoubleTapHearts hearts={hearts} />
      <ReactionBurst reactions={reactions} />

      <button
        onClick={handleMuteToggle}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        className="absolute right-3.5 top-16 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/90 backdrop-blur-md transition-colors hover:bg-black/55"
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <div className="absolute left-4 top-16 z-30 flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
        <Eye className="h-3.5 w-3.5" />
        {reel.view_count.toLocaleString()} views
        <span className="text-white/40">·</span>
        {durationLabel}
      </div>

      <OverlayStickers overlay={reel.overlay} />

      <div className="absolute bottom-0 left-0 right-16 z-10 p-4 pb-10">
        <div className="mb-2.5 flex items-center gap-3">
          <Link to={`/profile/${reel.profile?.username}`} className="flex-shrink-0">
            <Avatar className="h-11 w-11 ring-2 ring-white/25">
              <AvatarImage src={reel.profile?.avatar_url || defaultAvatar} className="object-cover" />
              <AvatarFallback className="bg-neutral-800">
                <img src={defaultAvatar} alt="" className="h-full w-full object-cover" />
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="min-w-0 flex-1">
            <Link to={`/profile/${reel.profile?.username}`} className="group flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white group-hover:underline">{reel.profile?.display_name}</span>
              {reel.profile?.is_verified && <BadgeCheck className="h-4 w-4 text-blue-400" />}
            </Link>
            <p className="text-xs text-white/55">@{reel.profile?.username}</p>
          </div>

          {user?.id !== reel.user_id && (
            <Button
              size="sm"
              variant={isFollowing ? 'outline' : 'default'}
              onClick={handleFollow}
              disabled={followLoading}
              className={cn(
                'h-8 flex-shrink-0 px-4 text-xs font-semibold rounded-lg transition-all',
                isFollowing && 'border-white/25 bg-white/10 text-white/80 hover:bg-white/20',
                !isFollowing && 'bg-white text-black hover:bg-white/90',
              )}
            >
              {followLoading ? <Loader2 className="h-3 w-3 animate-spin" />
                : isFollowing ? <UserCheck className="h-3 w-3" />
                : <UserPlus className="h-3 w-3" />}
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>

        {reel.caption && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setCaptionExpanded((value) => !value);
            }}
            className="mb-2 block w-full text-left text-sm leading-relaxed text-white/90"
          >
            <span className={captionExpanded ? '' : 'line-clamp-2'}>{reel.caption}</span>
            {reel.caption.length > 90 && (
              <span className="ml-1 text-white/55">{captionExpanded ? 'less' : 'more'}</span>
            )}
          </button>
        )}

        {reel.audio_name && (
          <button
            onClick={onOpenAudio}
            className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/85 transition-colors"
          >
            <Music2 className="h-3 w-3" />
            <span className="truncate max-w-[220px]">{reel.audio_name}</span>
          </button>
        )}
      </div>

      <ReelActionBar
        isLiked={reel.is_liked || false}
        likeCount={reel.like_count}
        commentCount={reel.comment_count}
        shareCount={reel.share_count}
        isSaved={isSaved}
        onLike={onLike}
        onComment={onComment}
        onShare={onShare}
        onSave={onSave}
        onLikers={() => setShowLikersModal(true)}
      />

      <AnimatePresence>
        {reactionMenu && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute inset-x-0 bottom-16 z-40 flex items-center justify-center"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-4 py-3 backdrop-blur-md">
              {REACTION_EMOJIS.map((emoji) => (
                <motion.button
                  key={emoji}
                  onClick={() => spawnReaction(emoji)}
                  whileHover={{ scale: 1.35, y: -6 }}
                  whileTap={{ scale: 0.85 }}
                  className="text-3xl transition-transform"
                >
                  {emoji}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReelLikersModal reelId={reel.id} open={showLikersModal} onOpenChange={setShowLikersModal} />
    </div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}
