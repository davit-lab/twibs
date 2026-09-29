import { cn } from '@/lib/utils';

export interface GalleryMediaItem {
  id?: string;
  url: string;
  type?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

interface PostMediaGalleryProps {
  items: GalleryMediaItem[];
  onOpenImage: (itemIndex: number, rect: DOMRect) => void;
  className?: string;
}

function isVideo(item: GalleryMediaItem) {
  return item.type === 'video' || item.type?.startsWith('video/');
}

export default function PostMediaGallery({ items, onOpenImage, className }: PostMediaGalleryProps) {
  if (items.length === 0) return null;

  const visibleItems = items.slice(0, 4);
  const remaining = Math.max(0, items.length - visibleItems.length);
  const single = items.length === 1;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/60 bg-muted',
        !single && 'grid h-[min(68vw,440px)] grid-cols-2 grid-rows-2 gap-0.5',
        items.length === 2 && 'grid-rows-1',
        className,
      )}
      aria-label={`${items.length} media item${items.length === 1 ? '' : 's'}`}
    >
      {visibleItems.map((item, index) => {
        const video = isVideo(item);
        const mediaClass = cn(
          'w-full',
          single ? 'h-auto max-h-[680px] object-contain' : 'h-full object-cover',
        );
        const cellClass = cn(
          'relative min-h-0 min-w-0 overflow-hidden bg-black/5 dark:bg-black/40',
          items.length === 3 && index === 0 && 'row-span-2',
        );

        return (
          <div key={item.id || `${item.url}-${index}`} className={cellClass}>
            {video ? (
              <video
                src={item.url}
                className={mediaClass}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <button
                type="button"
                onClick={(event) => onOpenImage(index, event.currentTarget.getBoundingClientRect())}
                className={cn('block w-full cursor-zoom-in', single ? 'h-auto max-h-[680px]' : 'h-full')}
                aria-label={`Open image ${index + 1} of ${items.length}`}
              >
                <img
                  src={item.url}
                  alt={item.alt || `Post image ${index + 1}`}
                  width={item.width || undefined}
                  height={item.height || undefined}
                  className={mediaClass}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            )}

            {remaining > 0 && index === visibleItems.length - 1 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenImage(index, event.currentTarget.getBoundingClientRect());
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-colors hover:bg-black/65"
                aria-label={`View all ${items.length} media items`}
              >
                <span className="text-2xl font-semibold tabular-nums">+{remaining}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
