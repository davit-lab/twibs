import { Link } from 'react-router-dom';
import { Notification, NotificationType } from '@/hooks/useNotifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  UserPlus,
  UserCheck,
  Star,
  MessageCircle,
  AtSign,
  Bell,
  MessageSquare,
  X,
  PhoneMissed,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
}

const iconMap: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  follow: UserPlus,
  follow_request: UserPlus,
  follow_accepted: UserCheck,
  star: Star,
  mention: AtSign,
  message: MessageCircle,
  comment: MessageSquare,
  system: Bell,
  missed_call: PhoneMissed,
};

const colorMap: Record<NotificationType, string> = {
  follow: 'text-primary bg-primary/10',
  follow_request: 'text-amber-400 bg-amber-400/15',
  follow_accepted: 'text-emerald-400 bg-emerald-400/15',
  star: 'text-amber-400 bg-amber-400/15',
  mention: 'text-sky-400 bg-sky-400/15',
  message: 'text-primary bg-primary/10',
  comment: 'text-violet-400 bg-violet-400/15',
  system: 'text-muted-foreground bg-surface-3',
  missed_call: 'text-red-400 bg-red-400/15',
};

const gradientMap: Record<NotificationType, string> = {
  follow: 'from-primary to-[hsl(285_80%_58%)]',
  follow_request: 'from-amber-400 to-orange-500',
  follow_accepted: 'from-emerald-400 to-teal-500',
  star: 'from-amber-400 to-yellow-500',
  mention: 'from-sky-400 to-blue-500',
  message: 'from-primary to-[hsl(285_80%_58%)]',
  comment: 'from-violet-400 to-purple-500',
  system: 'from-surface-4 to-surface-3',
  missed_call: 'from-red-400 to-rose-500',
};

function formatTime(date: string) {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

export default function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
}: NotificationItemProps) {
  const Icon = iconMap[notification.type] || Bell;
  const colorClass = colorMap[notification.type] || colorMap.system;
  const gradientClass = gradientMap[notification.type] || gradientMap.system;
  const unread = !notification.is_read;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const getLink = () => {
    switch (notification.target_type) {
      case 'profile':
        return notification.actor ? `/profile/${notification.actor.username}` : null;
      case 'post':
        return `/post/${notification.target_id}`;
      case 'conversation':
        return `/messages?conv=${notification.target_id}`;
      default:
        return null;
    }
  };

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    onClick?.();
  };

  const link = getLink();
  const content = (
    <div
      className={cn(
        'relative group flex items-start gap-3 px-3 py-3 rounded-2xl transition-all duration-200 cursor-pointer',
        unread ? 'bg-primary/[0.07]' : 'hover:bg-surface-2'
      )}
      onClick={handleClick}
    >
      {/* Unread accent bar */}
      {unread && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-primary" />
      )}

      {/* Icon or Avatar */}
      <div className="relative flex-shrink-0">
        {notification.actor ? (
          <>
            <div className={cn(
              'rounded-full p-[2px] transition-all duration-200',
              unread ? 'bg-gradient-to-tr from-primary to-[hsl(285_80%_58%)]' : 'bg-transparent'
            )}>
              <Avatar className="h-11 w-11 rounded-full ring-2 ring-background">
                <AvatarImage src={notification.actor.avatar_url || undefined} />
                <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                  {getInitials(notification.actor.display_name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className={cn(
              'absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background shadow-sm',
              colorClass
            )}>
              <Icon className="h-3 w-3" />
            </div>
          </>
        ) : (
          <div className={cn(
            'h-11 w-11 rounded-full flex items-center justify-center bg-gradient-to-br shadow-sm',
            gradientClass
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm flex-1 min-w-0 line-clamp-2',
            unread ? 'font-bold text-foreground' : 'font-medium text-foreground/90'
          )}>
            {notification.title}
          </p>
          <span className={cn(
            'text-[11px] flex-shrink-0 tabular-nums mt-0.5',
            unread ? 'text-primary font-semibold' : 'text-muted-foreground/80'
          )}>
            {formatTime(notification.created_at)}
          </span>
        </div>
        {notification.body && (
          <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-1">
            {notification.body}
          </p>
        )}
      </div>

      {/* Unread dot + Delete */}
      <div className="flex flex-col items-center justify-center gap-1.5 flex-shrink-0">
        {unread && (
          <span className="h-2 w-2 rounded-full bg-primary shadow-sm shadow-primary/40" />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(notification.id);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (link) {
    return <Link to={link} className="block">{content}</Link>;
  }

  return content;
}
