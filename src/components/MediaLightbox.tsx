import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

export interface LightboxImage {
  src: string;
  alt?: string;
}

interface MediaLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
  images?: LightboxImage[];
  initialIndex?: number;
  // bounding rect of the thumbnail (viewport coords) to animate from/to
  initialRect?: DOMRect;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export default function MediaLightbox({
  src,
  alt = '',
  onClose,
  images,
  initialIndex = 0,
  initialRect,
}: MediaLightboxProps) {
  const gallery = images && images.length > 0 ? images : [{ src, alt }];
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const openAnimDoneRef = useRef(false);
  const [index, setIndex] = useState(
    Math.min(Math.max(initialIndex, 0), gallery.length - 1)
  );

  const current = gallery[index];
  const hasMultiple = gallery.length > 1;

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    panStart: { x: number; y: number };
    moved: boolean;
  }>({ dragging: false, startX: 0, startY: 0, panStart: { x: 0, y: 0 }, moved: false });
  const suppressClickRef = useRef(false);

  const goTo = useCallback(
    (next: number) => {
      setIndex((i) => {
        const total = gallery.length;
        return ((next % total) + total) % total;
      });
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setTimeout(() => {
        if (wrapperRef.current) {
          wrapperRef.current.style.transform = '';
          wrapperRef.current.style.transition = 'none';
        }
      }, 0);
      setTimeout(() => {
        if (wrapperRef.current) {
          wrapperRef.current.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
        }
      }, 10);
    },
    [gallery.length]
  );

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z * factor).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
      if (hasMultiple && e.key === 'ArrowRight') goTo(index + 1);
      if (hasMultiple && e.key === 'ArrowLeft') goTo(index - 1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [/* onClose removed from deps; use requestClose */ hasMultiple, goTo, index]);

  const handleWheel = (e: React.WheelEvent) => {
    zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      panStart: { ...pan },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) suppressClickRef.current = true;
    setPan({ x: drag.panStart.x + dx, y: drag.panStart.y + dy });
  };

  const handlePointerUp = () => {
    dragRef.current.dragging = false;
  };

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    // if we have an initialRect and wrapperRef, animate back to thumbnail
    if (wrapperRef.current && initialRect) {
      const wrapper = wrapperRef.current;
      const finalRect = wrapper.getBoundingClientRect();
      const dx = initialRect.left - finalRect.left;
      const dy = initialRect.top - finalRect.top;
      const sx = initialRect.width / finalRect.width;
      wrapper.style.transition = 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)';
      wrapper.style.transform = `translate(${dx}px, ${dy}px) scale(${sx})`;
      // wait for transition to finish then call onClose
      const handler = () => {
        onClose();
      };
      setTimeout(handler, 380);
      return;
    }
    onClose();
  };

  const handleContainerClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    requestClose();
  };

  const imgStyle: React.CSSProperties = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
    cursor: zoom > 1 ? 'grab' : 'zoom-in',
  };

  // Opening FLIP animation from thumbnail
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.style.transform = '';
    wrapper.style.transition = 'none';

    if (!initialRect) return;

    const finalRect = wrapper.getBoundingClientRect();
    if (!finalRect.width || !finalRect.height) return;

    const dx = initialRect.left - finalRect.left;
    const dy = initialRect.top - finalRect.top;
    const sx = initialRect.width / finalRect.width;
    const sy = initialRect.height / finalRect.height;

    wrapper.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    const frame = requestAnimationFrame(() => {
      wrapper.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
      wrapper.style.transform = '';
    });

    const t = setTimeout(() => {
      openAnimDoneRef.current = true;
    }, 460);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
    };
  }, [initialRect, index]);

  const btnClass =
    'flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-all duration-150 hover:bg-white/10 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md lightbox-backdrop flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 pt-3 pb-10 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate max-w-[50vw]">
            {current.alt || 'Photo'}
          </p>
          {hasMultiple && (
            <span className="text-xs font-semibold text-white/50 tabular-nums whitespace-nowrap">
              {index + 1} / {gallery.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => zoomBy(0.5)}
            disabled={zoom <= MIN_ZOOM}
            className={btnClass}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => zoomBy(2)}
            disabled={zoom >= MAX_ZOOM}
            className={btnClass}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className={btnClass}
            aria-label="Rotate"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          {zoom !== 1 || rotation !== 0 ? (
            <button onClick={resetView} className={btnClass} aria-label="Reset view">
              <RefreshCw className="h-4 w-4" />
            </button>
          ) : null}
          <a
            href={current.src}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            aria-label="Open in new tab"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={requestClose}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        onClick={handleContainerClick}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex-1 overflow-hidden overscroll-contain relative touch-none select-none"
      >
        <div className="w-full h-full flex items-center justify-center">
          <div
            key={`${current.src}-${index}`}
            ref={wrapperRef}
            className="lightbox-image-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={current.src}
              alt={current.alt || alt}
              onDoubleClick={() => (zoom > 1 ? resetView() : zoomBy(2))}
              draggable={false}
              className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg shadow-2xl shadow-black/60 ring-1 ring-white/10 transition-transform duration-150 ease-out"
              style={imgStyle}
            />
          </div>
        </div>

        {/* Prev / Next */}
        {hasMultiple && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goTo(index - 1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/90 ring-1 ring-white/15 hover:bg-black/60 backdrop-blur-sm transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goTo(index + 1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/90 ring-1 ring-white/15 hover:bg-black/60 backdrop-blur-sm transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-0 inset-x-0 z-10 pt-10 pb-3 text-center bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-xs text-white/50 font-medium">
          Scroll to zoom · Double-click to toggle · Esc to close
        </p>
      </div>
    </div>
  );
}
