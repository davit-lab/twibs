import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useStories } from '@/hooks/useStories';
import { useToast } from '@/hooks/use-toast';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import { Loader2, Camera, ImageIcon, X, Plus, ChevronRight, Clapperboard, Sparkles } from 'lucide-react';
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
    description: 'Take a photo or record a video that disappears in 24 hours',
    gradient: 'from-violet-500 to-fuchsia-500',
    glow: 'shadow-violet-500/30',
    ring: 'group-hover:ring-violet-400/40',
  },
  {
    type: 'post' as const,
    icon: ImageIcon,
    label: 'Post',
    description: 'Share photos, videos or an update with your followers',
    gradient: 'from-sky-500 to-blue-600',
    glow: 'shadow-sky-500/30',
    ring: 'group-hover:ring-sky-400/40',
  },
  {
    type: 'reel' as const,
    icon: Clapperboard,
    label: 'Reel',
    description: 'Record and edit a short vertical video with effects',
    gradient: 'from-pink-500 to-rose-500',
    glow: 'shadow-pink-500/30',
    ring: 'group-hover:ring-pink-400/40',
  },
];

export default function CreateDialog({ open, onOpenChange }: CreateDialogProps) {
  const { uploadStory } = useStories();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reelCreatorOpen, setReelCreatorOpen] = useState(false);

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
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/25">
                <Plus className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Create</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Choose what you'd like to share
                </p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="relative px-4 pb-5 space-y-3">
            {createOptions.map((option) => (
              <button
                key={option.type}
                onClick={() => handleCreateTypeSelect(option.type)}
                className={cn(
                  'group w-full flex items-center gap-4 p-4 rounded-2xl border border-border/60 bg-card text-left',
                  'transition-all duration-200 hover:border-border hover:bg-muted/40',
                  'hover:shadow-lg hover:shadow-black/5 active:scale-[0.98]'
                )}
              >
                <div className={cn(
                  'w-14 h-14 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center',
                  'shadow-md flex-shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3',
                  option.gradient,
                  option.glow
                )}>
                  <option.icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm text-muted-foreground leading-snug">
                    {option.description}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/60 flex-shrink-0 transition-all duration-200 group-hover:text-primary group-hover:translate-x-0.5" />
              </button>
            ))}

            <div className="pt-1 pb-1 text-center">
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
