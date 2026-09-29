import { useCallback, useRef, useState } from 'react';
import { X, GripVertical, Loader2, AlertCircle, RefreshCw, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/lib/media';

interface MediaPreviewGridProps {
  mediaItems: MediaItem[];
  onRemove: (id: string) => void;
  onReorder: (items: MediaItem[]) => void;
  onOpenViewer: (index: number) => void;
  maxItems?: number;
  disabled?: boolean;
  showAddButton?: boolean;
  onAddClick?: () => void;
  onRetry?: (id: string) => void | Promise<unknown>;
}

export function MediaPreviewGrid({
  mediaItems,
  onRemove,
  onReorder,
  onOpenViewer,
  maxItems = 22,
  disabled = false,
  showAddButton = true,
  onAddClick,
  onRetry,
}: MediaPreviewGridProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragRef = useRef<{ index: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (disabled) return;
    dragRef.current = { index };
    setDraggingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    const drag = dragRef.current;
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-media-index]') as HTMLElement | null;
    if (!el) return;
    const target = Number(el.dataset.mediaIndex);
    if (target === drag.index) return;
    const next = [...mediaItems];
    const [moved] = next.splice(drag.index, 1);
    next.splice(target, 0, moved);
    onReorder(next.map((m, i) => ({ ...m, order: i })));
    dragRef.current = { index: target };
    setDraggingIndex(target);
  }, [disabled, mediaItems, onReorder]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setDraggingIndex(null);
  }, []);

  const getGridCols = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-2';
    if (count === 4) return 'grid-cols-2';
    return 'grid-cols-3 sm:grid-cols-4';
  };

  const getItemStyle = (count: number, index: number) => {
    if (count === 1) return { aspectRatio: '16/9', maxHeight: '340px' };
    if (count === 2) return { aspectRatio: '1/1' };
    if (count === 3) {
      if (index === 0) return { aspectRatio: '1/1', gridRow: 'span 2' };
      return { aspectRatio: '1/1' };
    }
    if (count === 4) return { aspectRatio: '1/1' };
    return { aspectRatio: '1/1' };
  };

  const renderMediaContent = (item: MediaItem) => {
    if (item.type === 'image') {
      return (
        <img
          src={item.localPreviewUrl}
          alt="Upload preview"
          className="w-full h-full object-cover"
          draggable={false}
        />
      );
    }
    return (
      <video
        src={item.localPreviewUrl}
        className="w-full h-full object-cover"
        muted
        playsInline
        preload="metadata"
      />
    );
  };

  const renderOverlay = (item: MediaItem, index: number) => {
    if (item.uploadState === 'uploading') {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="font-medium">Uploading...</span>
            </div>
            <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${item.uploadProgress}%` }}
              />
            </div>
            <span className="text-xs text-white/70 mt-1">{Math.round(item.uploadProgress)}%</span>
          </div>
        </div>
      );
    }

    if (item.uploadState === 'failed') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-4">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-center text-sm text-white mb-3">Upload failed</p>
          <p className="text-center text-xs text-white/70 mb-3">{item.error}</p>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void Promise.resolve(onRetry?.(item.id)).catch(() => {});
              }}
              className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Remove
            </button>
          </div>
        </div>
      );
    }

    if (item.uploadState === 'retrying') {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
            <span className="font-medium">Retrying...</span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {mediaItems.length > 0 && (
        <>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {mediaItems.some((item) => item.uploadState === 'uploading' || item.uploadState === 'retrying')
              ? `Uploading ${mediaItems.filter((item) => item.uploadState === 'uploaded').length} of ${mediaItems.length}`
              : `${mediaItems.length} / ${maxItems} selected`}
          </span>
          <span className="hidden sm:inline">Drag the handle to reorder · first item is the cover</span>
        </div>
        <div
          className={cn(
            'grid max-h-[430px] gap-1.5 overflow-y-auto overscroll-contain pr-0.5',
            getGridCols(mediaItems.length)
          )}
          role="list"
          aria-label="Media previews"
        >
          {mediaItems.map((item, index) => (
            <div
              key={item.id}
              data-media-index={index}
              onClick={() => onOpenViewer(index)}
              className={cn(
                'relative group overflow-hidden rounded-lg bg-muted cursor-pointer select-none',
                draggingIndex === index && 'opacity-70 scale-[0.98] ring-2 ring-primary',
                item.uploadState === 'failed' && 'ring-2 ring-destructive'
              )}
              style={getItemStyle(mediaItems.length, index)}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenViewer(index);
                }
              }}
            >
              {renderMediaContent(item)}

              {item.type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                  <span className="h-10 w-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                    <svg className="h-4 w-4 text-white fill-white ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </span>
                </div>
              )}

              {item.source === 'gif' && (
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-semibold text-white uppercase tracking-wide pointer-events-none">
                  GIF
                </span>
              )}

              {renderOverlay(item, index)}

              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  handlePointerDown(event, index);
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute left-1 top-1 z-10 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-md bg-black/60 text-white active:cursor-grabbing sm:left-2 sm:top-2 sm:h-7 sm:w-7"
                aria-label={`Move media item ${index + 1}`}
              >
                <GripVertical className="h-4 w-4" />
              </button>

              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-destructive hover:scale-105 transition-all shadow-md"
                  aria-label="Remove media"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              )}

              <div className="absolute bottom-2 right-2 p-1 rounded-full bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <ZoomIn className="h-3.5 w-3.5" />
              </div>
            </div>
          ))}

          {showAddButton && mediaItems.length < maxItems && !disabled && (
            <button
              type="button"
              onClick={onAddClick}
              className={cn(
                'flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              )}
              aria-label={`Add media (${mediaItems.length}/${maxItems})`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-[11px] font-medium">{mediaItems.length} / {maxItems}</span>
            </button>
          )}

          {showAddButton && mediaItems.length >= maxItems && (
            <div className="flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/50 text-muted-foreground/50">
              <svg className="h-5 w-5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span className="text-[11px] font-medium">Maximum {maxItems} images</span>
            </div>
          )}
        </div>
        </>
      )}

      {mediaItems.length === 0 && showAddButton && !disabled && (
        <button
          type="button"
          onClick={onAddClick}
          className={cn(
            'w-full rounded-xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary py-8',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          aria-label="Add media"
        >
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 17" />
          </svg>
          <span className="text-sm font-medium">Add photos or videos</span>
          <span className="text-[11px] text-muted-foreground/70">Up to {maxItems} items</span>
        </button>
      )}
    </div>
  );
}
