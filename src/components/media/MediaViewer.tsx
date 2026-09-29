import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewerImage {
  src: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}

interface MediaViewerProps {
  images: ViewerImage[];
  initialIndex?: number;
  onClose: () => void;
  initialRect?: DOMRect;
  enableFullscreen?: boolean;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

export default function MediaViewer({
  images,
  initialIndex = 0,
  onClose,
  initialRect,
  enableFullscreen = true,
}: MediaViewerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const closingRef = useRef(false);
  const openAnimDoneRef = useRef(false);
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), images.length - 1));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const current = images[index];
  const hasMultiple = images.length > 1;

  // Preload nearby images
  const preloadRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const toPreload = new Set<number>();
    toPreload.add(index);
    if (index > 0) toPreload.add(index - 1);
    if (index < images.length - 1) toPreload.add(index + 1);

    // Don't preload if already loaded
    const newToPreload = [...toPreload].filter(i => !preloadRef.current.has(i));
    newToPreload.forEach(i => {
      const img = new Image();
      img.src = images[i].src;
      preloadRef.current.add(i);
    });
  }, [index, images]);

  const goTo = useCallback((next: number) => {
    const total = images.length;
    setIndex(((next % total) + total) % total);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLoading(true);
    setError(false);
    openAnimDoneRef.current = false;
  }, [images.length]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z * factor).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (wrapperRef.current && initialRect) {
      const wrapper = wrapperRef.current;
      const finalRect = wrapper.getBoundingClientRect();
      const dx = initialRect.left - finalRect.left;
      const dy = initialRect.top - finalRect.top;
      const sx = initialRect.width / finalRect.width;
      wrapper.style.transition = 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)';
      wrapper.style.transform = `translate(${dx}px, ${dy}px) scale(${sx})`;
      window.setTimeout(onClose, 380);
      return;
    }
    onClose();
  }, [initialRect, onClose]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await viewerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        console.warn('Fullscreen request failed:', e);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (e) {
        console.warn('Exit fullscreen failed:', e);
      }
    }
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    viewerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
          setIsFullscreen(false);
        } else {
          requestClose();
        }
      }
      if (hasMultiple && e.key === 'ArrowRight') goTo(index + 1);
      if (hasMultiple && e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === ' ') {
        e.preventDefault();
        if (zoom > 1) resetView();
        else zoomBy(2);
      }
      if (e.key === 'f') toggleFullscreen();
      if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      previouslyFocused?.focus();
    };
  }, [goTo, index, hasMultiple, zoom, zoomBy, resetView, toggleFullscreen, requestClose]);

  // Handle fullscreen change
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    const pointers = [...activePointersRef.current.values()];
    if (pointers.length === 2) {
      pinchRef.current = {
        distance: Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y),
        zoom,
      };
      dragRef.current.dragging = false;
      swipeRef.current = null;
      return;
    }

    if (zoom > 1 && e.target === imgRef.current) {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        panStart: { ...pan },
        moved: false,
      };
    } else if (zoom <= 1) {
      swipeRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pointers = [...activePointersRef.current.values()];
    if (pointers.length === 2 && pinchRef.current) {
      const distance = Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(1, pinchRef.current.zoom * (distance / Math.max(1, pinchRef.current.distance))));
      setZoom(nextZoom);
      suppressClickRef.current = true;
      return;
    }

    const drag = dragRef.current;
    if (!drag.dragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) suppressClickRef.current = true;
    setPan({ x: drag.panStart.x + dx, y: drag.panStart.y + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const swipeStart = swipeRef.current;
    if (swipeStart && zoom <= 1 && activePointersRef.current.size === 1) {
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      if (hasMultiple && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        suppressClickRef.current = true;
        goTo(index + (dx < 0 ? 1 : -1));
      }
    }
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    swipeRef.current = null;
    dragRef.current.dragging = false;
  };

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    panStart: { x: number; y: number };
    moved: boolean;
  }>({ dragging: false, startX: 0, startY: 0, panStart: { x: 0, y: 0 }, moved: false });
  const suppressClickRef = useRef(false);

  const handleContainerClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (zoom > 1) {
      resetView();
    } else {
      requestClose();
    }
  };

  const handleImgLoad = () => {
    setLoading(false);
    setError(false);
    // Trigger opening animation
    setTimeout(() => {
      openAnimDoneRef.current = true;
    }, 0);
  };

  const handleImgError = () => {
    setLoading(false);
    setError(true);
  };

  const imgStyle: React.CSSProperties = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
    transformOrigin: 'center center',
    cursor: zoom > 1 ? 'grab' : 'zoom-in',
    maxWidth: '95vw',
    maxHeight: '85vh',
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

  const btnClass = cn(
    'flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-all duration-150',
    'hover:bg-white/10 hover:scale-105 active:scale-95',
    'disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:scale-100'
  );

  const isZoomed = zoom > 1.01;
  const thumbnailIndexes = useMemo(() => {
    if (images.length <= 5) return images.map((_, imageIndex) => imageIndex);
    const start = Math.max(0, Math.min(index - 2, images.length - 5));
    return Array.from({ length: 5 }, (_, offset) => start + offset);
  }, [images, index]);

  const viewer = (
    <div className={cn(
      'fixed inset-0 z-[2147483647] bg-black/95 flex flex-col',
      isFullscreen && 'bg-black'
    )}
      ref={viewerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
    >
      {/* Top bar */}
      <div className={cn(
        'absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 pt-3 pb-10',
        'bg-gradient-to-b from-black/80 to-transparent',
        isFullscreen && 'bg-black/90'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate max-w-[50vw]">
            {current.alt || 'Photo'}
          </p>
          {hasMultiple && (
            <span className="text-xs font-semibold text-white/50 tabular-nums whitespace-nowrap">
              {index + 1} / {images.length}
            </span>
          )}
          {current.width && current.height && (
            <span className="hidden text-xs text-white/40 sm:inline">
              {current.width}×{current.height}
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
          {isZoomed && (
            <button onClick={resetView} className={btnClass} aria-label="Reset view">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {enableFullscreen && (
            <button
              onClick={toggleFullscreen}
              className={btnClass}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          )}
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
        className="flex-1 overflow-hidden overscroll-contain relative touch-none select-none flex items-center justify-center"
      >
        <div className="w-full h-full flex items-center justify-center">
          <div
            key={`${current.src}-${index}`}
            ref={wrapperRef}
            className="lightbox-image-in"
            onClick={(event) => event.stopPropagation()}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <p className="text-center px-4">Failed to load image</p>
              </div>
            )}
            <img
              ref={imgRef}
              src={current.src}
              alt={current.alt || ''}
              onLoad={handleImgLoad}
              onError={handleImgError}
              onDoubleClick={() => (zoom > 1 ? resetView() : zoomBy(2))}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                }
              }}
              draggable={false}
              className={cn(
                'object-contain rounded-lg shadow-2xl shadow-black/60 ring-1 ring-white/10 transition-transform duration-150 ease-out',
                'max-w-[92vw] max-h-[82vh]'
              )}
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
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full',
                'bg-black/40 text-white/90 ring-1 ring-white/15',
                'hover:bg-black/60 backdrop-blur-sm transition-colors'
              )}
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goTo(index + 1);
              }}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full',
                'bg-black/40 text-white/90 ring-1 ring-white/15',
                'hover:bg-black/60 backdrop-blur-sm transition-colors'
              )}
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Thumbnail strip for many images */}
        {hasMultiple && images.length > 4 && (
          <div className="absolute bottom-11 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-lg bg-black/70 p-1.5">
            {thumbnailIndexes.map((imageIndex) => {
              const img = images[imageIndex];
              return (
              <button
                key={img.src}
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(imageIndex);
                }}
                className={cn(
                  'h-10 w-10 overflow-hidden rounded border-2 transition-colors sm:h-12 sm:w-12',
                  imageIndex === index
                    ? 'border-white'
                    : 'border-transparent hover:border-white/30'
                )}
                aria-label={`Go to image ${imageIndex + 1}`}
                aria-current={imageIndex === index ? 'true' : 'false'}
              >
                <img src={img.src} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div className={cn(
        'absolute bottom-0 inset-x-0 z-10 pt-10 pb-3 text-center',
        'bg-gradient-to-t from-black/80 to-transparent',
        isFullscreen && 'bg-black/90'
      )}>
        <p className="text-xs text-white/50 font-medium">
          {zoom > 1
            ? 'Drag to pan · Scroll to zoom · Double-click to reset'
            : 'Scroll or double-click to zoom · Esc to close'}
          {hasMultiple && ' · ← → to navigate'}
          {enableFullscreen && ' · F for fullscreen'}
        </p>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? viewer : createPortal(viewer, document.body);
}
