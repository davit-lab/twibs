import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, ImageOff } from 'lucide-react';
import MediaViewer from '@/components/media/MediaViewer';
import { cn } from '@/lib/utils';

interface GalleryImage {
  id: string;
  url: string;
}

export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const goTo = (next: number) => {
    const index = Math.max(0, Math.min(images.length - 1, next));
    setActive(index);
    railRef.current?.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground">
        <ImageOff className="h-7 w-7" aria-hidden />
        <span className="text-sm">No product photos</span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="group relative overflow-hidden rounded-lg bg-muted">
        <div
          ref={railRef}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const rail = event.currentTarget;
            if (!rail.clientWidth) return;
            setActive(Math.max(0, Math.min(images.length - 1, Math.round(rail.scrollLeft / rail.clientWidth))));
          }}
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className="relative aspect-square w-full shrink-0 snap-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              onClick={() => setViewerIndex(index)}
              aria-label={`Open ${name} photo ${index + 1}`}
            >
              {failed.has(image.id) ? (
                <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <ImageOff className="h-7 w-7" aria-hidden />
                  Photo unavailable
                </span>
              ) : (
                <img
                  src={image.url}
                  alt={`${name} · photo ${index + 1}`}
                  className="h-full w-full object-contain"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  onError={() => setFailed((current) => new Set(current).add(image.id))}
                />
              )}
              <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Expand className="h-4 w-4" aria-hidden />
              </span>
            </button>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-opacity hover:bg-background disabled:opacity-30 sm:flex"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              disabled={active === images.length - 1}
              className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-opacity hover:bg-background disabled:opacity-30 sm:flex"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
              {active + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 hidden grid-cols-6 gap-2 sm:grid">
          {images.slice(0, 6).map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-current={active === index ? 'true' : undefined}
              className={cn(
                'aspect-square overflow-hidden rounded-md border-2 bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active === index ? 'border-foreground' : 'border-transparent hover:border-border'
              )}
            >
              <img src={image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          images={images.map((image, index) => ({ src: image.url, alt: `${name} · photo ${index + 1}` }))}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          enableFullscreen
        />
      )}
    </div>
  );
}
