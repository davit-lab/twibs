import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import { Loader2, X, ImagePlus, Film, Camera, Music } from 'lucide-react';

interface StoryCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (
    file: File,
    caption?: string,
    music?: { name: string; url: string | null },
    duration?: number,
  ) => Promise<unknown>;
}

const MAX_SIZE = 50 * 1024 * 1024;

interface MediaState {
  file: File;
  type: 'image' | 'video';
  url: string;
}

export default function StoryCreator({ open, onOpenChange, onUpload }: StoryCreatorProps) {
  const [media, setMedia] = useState<MediaState | null>(null);
  const [caption, setCaption] = useState('');
  const [music, setMusic] = useState<{ name: string; url: string | null } | null>(null);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  const reset = () => {
    setMedia(null);
    setCaption('');
    setMusic(null);
    setDuration(undefined);
    setUploading(false);
    setError(null);
    setCameraOpen(false);
  };

  // Reset the draft only when the creator first opens — never on parent re-renders.
  useEffect(() => {
    if (open && !prevOpenRef.current) reset();
    prevOpenRef.current = open;
  }, [open]);

  const handleLibraryFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Please choose an image or video file.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('Maximum file size is 50MB.');
      return;
    }
    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    setMedia({ file, type, url: URL.createObjectURL(file) });
    setDuration(type === 'video' ? 15 : undefined);
    setError(null);
  };

  const handleCameraDone = (file: File, result: MediaEditorResult) => {
    setCameraOpen(false);
    const type = result.kind;
    setMedia({ file, type, url: URL.createObjectURL(file) });
    setCaption(result.caption ?? '');
    setMusic(result.music ?? null);
    setDuration(result.duration);
    setError(null);
  };

  const retake = () => {
    setCameraOpen(true);
    setError(null);
  };

  const share = async () => {
    if (!media) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(
        media.file,
        caption.trim() ? caption.trim() : undefined,
        music ?? undefined,
        // Pass through the camera's explicit duration (videos from the library
        // default to 15s inside handleLibraryFile; images stay undefined -> 5s).
        duration
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        hideCloseButton
        className="w-full h-[100dvh] sm:h-[92vh] sm:max-h-[880px] max-w-[430px] p-0 border-none overflow-hidden bg-[#07070c] sm:rounded-2xl sm:ring-1 sm:ring-border"
      >
        <DialogTitle className="sr-only">Create story</DialogTitle>

        <div className="relative flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top,0px),12px)] pb-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-9 w-9 rounded-full bg-white/[0.06] text-white hover:bg-white/15"
              aria-label="Close story creator"
            >
              <X className="h-5 w-5" />
            </Button>
            <span className="text-sm font-semibold text-white/90">New story</span>
            <div className="w-9" />
          </div>

          {/* Preview (the primary environment) */}
          <div className="flex-1 min-h-0 px-4 flex items-stretch justify-center pb-2">
            {media ? (
              <div className="relative w-full max-h-full self-center rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}>
                {media.type === 'image' ? (
                  <img src={media.url} alt="Story preview" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
                ) : (
                  <video src={media.url} className="absolute inset-0 w-full h-full object-contain" autoPlay muted loop playsInline />
                )}
              </div>
            ) : (
              <div
                className="w-full max-h-full self-center rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03]"
                style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}
              >
                <div className="flex flex-col items-center justify-center h-full gap-5 px-6">
                  <div className="text-center">
                    <p className="text-white text-base font-semibold">Add a photo or video</p>
                    <p className="text-white/50 text-xs mt-1">Your story disappears after 24 hours</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 w-24 py-4 rounded-2xl bg-surface-2 border border-border text-white hover:bg-surface-3 transition-colors"
                    >
                      <ImagePlus className="h-6 w-6 text-primary" />
                      <span className="text-xs font-semibold">Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 w-24 py-4 rounded-2xl bg-surface-2 border border-border text-white hover:bg-surface-3 transition-colors"
                    >
                      <Film className="h-6 w-6 text-primary" />
                      <span className="text-xs font-semibold">Video</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full max-w-[240px]">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[11px] text-white/40">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => { setCameraMode('photo'); setCameraOpen(true); }}
                    className="w-full max-w-[240px] rounded-full h-11 border-white/15 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take photo / record video
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Controls (secondary to the preview) */}
          {media && (
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-2">
              <div className="flex items-center gap-2 mb-2">
                {music && (
                  <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1 text-white/90 text-xs">
                    <Music className="h-3.5 w-3.5 text-primary" />
                    <span className="max-w-[160px] truncate">{music.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" onClick={retake} className="h-8 px-3 rounded-full text-white/70 hover:bg-white/10 hover:text-white text-xs">
                    <Camera className="h-3.5 w-3.5 mr-1.5" /> Retake
                  </Button>
                  <Button variant="ghost" onClick={() => photoInputRef.current?.click()} className="h-8 px-3 rounded-full text-white/70 hover:bg-white/10 hover:text-white text-xs">
                    <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> Replace
                  </Button>
                </div>
              </div>

              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption…"
                rows={2}
                maxLength={200}
                className="w-full resize-none rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/40 text-sm px-3.5 py-2.5 focus:outline-none focus:border-white/25"
              />

              {error && (
                <p className="mt-2 text-center text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button
                onClick={share}
                disabled={uploading}
                className="mt-3 w-full h-12 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sharing…
                  </>
                ) : (
                  'Share story'
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Hidden library pickers */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleLibraryFile(f);
            e.target.value = '';
          }}
          className="hidden"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleLibraryFile(f);
            e.target.value = '';
          }}
          className="hidden"
        />

        <CameraModal
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          mode="story"
          startMode={cameraMode}
          maxVideoDuration={15}
          onDone={handleCameraDone}
        />
      </DialogContent>
    </Dialog>
  );
}