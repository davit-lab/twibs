import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, NotificationType } from '@/hooks/useNotifications';
import MainLayout from '@/components/layout/MainLayout';
import NotificationItem from '@/components/notifications/NotificationItem';
import AggregatedNotificationRow from '@/components/notifications/AggregatedNotificationRow';
import { NotificationGroup } from '@/components/notifications/NotificationGroup';
import NotificationEmptyState from '@/components/notifications/NotificationEmptyState';
import WelcomeBackNotification, { WelcomeCounts } from '@/components/notifications/WelcomeBackNotification';
import {
  DATE_BUCKETS,
  getDateBucket,
  groupNotifications,
  NotificationRow,
} from '@/components/notifications/notification-utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabValue = 'all' | 'social' | 'activity' | 'messages';

export default function Notifications() {
  const { user, profile, loading: authLoading } = useAuth();
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
  const streamRef = useRef<HTMLDivElement>(null);

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

  const visibleNotifications = {
    all: notifications,
    social: socialNotifs,
    activity: activityNotifs,
    messages: messageNotifs,
  }[activeTab];

  const tabs: { value: TabValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'social', label: 'Follows', count: socialNotifs.length },
    { value: 'activity', label: 'Interactions', count: activityNotifs.length },
    { value: 'messages', label: 'Messages', count: messageNotifs.length },
  ];

  const unreadList = notifications.filter(n => !n.is_read);
  const welcomeCounts: WelcomeCounts = {
    unread: unreadCount,
    messages: unreadList.filter(n => n.type === 'message' || n.type === 'missed_call').length,
    likes: unreadList.filter(n => n.type === 'star').length,
    follows: unreadList.filter(n => n.type === 'follow').length,
    comments: unreadList.filter(n => n.type === 'comment').length,
    mentions: unreadList.filter(n => n.type === 'mention').length,
  };

  const rows = groupNotifications(visibleNotifications);

  const buckets = DATE_BUCKETS.map(bucket => ({
    bucket,
    rows: rows.filter(row => getDateBucket(row.items[0].created_at) === bucket),
  })).filter(b => b.rows.length > 0);

  const handleSeeWhatsNew = () => {
    streamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const emptyCopy: Record<TabValue, { title: string; hint: string }> = {
    all: {
      title: "You're all caught up.",
      hint: 'When people interact with you, it shows up here — likes, comments, follows and messages.',
    },
    social: {
      title: 'No new followers yet.',
      hint: 'Follows and friend requests will show up here.',
    },
    activity: {
      title: 'No interactions yet.',
      hint: 'Likes, mentions and comments will appear here.',
    },
    messages: {
      title: 'No messages yet.',
      hint: 'New messages and missed calls will appear here.',
    },
  };

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 lg:pb-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 pt-8 pb-5">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Stay up to date with what's happening around you.
            </p>
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Mark all as read</span>
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear all notifications"
                title="Clear all"
                className="h-9 w-9 rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={clearAll}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Filters */}
        <nav aria-label="Filter notifications" className="border-b border-border/70">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-[13px] font-semibold transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={cn(
                        'text-[11px] tabular-nums',
                        isActive ? 'text-primary' : 'text-muted-foreground/50'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Welcome back */}
        {activeTab === 'all' && !loading && unreadCount > 0 && (
          <WelcomeBackNotification
            displayName={profile?.display_name || undefined}
            counts={welcomeCounts}
            onSeeWhatsNew={handleSeeWhatsNew}
          />
        )}

        {/* Stream */}
        <div ref={streamRef} className="mt-4 scroll-mt-24">
          {loading ? (
            <div className="space-y-1.5 pt-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3 px-1 py-3">
                  <Skeleton className="h-11 w-11 flex-shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-14 w-14 flex-shrink-0 rounded-lg" />
                </div>
              ))}
            </div>
          ) : buckets.length === 0 ? (
            <NotificationEmptyState
              title={emptyCopy[activeTab].title}
              hint={emptyCopy[activeTab].hint}
            />
          ) : (
            <div className="space-y-8 pt-2">
              {buckets.map(bucket => (
                <NotificationGroup
                  key={bucket.bucket}
                  bucket={bucket.bucket}
                  count={bucket.rows.reduce((sum, row) => sum + row.items.length, 0)}
                >
                  {bucket.rows.map((row: NotificationRow, index: number) => (
                    <div
                      key={row.key}
                      className="chat-item-in"
                      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                    >
                      {row.isGroup ? (
                        <AggregatedNotificationRow
                          items={row.items}
                          onMarkAsRead={markAsRead}
                          onDelete={deleteNotification}
                        />
                      ) : (
                        <NotificationItem
                          notification={row.items[0]}
                          onMarkAsRead={markAsRead}
                          onDelete={deleteNotification}
                        />
                      )}
                    </div>
                  ))}
                </NotificationGroup>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}