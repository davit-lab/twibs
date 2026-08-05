import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationItem from './NotificationItem';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, CheckCheck, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationDropdownProps {
  className?: string;
}

type Filter = 'all' | 'unread';

export default function NotificationDropdown({ className }: NotificationDropdownProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const shown = filter === 'all' ? notifications : notifications.filter(n => !n.is_read);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative rounded-full', className)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium shadow-md shadow-destructive/30">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[360px] max-w-[calc(100vw-1.5rem)] p-0 rounded-3xl border-border/60 shadow-2xl shadow-black/20 bg-popover overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {unreadCount > 0 && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                  </>
                )}
              </span>
              <h3 className="text-[15px] font-bold tracking-tight">
                Notifications
              </h3>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                title="Mark all as read"
                onClick={markAllAsRead}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : "You're all caught up"}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pb-2.5">
          <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-full">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                filter === 'all'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All
              {notifications.length > 0 && (
                <span className={cn(
                  'text-[10px] font-bold min-w-[15px] h-4 px-1 rounded-full flex items-center justify-center tabular-nums',
                  filter === 'all' ? 'bg-background/20 text-background' : 'bg-surface-3 text-muted-foreground'
                )}>
                  {notifications.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                filter === 'unread'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Unread
              {unreadCount > 0 && (
                <span className={cn(
                  'text-[10px] font-bold min-w-[15px] h-4 px-1 rounded-full flex items-center justify-center tabular-nums',
                  filter === 'unread' ? 'bg-background/20 text-background' : 'bg-surface-3 text-muted-foreground'
                )}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[360px]">
          {loading ? (
            <div className="px-3 py-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3 px-2 py-2.5">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2 pt-0.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="relative mb-5">
                <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center">
                  <Bell className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
                </div>
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/25 ring-2 ring-popover">
                  <CheckCheck className="h-3.5 w-3.5 text-white" />
                </span>
              </div>
              <p className="text-sm font-bold">You're all caught up</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                {filter === 'unread'
                  ? 'No unread notifications right now.'
                  : 'New activity will appear here.'}
              </p>
            </div>
          ) : (
            <div className="px-2.5 pb-2 pt-1">
              {shown.slice(0, 8).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDelete={deleteNotification}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border/60 p-2">
          <button
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[13px] font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            View all notifications
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
