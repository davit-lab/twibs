import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { persistReelLike, useReelSaves, Reel } from '@/hooks/useReels';
import { useStories } from '@/hooks/useStories';
import { useToast } from '@/hooks/use-toast';
import ReelCard from '@/components/reels/ReelCard';
import ReelCommentsSheet from '@/components/reels/ReelComments';
import ReelShareSheet from '@/components/reels/ReelShareSheet';
import ReelEmptyState from '@/components/reels/ReelEmptyState';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function ReelDetailPage() {
  const { reelId } = useParams<{ reelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { uploadStory } = useStories();
  const { savedIds, toggleSave } = useReelSaves();

  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const likePendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchReel() {
      if (!reelId) return;
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
      try {
        const { data, error } = await supabase
          .from('reels')
          .select('*')
          .eq('id', reelId)
          .eq('is_published', true)
          .eq('hidden', false)
          .maybeSingle();
        if (error) throw error;
        if (!data) { if (!cancelled) setNotFound(true); return; }

        const [{ data: profileData }, { data: likesData }] = await Promise.all([
          supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url, is_verified')
            .eq('user_id', data.user_id)
            .maybeSingle(),
          user
            ? supabase.from('reel_likes').select('reel_id').eq('user_id', user.id)
            : Promise.resolve({ data: [] }),
        ]);

        const likedSet = new Set((likesData || []).map(l => l.reel_id));
        if (!cancelled) {
          setReel({
            ...data,
            duration: data.duration ?? 0,
            view_count: data.view_count ?? 0,
            like_count: data.like_count ?? 0,
            comment_count: data.comment_count ?? 0,
            share_count: data.share_count ?? 0,
            is_published: data.is_published ?? true,
            profile: profileData || {
              username: 'unknown',
              display_name: 'Unknown User',
              avatar_url: null,
              is_verified: false,
            },
            is_liked: likedSet.has(data.id),
          } as Reel);
        }
      } catch (e) {
        console.error('Error fetching reel:', e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchReel();
    return () => { cancelled = true; };
  }, [reelId, user, retryKey]);

  const incrementView = useCallback(async () => {
    if (!reelId) return;
    try {
      await supabase.rpc('increment_reel_views', { reel_id_input: reelId });
    } catch {
      // silent
    }
  }, [reelId]);

  useEffect(() => {
    if (reel) incrementView();
  }, [reel, incrementView]);

  const handleLike = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please sign in to like reels.' });
      return;
    }
    if (!reel) return;
    if (likePendingRef.current) return;
    likePendingRef.current = true;
    const previous = { isLiked: Boolean(reel.is_liked), likeCount: reel.like_count };
    const shouldLike = !previous.isLiked;
    setReel((current) => current && current.id === reel.id ? {
      ...current,
      is_liked: shouldLike,
      like_count: Math.max(0, current.like_count + (shouldLike ? 1 : -1)),
    } : current);
    try {
      const result = await persistReelLike(reel.id, user.id, shouldLike);
      setReel((current) => current && current.id === reel.id ? {
        ...current,
        is_liked: result.isLiked,
        like_count: result.likeCount,
      } : current);
    } catch (e) {
      console.error('Error liking reel:', e);
      setReel((current) => current && current.id === reel.id ? {
        ...current,
        is_liked: previous.isLiked,
        like_count: previous.likeCount,
      } : current);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update like' });
    } finally {
      likePendingRef.current = false;
    }
  };

  const handleSave = () => {
    if (!reel) return;
    toggleSave(reel.id);
    if (savedIds.has(reel.id)) toast({ title: 'Removed from saved' });
    else toast({ title: 'Saved to collection' });
  };

  const handleShareToStory = async () => {
    if (!user) { toast({ title: 'Sign in required' }); return; }
    if (!reel) return;
    try {
      const response = await fetch(reel.thumbnail_url || reel.video_url);
      const blob = await response.blob();
      const file = new File([blob], 'reel-share.jpg', { type: 'image/jpeg' });
      await uploadStory(file, `Check out this reel by @${reel.profile?.username}!`);
      toast({ title: 'Shared to your story' });
    } catch { toast({ variant: 'destructive', title: 'Failed to share' }); }
  };

  const handleCopyLink = () => {
    if (!reel) return;
    navigator.clipboard.writeText(`${window.location.origin}/reels/${reel.id}`);
    toast({ title: 'Link copied' });
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (loadError && !reel) {
    return (
      <div className="relative flex h-screen w-full flex-col items-center justify-center gap-4 bg-black px-6">
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 z-[60] flex h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="text-center text-sm text-white/70">Couldn’t load this reel.</p>
        <Button onClick={() => setRetryKey(k => k + 1)} variant="outline" className="rounded-full border-white/20 text-white hover:bg-white/10">
          Try again
        </Button>
      </div>
    );
  }

  if (notFound || !reel) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black">
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 z-[60] flex h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <ReelEmptyState isRefreshing={false} onRefresh={() => navigate('/reels')} />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-neutral-950 text-white">
      <Button
        variant="ghost" size="icon"
        onClick={() => navigate(-1)}
        className="absolute left-4 top-4 z-[60] flex h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="relative mx-auto h-full max-w-[430px]">
        <ReelCard
          reel={reel}
          isActive
          isMuted={muted}
          isPaused={paused}
          isSaved={savedIds.has(reel.id)}
          preload="auto"
          onTogglePause={() => setPaused(p => !p)}
          onToggleMute={() => setMuted(m => !m)}
          onLike={handleLike}
          onComment={() => setShowComments(true)}
          onSave={handleSave}
          onShare={() => setShowShare(true)}
          onOpenAudio={() => {}}
          onViewIncrement={incrementView}
        />
      </div>

      <ReelCommentsSheet reelId={reel.id} open={showComments} onOpenChange={setShowComments} />

      <ReelShareSheet
        reelId={reel.id}
        shareCount={reel.share_count}
        creatorUsername={reel.profile?.username || 'unknown'}
        open={showShare}
        onOpenChange={setShowShare}
        onShareToStory={handleShareToStory}
        onCopyLink={handleCopyLink}
      />
    </div>
  );
}
