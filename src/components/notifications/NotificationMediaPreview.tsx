import { Clapperboard } from 'lucide-react';
import { Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

// A small, useful thumbnail for content-related notifications.
// Vertical media (reel/story/book) stays vertical; posts render square.
export function NotificationMediaPreview({
  notification,
  className,
}: {
  notification: Notification;
  className?: string;
}) {
  const target = notification.target;
  if (!target?.url) return null;

  const kind = target.type;

  if (kind === 'group') return null;

  const vertical = kind === 'reel' || kind === 'story';
  const book = kind === 'book';

  return (
    <div
      className={cn(
        'relative flex-shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border',
        book ? 'h-14 w-10' : vertical ? 'h-16 w-12' : 'h-14 w-14',
        className
      )}
    >
      <img
        src={target.url}
        alt={target.name || 'Media preview'}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      {kind === 'reel' && (
        <span
          className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60"
          aria-hidden="true"
        >
          <Clapperboard className="h-3 w-3 text-white" />
        </span>
      )}
    </div>
  );
}