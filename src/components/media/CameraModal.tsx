import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCamera } from '@/hooks/useCamera';
import { pickMediaRecorderMimeType } from '@/lib/media-filters';
import FilterEditor, { MediaEditorResult, MediaEditorMedia } from '@/components/media/FilterEditor';
import { cn } from '@/lib/utils';
import { X, FlipHorizontal2, Zap, ZapOff, ImagePlus, Camera, Video, Loader2, Circle } from 'lucide-react';

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'story' | 'post';
  startMode?: 'photo' | 'video';
  maxVideoDuration?: number;
  onDone: (file: File, result: MediaEditorResult) => void;
}

const MAX_VIDEO_DEFAULT = 30;

export default function CameraModal({ open, onClose, mode, startMode = 'photo', maxVideoDuration = MAX_VIDEO_DEFAULT, onDone }: CameraModalProps) {
  const { stream, error, facing, torch, start, stop, toggleFacing, setTorch, attachStream } = useCamera();
  const { toast } = useToast();
  const [step, setStep] = useState<'camera' | 'edit'>('camera');
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>(startMode);
  const [media, setMedia] = useState<MediaEditorMedia | null>(null);
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [torchToggling, setTorchToggling] = useState(false);
  const [pendingDuration, setPendingDuration] = useState<number | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const maxDurationRef = useRef(maxVideoDuration);

  maxDurationRef.current = maxVideoDuration;

  const cleanupRecorder = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupRecorder();
      stop();
      return;
    }
    setStep('camera');
    setCaptureMode(startMode);
    setMedia(null);
    setPendingDuration(undefined);
    start({ facing: 'user' });
    return () => {
      cleanupRecorder();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    cleanupRecorder();
    onClose();
  };

  const enterEdit = (file: File) => {
    const url = URL.createObjectURL(file);
    setMedia({
      file,
      url,
      type: file.type.startsWith('video/') ? 'video' : 'image',
    });
    setStep('edit');
  };

  const flashEffect = () => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 280);
  };

  const capturePhoto = useCallback(() => {
    const video = document.querySelector<HTMLVideoElement>('[data-camera-preview]');
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    flashEffect();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        enterEdit(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!stream) return;
    const mimeType = pickMediaRecorderMimeType();
    if (!mimeType) {
      toast({
        variant: 'destructive',
        title: 'Recording not supported',
        description: 'Your browser does not support video recording.',
      });
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      const duration = Math.min(Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)), maxDurationRef.current);
      chunksRef.current = [];
      setRecording(false);
      setElapsed(0);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (blob.size > 0) {
        const file = new File([blob], `video-${Date.now()}.${ext}`, { type: mimeType });
        setPendingDuration(duration);
        enterEdit(file);
      }
    };
    recorder.start(100);
    startTimeRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      const now = Date.now();
      const secs = (now - startTimeRef.current) / 1000;
      if (secs >= maxDurationRef.current) {
        stopRecording();
      } else {
        setElapsed(secs);
      }
    }, 100);
  }, [stream, toast, stopRecording]);

  const handleShutter = () => {
    if (captureMode === 'photo') {
      capturePhoto();
    } else {
      if (recording) stopRecording();
      else startRecording();
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Please choose an image or video.',
      });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 100MB.',
      });
      return;
    }
    setPendingDuration(undefined);
    enterEdit(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleTorch = async () => {
    setTorchToggling(true);
    await setTorch(!torch);
    setTorchToggling(false);
  };

  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        hideCloseButton
        className="w-full h-[100dvh] sm:h-[92vh] sm:max-h-[880px] max-w-[480px] p-0 border-none overflow-hidden sm:rounded-[2rem] bg-black"
      >
        <DialogTitle className="sr-only">{step === 'camera' ? 'Camera' : 'Edit media'}</DialogTitle>
        {step === 'camera' ? (
          <div className="relative w-full h-full bg-black">
            {stream && (
              <video
                data-camera-preview
                ref={attachStream}
                className={cn(
                  'absolute inset-0 w-full h-full object-cover',
                  facing === 'user' && '-scale-x-100'
                )}
                autoPlay
                muted
                playsInline
              />
            )}

            {/* Camera boot overlay */}
            {!stream && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                <p className="text-sm text-white/60">Starting camera…</p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-black text-center">
                <Camera className="h-10 w-10 text-white/40" />
                <p className="text-sm text-white/80">{error}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full bg-white/10 text-white border-white/20 hover:bg-white/20"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" /> Choose photo or video
                  </Button>
                </div>
              </div>
            )}

            {/* Flash overlay */}
            {flash && <div className="absolute inset-0 z-20 bg-white camera-flash" />}

            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-4">
              <Button variant="ghost" size="icon" onClick={handleClose} className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60">
                <X className="h-5 w-5" />
              </Button>

              <span className="text-white font-semibold text-sm bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
                {captureMode === 'photo' ? 'Photo' : `Video ${elapsedLabel}`}
              </span>

              <div className="flex items-center gap-2">
                {captureMode === 'photo' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTorch}
                    disabled={torchToggling}
                    className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60"
                  >
                    {torch ? <ZapOff className="h-5 w-5 text-primary" /> : <Zap className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setTorch(false); toggleFacing(); }}
                  className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60"
                >
                  <FlipHorizontal2 className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-0 inset-x-0 z-30 pb-8 pt-10 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center gap-6">
                {/* Upload */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-medium">Upload</span>
                </button>

                {/* Shutter */}
                <button
                  onClick={handleShutter}
                  disabled={!stream && !error}
                  className="relative h-20 w-20 rounded-full flex items-center justify-center focus:outline-none"
                >
                  {captureMode === 'video' && recording ? (
                    <>
                      <span className="absolute inset-0 rounded-full border-4 border-white/30" />
                      <span className="h-12 w-12 rounded-lg bg-destructive" />
                    </>
                  ) : (
                    <>
                      <span className="absolute inset-0 rounded-full border-4 border-white" />
                      <span className="h-16 w-16 rounded-full bg-white" />
                    </>
                  )}
                </button>

                {/* Photo/Video toggle */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1 bg-white/10 backdrop-blur rounded-full p-1 border border-white/20">
                    <button
                      onClick={() => { if (!recording) setCaptureMode('photo'); }}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all',
                        captureMode === 'photo' ? 'bg-primary text-white' : 'text-white/70'
                      )}
                    >
                      <Camera className="h-3.5 w-3.5" /> Photo
                    </button>
                    <button
                      onClick={() => { if (!recording) setCaptureMode('video'); }}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all',
                        captureMode === 'video' ? 'bg-primary text-white' : 'text-white/70'
                      )}
                    >
                      <Video className="h-3.5 w-3.5" /> Video
                    </button>
                  </div>
                  {captureMode === 'video' && (
                    <span className="text-[10px] text-white/60">up to {maxVideoDuration}s</span>
                  )}
                </div>
              </div>
            </div>

            {/* Recording timer chip */}
            {recording && (
              <div className="absolute top-16 inset-x-0 z-30 flex justify-center">
                <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white text-sm font-semibold tabular-nums">{elapsedLabel}</span>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        ) : (
          media && (
            <FilterEditor
              media={media}
              mode={mode}
              onBack={() => {
                URL.revokeObjectURL(media.url);
                setMedia(null);
                setStep('camera');
              }}
              onClose={handleClose}
              onDone={(result) => {
                URL.revokeObjectURL(media.url);
                setMedia(null);
                setStep('camera');
                const withDuration = result.kind === 'video' ? { ...result, duration: pendingDuration } : result;
                onDone(withDuration.file, withDuration);
              }}
            />
          )
        )}

        <style>{`
          @keyframes camera-flash-fade {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          .camera-flash {
            animation: camera-flash-fade 0.28s ease-out forwards;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
