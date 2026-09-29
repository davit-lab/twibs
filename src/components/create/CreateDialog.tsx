import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStories } from '@/hooks/useStories';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import StoryCreator from '@/components/stories/StoryCreator';
import { Camera, ImageIcon, Clapperboard, ChevronRight, X } from 'lucide-react';
import ReelCreator from './ReelCreator';

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createOptions = [
  {
    type: 'post' as const,
    icon: ImageIcon,
    label: 'New post',
    description: 'Share photos, video, or text',
  },
  {
    type: 'story' as const,
    icon: Camera,
    label: 'Add to story',
    description: 'Share a moment for 24 hours',
  },
  {
    type: 'reel' as const,
    icon: Clapperboard,
    label: 'New reel',
    description: 'Create a short video',
  },
];

export default function CreateDialog({ open, onOpenChange }: CreateDialogProps) {
  const { uploadStory } = useStories();
  const { isEnabled } = useAppSettings();
  const navigate = useNavigate();
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false);
  const [reelCreatorOpen, setReelCreatorOpen] = useState(false);

  const visibleOptions = createOptions.filter(option => {
    if (option.type === 'story') return isEnabled('story_posting_enabled');
    if (option.type === 'reel') return isEnabled('reels_upload_enabled');
    return true;
  });

  const handleCreateTypeSelect = (type: 'story' | 'post' | 'reel') => {
    if (type === 'story') {
      onOpenChange(false);
      setStoryCreatorOpen(true);
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
        <DialogContent
          hideCloseButton
          className="left-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-[24px] border-x-0 border-b-0 bg-background p-0 shadow-[0_-20px_60px_rgba(0,0,0,0.28)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/25 sm:hidden" />

          <div className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <div>
              <DialogTitle className="text-xl font-semibold tracking-[-0.02em]">Create</DialogTitle>
              <DialogDescription className="mt-1 text-sm">Choose what you want to share.</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close create menu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-t border-border/70 px-2 py-2 sm:px-3">
            <div className="flex flex-col">
              {visibleOptions.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => handleCreateTypeSelect(option.type)}
                  className="group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-muted/70 active:bg-muted"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground transition group-hover:bg-background">
                    <option.icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-tight text-foreground">{option.label}</span>
                    <span className="mt-1 block text-xs leading-tight text-muted-foreground">{option.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>

          <div className="h-[max(env(safe-area-inset-bottom),12px)]" />
        </DialogContent>
      </Dialog>

      <StoryCreator
        open={storyCreatorOpen}
        onOpenChange={setStoryCreatorOpen}
        onUpload={uploadStory}
      />

      {/* Reel Creator Dialog */}
      <ReelCreator open={reelCreatorOpen} onOpenChange={setReelCreatorOpen} />

    </>
  );
}
