import { useCallback, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, Check, RotateCcw } from 'lucide-react';

interface StoryCropDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void;
  file: File | null;
  type: 'image' | 'video';
}

const TARGET_W = 1080;
const TARGET_H = 1920;
const TARGET_RATIO = TARGET_W / TARGET_H; // 0.5625

export default function StoryCropDialog({ open, onClose, onConfirm, file, type }: StoryCropDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offX: 0, offY: 0 });
  const [mediaNatural, setMediaNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const url = file ? URL.createObjectURL(file) : null;

  const getContainerSize = useCallback(() => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }, []);

  const handleMediaLoad = useCallback(() => {
    const natural = type === 'image'
      ? { w: imgRef.current?.naturalWidth || 0, h: imgRef.current?.naturalHeight || 0 }
      : { w: videoRef.current?.videoWidth || 0, h: videoRef.current?.videoHeight || 0 };
    setMediaNatural(natural);
    const cs = getContainerSize();
    if (cs) setContainerSize(cs);
    setOffsetX(0);
    setOffsetY(0);
  }, [type, getContainerSize]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offX: offsetX, offY: offsetY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffsetX(dragStart.current.offX + dx);
    setOffsetY(dragStart.current.offY + dy);
  };

  const handlePointerUp = () => setDragging(false);

  const computeCrop = useCallback(async (): Promise<File | null> => {
    if (!mediaNatural || !containerSize || !file) return null;

    const { w: natW, h: natH } = mediaNatural;
    const { w: cW, h: cH } = containerSize;

    // The crop viewport in container coords
    let vpW: number, vpH: number;
    if (cW / cH > TARGET_RATIO) {
      vpH = cH;
      vpW = cH * TARGET_RATIO;
    } else {
      vpW = cW;
      vpH = cW / TARGET_RATIO;
    }
    const vpX = (cW - vpW) / 2;
    const vpY = (cH - vpH) / 2;

    // Scale from container to natural
    // The media is rendered to fill container while preserving aspect ratio
    const mediaScale = Math.max(cW / natW, cH / natH);
    const mediaW = natW * mediaScale;
    const mediaH = natH * mediaScale;
    const mediaX = (cW - mediaW) / 2 + offsetX;
    const mediaY = (cH - mediaH) / 2 + offsetY;

    // Viewport rect in natural coords
    const sx = (vpX - mediaX) / mediaScale;
    const sy = (vpY - mediaY) / mediaScale;
    const sw = vpW / mediaScale;
    const sh = vpH / mediaScale;

    if (type === 'image') {
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_W;
      canvas.height = TARGET_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const img = imgRef.current;
      if (!img) return null;
      ctx.drawImage(img, Math.max(0, sx), Math.max(0, sy), Math.min(sw, natW), Math.min(sh, natH), 0, 0, TARGET_W, TARGET_H);
      return new Promise<File>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      });
    }

    // Video crop: play video, seek to a frame, draw to canvas
    const video = videoRef.current;
    if (!video) return null;
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, Math.max(0, sx), Math.max(0, sy), Math.min(sw, natW), Math.min(sh, natH), 0, 0, TARGET_W, TARGET_H);
    // Re-encode via captureStream
    const stream = canvas.captureStream(0);
    const mimeType = 'video/webm;codecs=vp9';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    return new Promise<File>((resolve) => {
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), { type: 'video/webm' }));
      };
      recorder.start();
      // Draw single frame
      video.currentTime = video.currentTime;
      requestAnimationFrame(() => {
        ctx.drawImage(video, Math.max(0, sx), Math.max(0, sy), Math.min(sw, natW), Math.min(sh, natH), 0, 0, TARGET_W, TARGET_H);
        setTimeout(() => recorder.stop(), 100);
      });
    });
  }, [mediaNatural, containerSize, offsetX, offsetY, file, type]);

  const handleConfirm = async () => {
    const result = await computeCrop();
    if (result) {
      onConfirm(result);
      setOffsetX(0);
      setOffsetY(0);
    }
  };

  if (!file || !url) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setOffsetX(0); setOffsetY(0); } }}>
      <DialogContent
        hideCloseButton
        className="w-full h-[100dvh] sm:h-[92vh] sm:max-h-[880px] max-w-[480px] p-0 border-none overflow-hidden sm:rounded-[2rem] bg-black"
      >
        <DialogTitle className="sr-only">Crop story</DialogTitle>

        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-4">
          <Button variant="ghost" size="icon" onClick={() => { onClose(); setOffsetX(0); setOffsetY(0); }} className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-white font-semibold text-sm bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
            Crop to 9:16
          </span>
          <Button variant="ghost" size="icon" onClick={() => { setOffsetX(0); setOffsetY(0); }} className="h-10 w-10 rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60">
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>

        {/* Crop viewport */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            {type === 'image' ? (
              <img
                ref={imgRef}
                src={url}
                onLoad={handleMediaLoad}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
              />
            ) : (
              <video
                ref={videoRef}
                src={url}
                onLoadedData={handleMediaLoad}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
              />
            )}

            {/* 9:16 viewport mask overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top dark bar */}
              <div className="absolute inset-x-0 top-0 bg-black/60" style={{ height: 'calc((100% - 100% * 56.25 / 100%) / 2)' }} />
              {/* Bottom dark bar */}
              <div className="absolute inset-x-0 bottom-0 bg-black/60" style={{ height: 'calc((100% - 100% * 56.25 / 100%) / 2)' }} />
              {/* Left dark bar */}
              <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: 'calc((100% - 100% * 100% * 56.25 / 100%) / 2)' }} />
              {/* Right dark bar */}
              <div className="absolute inset-y-0 right-0 bg-black/60" style={{ width: 'calc((100% - 100% * 100% * 56.25 / 100%) / 2)' }} />

              {/* Viewport border */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="border-2 border-white/40 rounded-sm" style={{ width: 'min(100%, calc(100vh * 56.25))', height: 'min(calc(100vw / 56.25), 100%)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 inset-x-0 z-30 pb-8 pt-10 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center">
            <Button
              onClick={handleConfirm}
              className="rounded-full px-8 bg-primary text-primary-foreground font-semibold"
            >
              <Check className="h-4 w-4 mr-2" /> Crop & Continue
            </Button>
          </div>
          <p className="text-center text-white/50 text-xs mt-3">Drag to reposition, then crop</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
