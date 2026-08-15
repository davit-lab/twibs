import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, Trash2, Music, Eye, Users, Loader2, Megaphone, ExternalLink,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import { useToast } from '@/hooks/use-toast';
import type { GroupedStories, StoryViewerProfile } from '@/hooks/useStories';

interface StoryViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupedStories[];
  currentUserId: string | null;
  initialGroupIndex?: number;
  onView: (storyId: string) => void;
  onDelete: (storyId: string) => void;
  onFetchViewers: (storyId: string) => Promise<StoryViewerProfile[]>;
}

function getInitials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
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
}: StoryViewerProps) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerProfile[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const adMediaRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories[storyIndex];
  const currentStoryId = currentStory?.id;
  const isOwnStory = currentGroup?.user_id === currentUserId;
  const currentAd = currentGroup?.ad ?? null;

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
  }, []);

  useEffect(() => {
    if (!open) return;
    resetTo(initialGroupIndex, 0);
  }, [open, initialGroupIndex, resetTo]);

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
      const story = group.stories[nextIdx];
      if (story && !story.is_viewed) markViewed(story.id);
    } else if (groupIndex < groups.length - 1) {
      const nextGroupIdx = groupIndex + 1;
      setGroupIndex(nextGroupIdx);
      setStoryIndex(0);
      setVideoProgress(0);
      const story = groups[nextGroupIdx]?.stories[0];
      if (story && !story.is_viewed) markViewed(story.id);
    } else {
      onOpenChange(false);
    }
  }, [groups, groupIndex, storyIndex, markViewed, onOpenChange]);

  const handlePrev = useCallback(() => {
    const group = groups[groupIndex];
    if (!group) return;
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
      setVideoProgress(0);
    } else if (groupIndex > 0) {
      const prevGroupIdx = groupIndex - 1;
      setGroupIndex(prevGroupIdx);
      setStoryIndex(groups[prevGroupIdx].stories.length - 1);
      setVideoProgress(0);
    }
  }, [groups, groupIndex, storyIndex]);

  const jumpToGroup = useCallback((target: number) => {
    if (target === groupIndex) return;
    setGroupIndex(target);
    setStoryIndex(0);
    setPaused(false);
    setVideoProgress(0);
    const story = groups[target]?.stories[0];
    if (story && !story.is_viewed) markViewed(story.id);
  }, [groups, groupIndex, markViewed]);

  useEffect(() => {
    if (!open) return;
    const story = groups[groupIndex]?.stories[storyIndex];
    if (story && !story.is_viewed) markViewed(story.id);
  }, [open, groupIndex, storyIndex, groups, markViewed]);

  // Pause / play video when toggled or when the story changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => { /* autoplay blocked until interaction */ });
  }, [paused, currentStory?.id, open]);

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
    onDelete(currentStory.id);
    handleNext();
  }, [currentStory, onDelete, handleNext]);

  const activeSegment = (story: typeof currentGroup.stories[number], i: number) => {
    if (i > storyIndex) {
      return <div className="h-full w-0 rounded-full" />;
    }
    if (i < storyIndex) {
      return <div className="h-full w-full rounded-full bg-white/90" />;
    }
    if (story.media_type === 'video') {
      return (
        <div
          className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear"
          style={{ width: `${videoProgress}%` }}
        />
      );
    }
    return (
      <div
        key={`${story.id}-${storyIndex}`}
        className="h-full rounded-full bg-gradient-to-r from-white via-white to-white/70 story-progress-anim"
        style={{ animationDuration: `${story.duration || 5}s`, animationPlayState: paused ? 'paused' : 'running' }}
        onAnimationEnd={() => {
          if (groups[groupIndex]?.stories[storyIndex]?.media_type === 'image') handleNext();
        }}
      />
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="w-full h-[100dvh] sm:h-[92vh] sm:max-h-[860px] max-w-[430px] p-0 border-none overflow-hidden sm:rounded-[2rem] bg-transparent sm:ring-1 sm:ring-white/10 sm:shadow-[0_50px_140px_rgba(0,0,0,0.85)]"
        >
          <div className="relative h-full w-full bg-[radial-gradient(130%_130%_at_50%_0%,#241e38_0%,#0e0c17_55%,#05050a_100%)] overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(90%_70%_at_50%_50%,transparent_35%,rgba(0,0,0,0.65)_100%)]" />

            {currentStory && currentGroup && (
              <>
                {/* ─── Top: progress + header ─── */}
                <div className="absolute inset-x-0 top-0 z-30 px-3 pt-[max(env(safe-area-inset-top,0px),12px)]">
                  <div className="flex gap-1.5">
                    {currentGroup.stories.map((story, i) => (
                      <div key={story.id} className="flex-1 h-[3px] rounded-full bg-white/20 overflow-hidden">
                        {activeSegment(story, i)}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Link to={`/profile/${currentGroup.username}`} className="flex items-center gap-2.5 min-w-0 group">
                      <div className="p-[2px] rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-primary/50 flex-shrink-0 group-hover:brightness-110 transition">
                        <div className="p-[1.5px] rounded-full bg-black/50">
                          <Avatar className="w-9 h-9">
                            <AvatarImage src={currentGroup.avatar_url || undefined} />
                            <AvatarFallback className="bg-neutral-800 text-white text-sm">
                              {getInitials(currentGroup.display_name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm leading-tight truncate">
                          {currentAd ? currentGroup.display_name : currentGroup.user_id === currentUserId ? 'Your story' : currentGroup.display_name}
                        </p>
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

                    <div className="flex items-center gap-1 bg-black/45 backdrop-blur-md rounded-full p-1 flex-shrink-0">
                      {isOwnStory && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewersOpen(true)}
                          title="View story views"
                          className="h-8 w-8 rounded-full text-white hover:bg-white/20 gap-1 !px-2"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="text-xs font-semibold tabular-nums">
                            {currentStory.view_count ?? 0}
                          </span>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setPaused(!paused)} className="h-8 w-8 rounded-full text-white hover:bg-white/20" title={paused ? 'Play' : 'Pause'}>
                        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                      {currentStory.media_type === 'video' && (
                        <Button variant="ghost" size="icon" onClick={() => setMuted(!muted)} className="h-8 w-8 rounded-full text-white hover:bg-white/20" title={muted ? 'Unmute' : 'Mute'}>
                          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                      )}
                      {isOwnStory && (
                        <Button variant="ghost" size="icon" onClick={handleDelete} className="h-8 w-8 rounded-full text-white hover:bg-destructive/80" title="Delete story">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8 rounded-full text-white hover:bg-white/20" title="Close">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ─── Media ─── */}
                <div
                  className="absolute inset-0 z-10"
                  onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                  onTouchEnd={e => {
                    if (touchStartX.current == null) return;
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    touchStartX.current = null;
                    if (Math.abs(dx) > 50) {
                      if (dx < 0) handleNext(); else handlePrev();
                    }
                  }}
                >
                  <div ref={adMediaRef} className="relative w-full h-full overflow-hidden bg-black">
                    <div className="absolute -inset-6 z-0 bg-primary/20 blur-3xl opacity-20 pointer-events-none" />

                    {currentStory.media_type === 'video' ? (
                      <video
                        key={currentStory.id}
                        ref={videoRef}
                        src={currentStory.media_url}
                        className="absolute inset-0 w-full h-full object-cover story-enter"
                        autoPlay
                        loop={false}
                        muted={muted || !!currentStory.music_url}
                        playsInline
                        onEnded={handleNext}
                        onTimeUpdate={e => {
                          const v = e.currentTarget;
                          if (v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
                        }}
                        onLoadedMetadata={e => e.currentTarget.currentTime = 0}
                      />
                    ) : (
                      <img
                        key={currentStory.id}
                        src={currentStory.media_url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover story-kenburns story-enter"
                        draggable={false}
                      />
                    )}

                    {/* Scrims */}
                    <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/10 to-transparent z-10" />
                    <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-10" />

                    {/* Caption + music */}
                    {(currentStory.caption || currentStory.music_url) && (
                      <div className="absolute inset-x-4 bottom-28 z-20 flex flex-col items-center gap-2 pointer-events-none">
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
                            <div className="pointer-events-auto flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full pl-3 pr-1.5 py-1.5">
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
                          </>
                        )}

                        {currentStory.caption && (
                          <p className="text-white text-center text-sm font-medium bg-black/45 backdrop-blur-sm rounded-full px-4 py-1.5 max-w-full">
                            {currentStory.caption}
                          </p>
                        )}
                      </div>
                    )}

                    {currentAd && (
                      <div className="absolute inset-x-4 bottom-24 z-20 flex flex-col items-center gap-2.5 pointer-events-none">
                        <div className="pointer-events-auto w-full rounded-2xl border border-white/15 bg-black/55 backdrop-blur-xl p-4">
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

                    {/* Tap zones */}
                    <button onClick={handlePrev} className="absolute left-0 top-1/3 bottom-1/3 w-1/4 z-10 cursor-pointer" aria-label="Previous story" />
                    <button onClick={handleNext} className="absolute right-0 top-1/3 bottom-1/3 w-1/4 z-10 cursor-pointer" aria-label="Next story" />
                  </div>
                </div>

                {/* ─── Story dock ─── */}
                <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-center px-4 pt-10 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2.5 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 overflow-x-auto scrollbar-hide max-w-full shadow-lg shadow-black/30">
                    {groups.map((group, i) => {
                      const active = i === groupIndex;
                      return (
                        <button
                          key={group.user_id}
                          onClick={() => jumpToGroup(i)}
                          className={cn(
                            'relative rounded-full flex-shrink-0 transition-all duration-200',
                            active ? 'scale-110' : 'opacity-80 hover:opacity-100'
                          )}
                          title={group.ad ? 'Sponsored' : group.display_name}
                        >
                          <div className={cn(
                            'p-[2px] rounded-full',
                            active ? 'bg-white' : group.ad ? 'bg-gradient-to-br from-amber-400 to-fuchsia-500' : group.has_unviewed ? 'bg-gradient-to-br from-primary to-primary/50' : 'bg-white/20'
                          )}>
                            <div className="p-[1.5px] rounded-full bg-black/40">
                              {group.ad ? (
                                <div className={cn('rounded-full bg-neutral-900 flex items-center justify-center', active ? 'w-8 h-8' : 'w-7 h-7')}>
                                  <Megaphone className="h-3.5 w-3.5 text-amber-400" />
                                </div>
                              ) : (
                                <Avatar className={cn('rounded-full', active ? 'w-8 h-8' : 'w-7 h-7')}>
                                  <AvatarImage src={group.avatar_url || undefined} />
                                  <AvatarFallback className="bg-neutral-800 text-white text-[10px]">
                                    {getInitials(group.display_name)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ─── Nav arrows (desktop) ─── */}
                {(groupIndex > 0 || storyIndex > 0) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrev}
                    className="hidden sm:inline-flex absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60"
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
                    className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60"
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
                {viewers.map((v) => (
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
        @keyframes story-kenburns {
          from { transform: scale(1.02); }
          to { transform: scale(1.14); }
        }
        .story-kenburns {
          animation: story-kenburns 8s ease-out forwards;
        }
        @keyframes story-enter {
          from { opacity: 0; transform: scale(1.03); }
          to { opacity: 1; transform: scale(1); }
        }
        .story-enter {
          animation: story-enter 0.35s ease-out;
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
