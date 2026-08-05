import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, NotificationType, Notification as AppNotification } from '@/hooks/useNotifications';
import MainLayout from '@/components/layout/MainLayout';
import NotificationItem from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, CheckCheck, Trash2, UserPlus, Star, MessageCircle, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabValue = 'all' | 'social' | 'activity' | 'messages';

type DateBucket = 'Today' | 'Yesterday' | 'Earlier';

function getDateBucket(date: string): DateBucket {
  const d = new Date(date);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

export default function Notifications() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || !user) {
    return null;
  }

  const filterNotifications = (types: NotificationType[]) => {
    return notifications.filter(n => types.includes(n.type));
  };

  const socialNotifs = filterNotifications(['follow', 'follow_request', 'follow_accepted']);
  const activityNotifs = filterNotifications(['star', 'mention', 'comment']);
  const messageNotifs = filterNotifications(['message', 'missed_call']);

  const tabs: { value: TabValue; label: string; icon: React.ElementType; count: number }[] = [
    { value: 'all', label: 'All', icon: Bell, count: unreadCount },
    { value: 'social', label: 'Social', icon: UserPlus, count: socialNotifs.length },
    { value: 'activity', label: 'Activity', icon: Star, count: activityNotifs.length },
    { value: 'messages', label: 'Messages', icon: MessageCircle, count: messageNotifs.length },
  ];

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 pb-24 lg:pb-8">
        {/* Header */}
        <div className="relative pt-8 pb-5 overflow-hidden">
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 h-28 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] flex items-center justify-center shadow-lg shadow-primary/25">
                  <Bell className="h-6 w-6 text-white" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center shadow-lg shadow-destructive/30 tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-[24px] font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text leading-tight">
                  Notifications
                </h1>
                <p className="text-sm text-muted-foreground font-medium">
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                    : 'All caught up!'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full bg-surface-2 hover:bg-surface-3 text-muted-foreground hover:text-foreground text-[13px] font-semibold"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Mark all read</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-full bg-surface-2 hover:bg-surface-3 text-muted-foreground hover:text-destructive text-[13px] font-semibold"
                  onClick={clearAll}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Clear all</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Pill Tabs */}
        <div className="flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 whitespace-nowrap',
                  isActive
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center tabular-nums',
                    isActive ? 'bg-background/20 text-background' : 'bg-surface-3 text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {activeTab === 'all' && (
          <NotificationList
            notifications={notifications}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyTitle="No notifications yet"
            emptyHint="We'll let you know when someone follows you, stars your work or sends you a message."
          />
        )}

        {activeTab === 'social' && (
          <NotificationList
            notifications={socialNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyTitle="No social notifications"
            emptyHint="Follows and friend requests will show up here."
            emptyIcon={UserPlus}
          />
        )}

        {activeTab === 'activity' && (
          <NotificationList
            notifications={activityNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyTitle="No activity notifications"
            emptyHint="Stars, mentions and comments will appear here."
            emptyIcon={Star}
          />
        )}

        {activeTab === 'messages' && (
          <NotificationList
            notifications={messageNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyTitle="No message notifications"
            emptyHint="New messages and missed calls will appear here."
            emptyIcon={MessageCircle}
          />
        )}
      </div>
    </MainLayout>
  );
}

interface NotificationListProps {
  notifications: AppNotification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  emptyTitle: string;
  emptyHint?: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
}

function NotificationList({
  notifications,
  loading,
  onMarkAsRead,
  onDelete,
  emptyTitle,
  emptyHint,
  emptyIcon: EmptyIcon = Bell,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-2xl">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} icon={EmptyIcon} />;
  }

  const buckets: DateBucket[] = ['Today', 'Yesterday', 'Earlier'];
  const grouped = buckets
    .map(bucket => ({
      bucket,
      items: notifications.filter(n => getDateBucket(n.created_at) === bucket),
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map(group => (
        <div key={group.bucket}>
          <div className="flex items-center gap-3 px-1 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
              {group.bucket}
            </span>
            <span className="flex-1 h-px bg-border/60" />
          </div>
          <div className="space-y-1.5">
            {group.items.map((notification, index) => (
              <div
                key={notification.id}
                className="chat-item-in"
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
              >
                <NotificationItem
                  notification={notification}
                  onMarkAsRead={onMarkAsRead}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  hint,
  icon: EmptyIcon = Bell,
}: {
  title: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card px-6 pt-16 pb-12 text-center">
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      {/* Floating sparkles */}
      <span className="pointer-events-none absolute top-10 left-[16%] h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse" />
      <span className="pointer-events-none absolute top-24 right-[14%] h-2 w-2 rounded-full bg-amber-400/50 animate-pulse" style={{ animationDelay: '0.6s' }} />
      <span className="pointer-events-none absolute bottom-16 left-[20%] h-1.5 w-1.5 rounded-full bg-sky-400/50 animate-pulse" style={{ animationDelay: '1.1s' }} />
      <span className="pointer-events-none absolute bottom-12 right-[22%] h-2 w-2 rounded-full bg-emerald-400/40 animate-pulse" style={{ animationDelay: '1.6s' }} />

      {/* Illustration */}
      <div className="relative inline-block mb-9">
        <div className="absolute -left-10 top-3 w-12 h-14 rounded-2xl bg-card border border-border shadow-lg shadow-black/10 rotate-[-14deg] flex items-center justify-center">
          <UserPlus className="h-5 w-5 text-emerald-400/80" />
        </div>
        <div className="absolute -right-10 bottom-2 w-12 h-14 rounded-2xl bg-card border border-border shadow-lg shadow-black/10 rotate-[12deg] flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-primary/70" />
        </div>

        <div className="relative h-28 w-28 rounded-[32px] bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] flex items-center justify-center shadow-2xl shadow-primary/30 rotate-[-5deg]">
          <EmptyIcon className="h-12 w-12 text-white" strokeWidth={1.8} />
        </div>

        <span className="absolute -top-1.5 -right-1.5 h-7 w-7 rounded-full bg-destructive ring-4 ring-card flex items-center justify-center shadow-lg shadow-destructive/30">
          <Bell className="h-3.5 w-3.5 text-white" />
        </span>
        <span className="absolute -top-5 left-4 text-amber-400 drop-shadow">
          <Star className="h-5 w-5 fill-amber-400/40" />
        </span>
      </div>

      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      {hint && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
          {hint}
        </p>
      )}

      <Button
        onClick={() => navigate('/explore')}
        className="mt-7 h-10 px-6 rounded-full bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] text-white shadow-lg shadow-primary/25 hover:opacity-95 gap-2"
      >
        <Compass className="h-4 w-4" />
        Explore
      </Button>
    </div>
  );
}
