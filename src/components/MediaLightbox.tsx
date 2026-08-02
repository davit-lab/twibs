import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface MediaLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function MediaLightbox({ src, alt = '', onClose }: MediaLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => Math.min(4, Math.max(0.5, +(z * factor).toFixed(2))));
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-sm font-medium text-white/70 truncate max-w-[60vw]">{alt || 'Photo'}</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => zoomBy(0.5)}
            disabled={zoom <= 0.5}
            className="p-2.5 rounded-full text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => zoomBy(2)}
            disabled={zoom >= 4}
            className="p-2.5 rounded-full text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2.5 rounded-full text-white/80 hover:bg-white/10 transition-colors"
            aria-label="Rotate"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-full text-white/80 hover:bg-white/10 transition-colors"
            aria-label="Open in new tab"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={onClose}
            className="ml-1 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable image area */}
      <div
        ref={scrollRef}
        onClick={onClose}
        className="flex-1 overflow-auto overscroll-contain flex"
      >
        <div className="m-auto min-w-full min-h-full flex items-center justify-center p-4">
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="max-w-none select-none object-contain transition-transform duration-150"
            style={{
              width: `${100 * zoom}%`,
              transform: `rotate(${rotation}deg)`,
              cursor: zoom > 1 ? 'grab' : 'default',
            }}
          />
        </div>
      </div>

      {/* Bottom hint */}
      <div className="shrink-0 text-center py-3 text-xs text-white/50 font-medium">
        {zoom > 1 ? 'Scroll to move around · ' : ''}
        Scroll for full photo · Esc to close
      </div>
    </div>
  );
}
