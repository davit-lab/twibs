import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useStories } from '@/hooks/useStories';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import { Loader2, Camera, ImageIcon, Plus, Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReelCreator from './ReelCreator';

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createOptions = [
  {
    type: 'story' as const,
    icon: Camera,
    label: 'Story',
    gradient: 'from-violet-500 to-fuchsia-500',
    glow: 'shadow-violet-500/30',
  },
  {
    type: 'post' as const,
    icon: ImageIcon,
    label: 'Post',
    gradient: 'from-sky-500 to-blue-600',
    glow: 'shadow-sky-500/30',
  },
  {
    type: 'reel' as const,
    icon: Clapperboard,
    label: 'Reel',
    gradient: 'from-pink-500 to-rose-500',
    glow: 'shadow-pink-500/30',
  },
];

export default function CreateDialog({ open, onOpenChange }: CreateDialogProps) {
  const { uploadStory } = useStories();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reelCreatorOpen, setReelCreatorOpen] = useState(false);

  const visibleOptions = createOptions.filter(option => {
    if (option.type === 'story') return isEnabled('story_posting_enabled');
    if (option.type === 'reel') return isEnabled('reels_upload_enabled');
    return true;
  });

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

  const handleCreateTypeSelect = (type: 'story' | 'post' | 'reel') => {
    if (type === 'story') {
      onOpenChange(false);
      setCameraOpen(true);
    } else if (type === 'post') {
      onOpenChange(false);
      navigate('/?compose=1');
    } else {
      onOpenChange(false);
      setReelCreatorOpen(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-0 gap-0 rounded-3xl overflow-hidden">
          <DialogTitle className="sr-only">Create</DialogTitle>

          {/* Header */}
          <div className="relative p-6 pb-5 overflow-hidden">
            <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-14 -left-10 w-44 h-44 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-primary/80 via-purple-500 to-accent/90">
                <div className="w-12 h-12 rounded-2xl bg-card/90 flex items-center justify-center shadow-2xl shadow-primary/20 transition-transform duration-300 transform">
                  <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
                    <div className="absolute -top-1 left-0 w-full h-6 rounded-t-2xl bg-white/6 blur-sm" />
                  </div>
                  <Plus className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Create</h2>
                <p className="text-sm text-muted-foreground">Choose what you'd like to share</p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="relative px-4 pb-5">
            <div className="grid grid-cols-3 gap-3">
              {visibleOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => handleCreateTypeSelect(option.type)}
                  className={cn(
                    'group relative flex flex-col items-center gap-3 px-2 py-6 rounded-3xl border border-border/60 bg-card/90 text-center',
                    'transition-all duration-250 hover:border-border hover:bg-muted/40',
                    'hover:shadow-2xl hover:shadow-black/20 active:scale-[0.97]'
                  )}
                >
                  <div className={cn(
                    'relative w-14 h-14 rounded-2xl text-white flex items-center justify-center overflow-hidden',
                    'shadow-md transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-4',
                    option.gradient,
                    option.glow
                  )}>
                    <div className="absolute inset-0 rounded-2xl bg-black/5" />
                    <div className="absolute -top-1 left-0 w-full h-6 rounded-t-2xl bg-white/6 blur-sm pointer-events-none" />
                    <option.icon className="h-6 w-6 relative" strokeWidth={2} />

                    {/* badge removed for Story option per design request */}
                  </div>
                  <span className="font-semibold text-sm leading-tight">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {option.type === 'story' ? 'Disappears in 24h' : option.type === 'post' ? 'Share with followers' : 'Short video'}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-4 pb-1 text-center">
              <span className="text-[11px] text-muted-foreground">
                Stories vanish after 24 hours · Reels can be up to 60 seconds
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera + filter editor for stories */}
      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        mode="story"
        startMode="photo"
        maxVideoDuration={15}
        onDone={handleCameraDone}
      />

      {/* Reel Creator Dialog */}
      <ReelCreator open={reelCreatorOpen} onOpenChange={setReelCreatorOpen} />

      {/* Uploading overlay */}
      {uploading && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-card border border-border shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Publishing your story…</span>
          </div>
        </div>
      )}
    </>
  );
}
