import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import BrandLogo from '@/components/brand/BrandLogo';
import { Notification } from '@/hooks/useNotifications';
import { getInitials } from './notification-utils';
import { cn } from '@/lib/utils';

const SIZES = {
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
} as const;

export function NotificationAvatar({
  notification,
  size = 'md',
  className,
}: {
  notification: Notification;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const sz = SIZES[size];

  if (notification.target_type === 'group' && notification.target?.url) {
    return (
      <Avatar className={cn(sz, 'rounded-xl ring-1 ring-border', className)}>
        <AvatarImage src={notification.target.url} alt={notification.target.name || 'Group'} />
        <AvatarFallback className="rounded-xl bg-surface-3 text-xs font-bold text-muted-foreground">
          {getInitials(notification.target.name || 'G')}
        </AvatarFallback>
      </Avatar>
    );
  }

  if (notification.actor && notification.type !== 'system') {
    return (
      <Avatar className={cn(sz, 'ring-1 ring-border', className)}>
        <AvatarImage
          src={notification.actor.avatar_url || undefined}
          alt={notification.actor.display_name}
        />
        <AvatarFallback className="bg-surface-3 text-xs font-semibold text-foreground/70">
          {getInitials(notification.actor.display_name)}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div
      className={cn(
        sz,
        'grid place-items-center rounded-full bg-surface-2 ring-1 ring-border',
        className
      )}
    >
      <BrandLogo className="h-6 w-6 object-contain" alt="Twibsers" />
    </div>
  );
}