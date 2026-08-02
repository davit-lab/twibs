import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, NotificationType, Notification as AppNotification } from '@/hooks/useNotifications';
import MainLayout from '@/components/layout/MainLayout';
import NotificationItem from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, CheckCheck, Trash2, UserPlus, Star, MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabValue = 'all' | 'social' | 'activity' | 'messages';

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

  const tabs: { value: TabValue; label: string; icon: React.ElementType; count?: number }[] = [
    { value: 'all', label: 'All', icon: Bell, count: unreadCount },
    { value: 'social', label: 'Social', icon: UserPlus },
    { value: 'activity', label: 'Activity', icon: Star },
    { value: 'messages', label: 'Messages', icon: MessageCircle },
  ];

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 pb-24 lg:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pt-8 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Bell className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground font-medium">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="h-9 rounded-full border-border/60 gap-2" onClick={markAllAsRead}>
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full border-border/60 gap-2 text-destructive hover:text-destructive"
                onClick={clearAll}
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Pill Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    "ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold tabular-nums",
                    isActive ? "bg-white/20" : "bg-primary/10 text-primary"
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
            emptyMessage="No notifications yet"
          />
        )}

        {activeTab === 'social' && (
          <NotificationList
            notifications={socialNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyMessage="No social notifications"
            emptyIcon={UserPlus}
          />
        )}

        {activeTab === 'activity' && (
          <NotificationList
            notifications={activityNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyMessage="No activity notifications"
            emptyIcon={Star}
          />
        )}

        {activeTab === 'messages' && (
          <NotificationList
            notifications={messageNotifs}
            loading={loading}
            onMarkAsRead={markAsRead}
            onDelete={deleteNotification}
            emptyMessage="No message notifications"
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
  emptyMessage: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
}

function NotificationList({
  notifications,
  loading,
  onMarkAsRead,
  onDelete,
  emptyMessage,
  emptyIcon: EmptyIcon = Bell,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-4 shadow-sm shadow-black/[0.03]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
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
    return (
      <div className="bg-card border border-border/60 rounded-3xl p-12 text-center shadow-sm shadow-black/[0.03]">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <EmptyIcon className="h-9 w-9 text-primary/70" />
        </div>
        <p className="text-muted-foreground font-medium text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm shadow-black/[0.03] divide-y divide-border/60">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={onMarkAsRead}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
