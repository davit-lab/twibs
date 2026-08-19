import { useState, useRef, useMemo } from 'react';
import { useStories, GroupedStories } from '@/hooks/useStories';
import { useFeedAds } from '@/hooks/useFeedAds';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import CameraModal from '@/components/media/CameraModal';
import StoryCropDialog from '@/components/media/StoryCropDialog';
import StoryPreviewDialog from '@/components/media/StoryPreviewDialog';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import StoryViewer from '@/components/stories/StoryViewer';
import { Plus, Loader2, X, Camera, Video, ImagePlus, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function StoriesBar() {
  const { user } = useAuth();
  const { groupedStories, loading, viewStory, uploadStory, deleteStory, fetchStoryViewers } = useStories();
  const { ads } = useFeedAds(1);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [cropOpen, setCropOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'image' | 'video'>('image');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video'>('image');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Append a single sponsored story to the tray (real active campaign only).
  const groups: GroupedStories[] = useMemo(() => {
    if (ads.length === 0) return groupedStories;
    const ad = ads[0];
    const media = ad.post_media || [];
    const visual = media.find(m => m.type === 'video') || media[0];
    const adGroup: GroupedStories = {
      user_id: `ad-${ad.advertisement_id}`,
      username: ad.advertiser_username,
      display_name: ad.advertiser_name,
      avatar_url: ad.advertiser_avatar_url,
      has_unviewed: true,
      ad,
      stories: [{
        id: `ad-${ad.advertisement_id}`,
        user_id: `ad-${ad.advertisement_id}`,
        media_url: visual?.url || ad.advertiser_avatar_url || '',
        media_type: 'image',
        caption: null,
        duration: 5,
        view_count: 0,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        music_url: null,
        music_name: null,
        is_viewed: true,
      }],
    };
    return [...groupedStories, adGroup];
  }, [groupedStories, ads]);

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

    setCropFile(file);
    setCropType(file.type.startsWith('video/') ? 'video' : 'image');
    setCropOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropConfirm = (cropped: File) => {
    setCropOpen(false);
    setCropFile(null);
    setPreviewFile(cropped);
    setPreviewType(cropped.type.startsWith('video/') ? 'video' : 'image');
    setPreviewOpen(true);
  };

  const handleCropClose = () => {
    setCropOpen(false);
    setCropFile(null);
  };

  const handlePreviewConfirm = async () => {
    if (!previewFile) return;
    setPreviewOpen(false);
    setUploading(true);
    try {
      await uploadStory(previewFile);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload story.',
      });
    } finally {
      setUploading(false);
      setPreviewFile(null);
    }
  };

  const handlePreviewBack = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
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

  const openStoryViewer = (groupIndex: number) => {
    setViewerStart(groupIndex);
    setViewerOpen(true);
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

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

            {groups.map((group, groupIndex) => (
              <button
                key={group.user_id}
                onClick={() => openStoryViewer(groupIndex)}
                className="flex flex-col items-center gap-2 min-w-[72px]"
              >
                <div className={cn(
                  'p-[2.5px] rounded-full transition-transform hover:scale-105',
                  group.ad
                    ? 'bg-gradient-to-br from-amber-400 via-pink-500 to-fuchsia-500'
                    : group.has_unviewed
                      ? 'bg-gradient-to-br from-primary via-accent to-primary/50 story-ring'
                      : 'bg-muted'
                )}>
                  <div className="p-0.5 rounded-full bg-background">
                    {group.ad ? (
                      <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center">
                        <Megaphone className="h-6 w-6 text-primary" />
                      </div>
                    ) : (
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={group.avatar_url || undefined} />
                        <AvatarFallback className="bg-neutral-800 text-white">
                          {getInitials(group.display_name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                </div>
                <span className={cn(
                  'text-xs font-medium truncate max-w-[72px]',
                  group.ad && 'text-primary'
                )}>
                  {group.ad ? 'Sponsored' : group.user_id === user?.id ? 'You' : group.display_name}
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

      <StoryCropDialog
        open={cropOpen}
        onClose={handleCropClose}
        onConfirm={handleCropConfirm}
        file={cropFile}
        type={cropType}
      />

      <StoryPreviewDialog
        open={previewOpen}
        onClose={handlePreviewClose}
        onBack={handlePreviewBack}
        onConfirm={handlePreviewConfirm}
        file={previewFile}
        type={previewType}
        uploading={uploading}
      />

      {/* ─── Story Theater ─── */}
      <StoryViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        groups={groups}
        currentUserId={user?.id ?? null}
        initialGroupIndex={viewerStart}
        onView={viewStory}
        onDelete={deleteStory}
        onFetchViewers={fetchStoryViewers}
      />

      <style>{`
        @keyframes story-ring {
          0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.55); }
          70% { box-shadow: 0 0 0 9px rgba(139, 92, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
        .story-ring {
          animation: story-ring 2.2s ease-out infinite;
        }
      `}</style>
    </>
  );
}
