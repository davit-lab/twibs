import { Link } from 'react-router-dom';
import { Notification } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationActorStack } from './NotificationActorStack';
import { NotificationMediaPreview } from './NotificationMediaPreview';
import {
  aggregateTitle,
  formatRelativeTime,
  getNotificationLink,
} from './notification-utils';

interface AggregatedNotificationRowProps {
  items: Notification[];
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
}

// A combined row for several identical reactions to the same target, e.g.
// "Alex, Maria and 12 others starred your post".
export default function AggregatedNotificationRow({
  items,
  onMarkAsRead,
  onDelete,
  onClick,
}: AggregatedNotificationRowProps) {
  const latest = items[0];
  const unread = items.some(item => !item.is_read);
  const link = getNotificationLink(latest);
  const title = aggregateTitle(items);
  const actors = items
    .map(item => item.actor)
    .filter((actor): actor is NonNullable<typeof actor> => Boolean(actor))
    .reduce<Array<NonNullable<typeof latest.actor>>>((acc, actor) => {
      if (!acc.some(a => a.user_id === actor.user_id)) acc.push(actor);
      return acc;
    }, []);

  const label = [
    unread ? 'Unread' : 'Notification',
    title,
    formatRelativeTime(latest.created_at),
  ]
    .filter(Boolean)
    .join('. ');

  const handleActivate = () => {
    items.forEach(item => {
      if (!item.is_read) onMarkAsRead(item.id);
    });
    onClick?.();
  };

  const inner = (
    <div
      className={cn(
        'relative -mx-3 flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-200 focus:outline-none',
        unread ? 'bg-primary/[0.05]' : 'hover:bg-surface-2',
        link && 'cursor-pointer',
        !link && 'focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
      role={link ? undefined : 'button'}
      tabIndex={link ? undefined : 0}
      aria-label={link ? undefined : label}
      onClick={link ? undefined : handleActivate}
      onKeyDown={
        link
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            }
      }
    >
      {unread && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}

      <NotificationActorStack actors={actors} total={items.length} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'line-clamp-2 min-w-0 text-[14px] leading-snug',
              unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
            )}
          >
            {title}
          </p>
          <span
            className={cn(
              'mt-0.5 flex-shrink-0 text-[12px] tabular-nums',
              unread ? 'font-semibold text-primary' : 'text-muted-foreground/80'
            )}
          >
            {formatRelativeTime(latest.created_at)}
          </span>
        </div>
      </div>

      <NotificationMediaPreview notification={latest} />

      <div className="flex w-6 flex-shrink-0 flex-col items-center justify-center gap-1.5">
        {unread && (
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete notification"
          title="Delete"
          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            items.forEach(item => onDelete(item.id));
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="group block rounded-xl" aria-label={label} onClick={handleActivate}>
        {inner}
      </Link>
    );
  }

  return <div className="group">{inner}</div>;
}