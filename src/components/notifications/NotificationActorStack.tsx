import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ActorSummary } from '@/hooks/useNotifications';
import { getInitials } from './notification-utils';
import { cn } from '@/lib/utils';

export function NotificationActorStack({
  actors,
  total = actors.length,
  max = 3,
  size = 'md',
  className,
}: {
  actors: ActorSummary[];
  total?: number;
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const sz = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  const shown = actors.slice(0, max);
  const extra = Math.max(0, total - shown.length);

  return (
    <div className={cn('flex', className)}>
      {shown.map((actor, index) => (
        <div key={actor.user_id} className={cn(index > 0 && '-ml-2')}>
          <Avatar className={cn(sz, 'ring-2 ring-background')}>
            <AvatarImage src={actor.avatar_url || undefined} alt={actor.display_name} />
            <AvatarFallback className="bg-surface-3 text-[10px] font-semibold text-foreground/70">
              {getInitials(actor.display_name)}
            </AvatarFallback>
          </Avatar>
        </div>
      ))}
      {extra > 0 && (
        <span
          className={cn(
            '-ml-2',
            sz,
            'grid place-items-center rounded-full bg-surface-3 ring-2 ring-background text-[11px] font-bold text-foreground/70'
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}