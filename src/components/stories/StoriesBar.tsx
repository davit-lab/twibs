import { useState, useRef, useEffect, useCallback } from 'react';
import { useStories, GroupedStories } from '@/hooks/useStories';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import { Plus, Loader2, X, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, Trash2, Music, Camera, Video, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function StoriesBar() {
  const { user } = useAuth();
  const { groupedStories, loading, viewStory, uploadStory, deleteStory } = useStories();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select an image or video file.',
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 50MB.',
      });
      return;
    }

    setUploading(true);
    try {
      await uploadStory(file);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload story.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCameraDone = async (file: File, result: MediaEditorResult) => {
    setCameraOpen(false);
    setUploading(true);
    try {
      await uploadStory(file, result.caption, result.music, result.duration);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Story upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload story.',
      });
    } finally {
      setUploading(false);
    }
  };

  const openStoryViewer = (groupIndex: number, storyIndex: number = 0) => {
    setCurrentGroupIndex(groupIndex);
    setCurrentStoryIndex(storyIndex);
    setViewerOpen(true);
    setPaused(false);
    setMusicMuted(false);

    const story = groupedStories[groupIndex]?.stories[storyIndex];
    if (story && !story.is_viewed) {
      viewStory(story.id);
    }
  };

  const jumpToGroup = useCallback((groupIndex: number) => {
    const group = groupedStories[groupIndex];
    if (!group) return;
    setCurrentGroupIndex(groupIndex);
    setCurrentStoryIndex(0);
    setPaused(false);
    const story = group.stories[0];
    if (story && !story.is_viewed) {
      viewStory(story.id);
    }
  }, [groupedStories, viewStory]);

  const nextStory = useCallback(() => {
    const currentGroup = groupedStories[currentGroupIndex];
    if (!currentGroup) return;
    if (currentStoryIndex < currentGroup.stories.length - 1) {
      const newIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(newIndex);
      const story = currentGroup.stories[newIndex];
      if (story && !story.is_viewed) viewStory(story.id);
    } else if (currentGroupIndex < groupedStories.length - 1) {
      const newGroupIndex = currentGroupIndex + 1;
      setCurrentGroupIndex(newGroupIndex);
      setCurrentStoryIndex(0);
      const story = groupedStories[newGroupIndex]?.stories[0];
      if (story && !story.is_viewed) viewStory(story.id);
    } else {
      setViewerOpen(false);
    }
  }, [currentGroupIndex, currentStoryIndex, groupedStories, viewStory]);

  const prevStory = useCallback(() => {
    const currentGroup = groupedStories[currentGroupIndex];
    if (!currentGroup) return;
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else if (currentGroupIndex > 0) {
      const newGroupIndex = currentGroupIndex - 1;
      setCurrentGroupIndex(newGroupIndex);
      setCurrentStoryIndex(groupedStories[newGroupIndex].stories.length - 1);
    }
  }, [currentGroupIndex, currentStoryIndex, groupedStories]);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerOpen(false);
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextStory();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStory();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, nextStory, prevStory]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => { /* autoplay blocked until interaction */ });
  }, [paused, currentStoryIndex]);

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const currentGroup = groupedStories[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex];

  if (loading) {
    return (
      <div className="py-4 px-2">
        <div className="flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
              <div className="w-12 h-3 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="py-4">
        <ScrollArea className="w-full">
          <div className="flex gap-4 px-4">
            {user && (
              <button
                onClick={() => setOptionsOpen(true)}
                className="flex flex-col items-center gap-2 min-w-[72px]"
                disabled={uploading}
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-dashed border-primary/50 flex items-center justify-center transition-all hover:border-primary hover:bg-primary/15">
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Plus className="h-6 w-6 text-primary" />
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground font-medium">Your Story</span>
              </button>
            )}

            {groupedStories.map((group, groupIndex) => (
              <button
                key={group.user_id}
                onClick={() => openStoryViewer(groupIndex)}
                className="flex flex-col items-center gap-2 min-w-[72px]"
              >
                <div className={cn(
                  'p-[2.5px] rounded-full transition-transform hover:scale-105',
                  group.has_unviewed
                    ? 'bg-gradient-to-br from-primary via-accent to-primary/50 story-ring'
                    : 'bg-muted'
                )}>
                  <div className="p-0.5 rounded-full bg-background">
                    <Avatar className="w-14 h-14">
                      <AvatarImage src={group.avatar_url || undefined} />
                      <AvatarFallback className="bg-neutral-800 text-white">
                        {getInitials(group.display_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                <span className="text-xs text-foreground font-medium truncate max-w-[72px]">
                  {group.user_id === user?.id ? 'You' : group.display_name}
                </span>
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* ─── Create story options ─── */}
      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent hideCloseButton className="max-w-[360px] p-0 border-none overflow-hidden rounded-[2rem] bg-transparent">
          <DialogTitle className="sr-only">Add to your story</DialogTitle>
          <div className="rounded-[2rem] bg-background overflow-hidden border border-border/50 shadow-2xl">
            <div className="p-5 pb-3">
              <p className="font-bold text-lg">Add to your story</p>
              <p className="text-sm text-muted-foreground max-w-xs">Take a photo, record a quick video, or choose one from your library.</p>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 pt-1">
              <button
                onClick={() => { setOptionsOpen(false); setCameraMode('photo'); setCameraOpen(true); }}
                className="group flex flex-col items-center gap-2 py-4 rounded-2xl bg-card border border-border/60 hover:shadow-lg transition-transform duration-300 transform hover:-translate-y-1"
              >
                <div className="p-[2px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
                  <div className="h-11 w-11 rounded-full bg-background flex items-center justify-center shadow-sm relative">
                    <div className="absolute inset-0 rounded-full pointer-events-none">
                      <div className="absolute -top-1 left-0 w-full h-5 rounded-t-full bg-white/6 blur-sm" />
                    </div>
                    <Camera className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <span className="text-xs font-semibold">Take Photo</span>
              </button>

              <button
                onClick={() => { setOptionsOpen(false); setCameraMode('video'); setCameraOpen(true); }}
                className="group flex flex-col items-center gap-2 py-4 rounded-2xl bg-card border border-border/60 hover:shadow-lg transition-transform duration-300 transform hover:-translate-y-1"
              >
                <div className="p-[2px] rounded-full bg-gradient-to-br from-sky-400 to-blue-600">
                  <div className="h-11 w-11 rounded-full bg-background flex items-center justify-center shadow-sm relative">
                    <div className="absolute inset-0 rounded-full pointer-events-none">
                      <div className="absolute -top-1 left-0 w-full h-5 rounded-t-full bg-white/6 blur-sm" />
                    </div>
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <span className="text-xs font-semibold">Record Video</span>
              </button>

              <button
                onClick={() => { setOptionsOpen(false); fileInputRef.current?.click(); }}
                className="group flex flex-col items-center gap-2 py-4 rounded-2xl bg-card border border-border/60 hover:shadow-lg transition-transform duration-300 transform hover:-translate-y-1"
              >
                <div className="p-[2px] rounded-full bg-gradient-to-br from-pink-500 to-rose-500">
                  <div className="h-11 w-11 rounded-full bg-background flex items-center justify-center shadow-sm relative">
                    <div className="absolute inset-0 rounded-full pointer-events-none">
                      <div className="absolute -top-1 left-0 w-full h-5 rounded-t-full bg-white/6 blur-sm" />
                    </div>
                    <ImagePlus className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <span className="text-xs font-semibold">Upload</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        mode="story"
        startMode={cameraMode}
        maxVideoDuration={15}
        onDone={handleCameraDone}
      />

      {/* ─── Story Theater ─── */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent
          hideCloseButton
          className="w-full h-[100dvh] sm:h-[90vh] sm:max-h-[860px] max-w-[460px] p-0 border-none overflow-hidden sm:rounded-[2rem] bg-transparent"
        >
          <div className="relative h-full w-full bg-[radial-gradient(120%_120%_at_50%_0%,#221d33_0%,#0d0c14_55%,#05050a_100%)]">
            <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(90%_70%_at_50%_50%,transparent_35%,rgba(0,0,0,0.6)_100%)]" />

            {currentStory && currentGroup && (
              <>
                {/* Top: progress + header */}
                <div className="absolute inset-x-0 top-0 z-30 px-3 pt-[max(env(safe-area-inset-top,0px),10px)]">
                  <div className="flex gap-1.5">
                    {currentGroup.stories.map((story, i) => (
                      <div key={story.id} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full bg-white', i === currentStoryIndex && 'story-progress-active')}
                          style={
                            i === currentStoryIndex
                              ? { animationDuration: `${story.duration}s`, animationPlayState: paused ? 'paused' : 'running' }
                              : i < currentStoryIndex
                                ? { width: '100%' }
                                : { width: '0%' }
                          }
                          onAnimationEnd={() => { if (currentStory.media_type === 'image') nextStory(); }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <a href={`/profile/${currentGroup.username}`} className="flex items-center gap-2.5 min-w-0">
                      <div className="p-[2px] rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-primary/50 flex-shrink-0">
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
                          {currentGroup.display_name}
                        </p>
                        <p className="text-white/60 text-[11px] font-medium leading-tight">
                          {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                          {currentGroup.user_id === user?.id && ` · ${currentStory.view_count} views`}
                        </p>
                      </div>
                    </a>

                    <div className="flex items-center gap-1 bg-black/45 backdrop-blur-md rounded-full p-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setPaused(!paused)} className="h-8 w-8 rounded-full text-white hover:bg-white/20">
                        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                      {currentStory.media_type === 'video' && (
                        <Button variant="ghost" size="icon" onClick={() => setMuted(!muted)} className="h-8 w-8 rounded-full text-white hover:bg-white/20">
                          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                      )}
                      {currentGroup.user_id === user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            deleteStory(currentStory.id);
                            nextStory();
                          }}
                          className="h-8 w-8 rounded-full text-white hover:bg-destructive/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setViewerOpen(false)} className="h-8 w-8 rounded-full text-white hover:bg-white/20">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Media card */}
                <div
                  className="absolute inset-0 sm:inset-x-3 sm:top-[5.5rem] sm:bottom-24 z-10"
                  onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                  onTouchEnd={e => {
                    if (touchStartX.current == null) return;
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    touchStartX.current = null;
                    if (Math.abs(dx) > 50) {
                      if (dx < 0) nextStory(); else prevStory();
                    }
                  }}
                >
                  <div className="relative w-full h-full sm:rounded-[1.5rem] overflow-hidden bg-black sm:ring-1 sm:ring-white/10 sm:shadow-2xl sm:shadow-black/70">
                    <div className="absolute -inset-4 z-0 bg-primary/20 blur-3xl opacity-25 pointer-events-none" />

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
                        onEnded={nextStory}
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
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/10 to-transparent z-10" />
                    <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-10" />

                    {/* Bottom stack: caption + music */}
                    {(currentStory.caption || currentStory.music_url) && (
                      <div className="absolute inset-x-4 bottom-24 sm:bottom-4 z-20 flex flex-col items-center gap-2 pointer-events-none">
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

                    {/* Tap zones */}
                    <button onClick={prevStory} className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 z-10" />
                    <button onClick={nextStory} className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 z-10" />
                  </div>
                </div>

                {/* Story dock */}
                <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-center px-4 pt-8 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2.5 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 overflow-x-auto scrollbar-hide max-w-full shadow-lg shadow-black/30">
                    {groupedStories.map((group, i) => {
                      const active = i === currentGroupIndex;
                      return (
                        <button
                          key={group.user_id}
                          onClick={() => jumpToGroup(i)}
                          className={cn(
                            'relative rounded-full flex-shrink-0 transition-all duration-200',
                            active ? 'scale-110' : 'opacity-80 hover:opacity-100'
                          )}
                          title={group.display_name}
                        >
                          <div className={cn(
                            'p-[2px] rounded-full',
                            active ? 'bg-white' : group.has_unviewed ? 'bg-gradient-to-br from-primary to-primary/50' : 'bg-white/20'
                          )}>
                            <div className="p-[1.5px] rounded-full bg-black/40">
                              <Avatar className={cn('rounded-full', active ? 'w-8 h-8' : 'w-7 h-7')}>
                                <AvatarImage src={group.avatar_url || undefined} />
                                <AvatarFallback className="bg-neutral-800 text-white text-[10px]">
                                  {getInitials(group.display_name)}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Nav arrows (desktop) */}
                {(currentGroupIndex > 0 || currentStoryIndex > 0) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevStory}
                    className="hidden sm:inline-flex absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                {(currentGroupIndex < groupedStories.length - 1 || currentStoryIndex < currentGroup.stories.length - 1) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextStory}
                    className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes story-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .story-progress-active {
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
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .story-enter {
          animation: story-enter 0.3s ease-out;
        }
        @keyframes story-ring {
          0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.55); }
          70% { box-shadow: 0 0 0 9px rgba(139, 92, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
        .story-ring {
          animation: story-ring 2.2s ease-out infinite;
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
