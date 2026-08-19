import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Upload, Loader2 } from 'lucide-react';

interface StoryPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onConfirm: () => void;
  file: File | null;
  type: 'image' | 'video';
  uploading?: boolean;
  caption?: string;
  music?: { name: string; url: string | null };
}

export default function StoryPreviewDialog({ open, onClose, onBack, onConfirm, file, type, uploading, caption, music }: StoryPreviewDialogProps) {
  const url = file ? URL.createObjectURL(file) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        hideCloseButton
        className="w-full h-[100dvh] sm:h-[92vh] sm:max-h-[880px] max-w-[480px] p-0 border-none overflow-hidden sm:rounded-[2rem] bg-black"
      >
        <DialogTitle className="sr-only">Preview story</DialogTitle>

        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-white font-semibold text-sm bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
            Preview
          </span>
          <div className="w-10" />
        </div>

        {/* Preview media — exact same rendering as StoryViewer */}
        <div className="absolute inset-0 flex items-center justify-center">
          {url && type === 'image' && (
            <img
              src={url}
              className="absolute inset-0 w-full h-full object-cover story-enter"
              alt="Story preview"
            />
          )}
          {url && type === 'video' && (
            <video
              src={url}
              className="absolute inset-0 w-full h-full object-cover story-enter"
              autoPlay
              muted
              loop
              playsInline
            />
          )}
        </div>

        {/* Caption overlay */}
        {caption && (
          <div className="absolute bottom-24 inset-x-0 z-20 px-6">
            <div className="bg-black/50 backdrop-blur-sm rounded-2xl px-4 py-3 text-center">
              <p className="text-white text-sm leading-relaxed">{caption}</p>
            </div>
          </div>
        )}

        {/* Music indicator */}
        {music?.url && (
          <div className="absolute top-16 inset-x-0 z-20 flex justify-center">
            <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-2">
              <span className="text-white/80 text-xs">🎵</span>
              <span className="text-white text-xs font-medium">{music.name}</span>
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 inset-x-0 z-30 pb-8 pt-10 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center gap-4 px-6">
            <Button
              onClick={onConfirm}
              disabled={uploading}
              className="flex-1 rounded-full h-12 bg-primary text-primary-foreground font-semibold text-sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Share to Story
                </>
              )}
            </Button>
          </div>
          <p className="text-center text-white/50 text-xs mt-3">This is how your story will look</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
