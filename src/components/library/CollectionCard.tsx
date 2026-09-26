import { FolderPlus } from 'lucide-react';
import type { Collection } from '@/hooks/useLibraryItems';

interface CollectionCardProps {
  collection: Collection;
  covers?: (string | null)[];
  onClick?: () => void;
}

export default function CollectionCard({ collection, covers, onClick }: CollectionCardProps) {
  const displayCovers = (covers ?? [])
    .map((c) => c ?? collection.cover_image)
    .filter((c): c is string => Boolean(c))
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left"
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted">
        {displayCovers.length > 0 ? (
          <div className="flex items-end justify-center gap-1.5 px-2 pb-2">
            {displayCovers.map((c, i) => (
              <img
                key={i}
                src={c}
                alt=""
                className="h-[92px] w-auto max-w-[36%] rounded border border-border/60 object-cover shadow-sm transition-transform duration-200 group-hover:-translate-y-1"
                style={{ zIndex: i }}
              />
            ))}
          </div>
        ) : (
          <FolderPlus className="h-8 w-8 text-muted-foreground/30" />
        )}
        <span className="absolute right-2 top-2 rounded-md border border-border/50 bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {collection.item_count} {collection.item_count === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="mt-2.5">
        <h3 className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
          {collection.name}
        </h3>
        {collection.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {collection.description}
          </p>
        )}
      </div>
    </button>
  );
}