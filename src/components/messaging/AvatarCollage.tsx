import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollageItem {
  url?: string | null;
  name?: string;
}

interface AvatarCollageProps {
  items: CollageItem[];
  size?: number;
  count?: number;
  className?: string;
}

export default function AvatarCollage({ items, size = 48, count, className }: AvatarCollageProps) {
  const initials = (name?: string) =>
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 1) || '?';

  const badge = count !== undefined && count > 4 ? (
    <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-background border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center tabular-nums z-10">
      {count}
    </span>
  ) : null;

  if (items.length === 0) {
    return (
      <div
        className={cn('relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 ring-2 ring-background flex-shrink-0', className)}
        style={{ width: size, height: size }}
      >
        <Users className="text-white" style={{ width: size * 0.42, height: size * 0.42 }} />
        {badge}
      </div>
    );
  }

  if (items.length === 1) {
    return (
      <div
        className={cn('relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 ring-2 ring-background overflow-hidden flex-shrink-0', className)}
        style={{ width: size, height: size }}
      >
        {items[0].url ? (
          <img src={items[0].url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-white font-bold" style={{ fontSize: size * 0.4 }}>
            {initials(items[0].name)}
          </span>
        )}
        {badge}
      </div>
    );
  }

  const cellSize = (size - 2) / 2;
  const shown = items.slice(0, 3);
  const hasMore = items.length > shown.length || (count ?? items.length) > shown.length + 1;

  const cells: Array<CollageItem | { ghost?: boolean; plus?: boolean }> = [...shown];
  while (cells.length < 3) cells.push({ ghost: true });
  cells.push(hasMore ? { plus: true } : { ghost: true });

  return (
    <div
      className={cn('relative grid grid-cols-2 gap-[2px] rounded-2xl ring-2 ring-background overflow-hidden flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {cells.map((cell, i) => {
        const isGhost = 'ghost' in cell && cell.ghost;
        const isPlus = 'plus' in cell && cell.plus;
        const item = cell as CollageItem;
        return (
          <div
            key={i}
            className={cn(
              'flex items-center justify-center overflow-hidden',
              isGhost ? 'bg-gradient-to-br from-primary/45 to-primary/25' : 'bg-gradient-to-br from-primary to-primary/60'
            )}
          >
            {isPlus ? (
              <span className="text-white font-bold" style={{ fontSize: cellSize * 0.42 }}>+</span>
            ) : isGhost ? (
              <span className="text-white/70 font-bold" style={{ fontSize: cellSize * 0.42 }}>+</span>
            ) : item.url ? (
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white font-bold" style={{ fontSize: cellSize * 0.42 }}>
                {initials(item.name)}
              </span>
            )}
          </div>
        );
      })}
      {badge}
    </div>
  );
}
