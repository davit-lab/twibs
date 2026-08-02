import { FolderPlus } from 'lucide-react';
import type { Collection } from '@/hooks/useLibraryItems';

interface CollectionCardProps {
  collection: Collection;
  onClick?: () => void;
}

export default function CollectionCard({ collection, onClick }: CollectionCardProps) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer"
    >
      <div className="rounded-xl border border-border overflow-hidden transition-all hover:border-primary/30 hover:-translate-y-0.5">
        <div className="aspect-[4/3] bg-muted flex items-center justify-center relative overflow-hidden">
          {collection.cover_image ? (
            <img
              src={collection.cover_image}
              alt={collection.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <FolderPlus className="h-10 w-10 text-muted-foreground/30" />
          )}
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-background/80 rounded-md text-xs font-medium border border-border/50">
            {collection.item_count} items
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
            {collection.name}
          </h3>
          {collection.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {collection.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
