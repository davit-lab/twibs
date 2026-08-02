import { useState, useRef } from 'react';
import { useStories, GroupedStories } from '@/hooks/useStories';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plus, Loader2, X, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, Trash2, Music } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const openStoryViewer = (groupIndex: number, storyIndex: number = 0) => {
    setCurrentGroupIndex(groupIndex);
    setCurrentStoryIndex(storyIndex);
    setViewerOpen(true);
    setMusicMuted(false);
    
    // Mark story as viewed
    const story = groupedStories[groupIndex]?.stories[storyIndex];
    if (story && !story.is_viewed) {
      viewStory(story.id);
    }
  };

  const nextStory = () => {
    const currentGroup = groupedStories[currentGroupIndex];
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
  };

  const prevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else if (currentGroupIndex > 0) {
      const newGroupIndex = currentGroupIndex - 1;
      setCurrentGroupIndex(newGroupIndex);
      setCurrentStoryIndex(groupedStories[newGroupIndex].stories.length - 1);
    }
  };

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
            {/* Add Story Button */}
            {user && (
              <button 
                onClick={() => fileInputRef.current?.click()}
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

            {/* Stories */}
            {groupedStories.map((group, groupIndex) => (
              <button
                key={group.user_id}
                onClick={() => openStoryViewer(groupIndex)}
                className="flex flex-col items-center gap-2 min-w-[72px]"
              >
                <div className={cn(
                  "p-[2px] rounded-full",
                  group.has_unviewed
                    ? "bg-gradient-to-br from-primary to-primary/50"
                    : "bg-muted"
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

      {/* Story Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-lg p-0 bg-black border-none overflow-hidden h-[90vh] max-h-[800px]">
          {currentStory && currentGroup && (
            <div className="relative h-full w-full flex flex-col">
              {/* Progress bars */}
              <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
                {currentGroup.stories.map((story, i) => (
                  <div key={story.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full bg-white transition-all duration-300",
                        i < currentStoryIndex && "w-full",
                        i === currentStoryIndex && !paused && "animate-story-progress",
                        i > currentStoryIndex && "w-0"
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 ring-2 ring-white/30">
                    <AvatarImage src={currentGroup.avatar_url || undefined} />
                    <AvatarFallback className="bg-neutral-800 text-white text-sm">
                      {getInitials(currentGroup.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-white font-semibold text-sm">{currentGroup.display_name}</p>
                    <p className="text-white/60 text-xs">
                      {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPaused(!paused)}
                    className="rounded-full text-white hover:bg-white/20"
                  >
                    {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </Button>
                  {currentStory.media_type === 'video' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMuted(!muted)}
                      className="rounded-full text-white hover:bg-white/20"
                    >
                      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
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
                      className="rounded-full text-white hover:bg-destructive/80"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewerOpen(false)}
                    className="rounded-full text-white hover:bg-white/20"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Media */}
              <div className="flex-1 flex items-center justify-center bg-black">
                {currentStory.media_type === 'video' ? (
                  <video
                    ref={videoRef}
                    src={currentStory.media_url}
                    className="max-h-full max-w-full object-contain"
                    autoPlay
                    loop={false}
                    muted={muted || !!currentStory.music_url}
                    playsInline
                    onEnded={nextStory}
                  />
                ) : (
                  <img
                    src={currentStory.media_url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    onLoad={() => {
                      if (!paused) {
                        setTimeout(nextStory, (currentStory.duration || 5) * 1000);
                      }
                    }}
                  />
                )}
              </div>

              {/* Story music */}
              {currentStory.music_url && (
                <>
                  <audio
                    key={currentStory.id}
                    src={currentStory.music_url}
                    autoPlay
                    loop
                    muted={musicMuted}
                    className="hidden"
                  />
                  <div className="absolute bottom-20 left-4 right-4 z-20 flex justify-center">
                    <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full pl-3 pr-1.5 py-1.5">
                      <Music className="h-4 w-4 text-white flex-shrink-0" />
                      <span className="text-white text-xs font-medium max-w-[160px] truncate">
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
                  </div>
                </>
              )}

              {/* Caption */}
              {currentStory.caption && (
                <div className="absolute bottom-20 left-4 right-4 z-20">
                  <p className="text-white text-center text-sm bg-black/40 rounded-lg px-4 py-2">
                    {currentStory.caption}
                  </p>
                </div>
              )}

              {/* Navigation */}
              <button
                onClick={prevStory}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 z-10"
              />
              <button
                onClick={nextStory}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 z-10"
              />

              {/* Nav arrows */}
              {(currentGroupIndex > 0 || currentStoryIndex > 0) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={prevStory}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 text-white hover:bg-black/50"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
              )}
              {(currentGroupIndex < groupedStories.length - 1 || currentStoryIndex < currentGroup.stories.length - 1) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={nextStory}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 text-white hover:bg-black/50"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              )}

              {/* View count for own stories */}
              {currentGroup.user_id === user?.id && (
                <div className="absolute bottom-4 left-0 right-0 z-20 text-center">
                  <span className="text-white/60 text-sm">
                    👁 {currentStory.view_count} views
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes story-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-story-progress {
          animation: story-progress 5s linear forwards;
        }
      `}</style>
    </>
  );
}