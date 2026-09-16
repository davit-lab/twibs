import { Notification, NotificationType, ActorSummary } from '@/hooks/useNotifications';
import { format, isToday, isYesterday } from 'date-fns';

export type DateBucket = 'Today' | 'Yesterday' | 'Earlier';

export const DATE_BUCKETS: DateBucket[] = ['Today', 'Yesterday', 'Earlier'];

export function getDateBucket(date: string): DateBucket {
  const d = new Date(date);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

export function formatRelativeTime(date: string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 86_400_000 && isToday(d)) return `${Math.floor(diffMs / 3_600_000)}h`;
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

export interface NotificationRow {
  key: string;
  items: Notification[];
  isGroup: boolean;
}

// Group repeated likes (star) and follows onto the same target into a single
// aggregated activity row. Everything else stays a flat row.
export function groupNotifications(notifications: Notification[]): NotificationRow[] {
  const rows: NotificationRow[] = [];
  const groups = new Map<string, Notification[]>();

  for (const notification of notifications) {
    const groupable =
      (notification.type === 'star' || notification.type === 'follow') &&
      notification.target_type &&
      notification.target_id;
    const key = groupable
      ? `${notification.type}:${notification.target_type}:${notification.target_id}`
      : null;

    if (key) {
      const list = groups.get(key);
      if (list) {
        list.push(notification);
      } else {
        groups.set(key, [notification]);
      }
    } else {
      rows.push({ key: notification.id, items: [notification], isGroup: false });
    }
  }

  for (const items of groups.values()) {
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    rows.push({ key: items[0].id, items, isGroup: true });
  }

  rows.sort(
    (a, b) =>
      new Date(b.items[0].created_at).getTime() - new Date(a.items[0].created_at).getTime()
  );

  return rows;
}

function uniqueActors(items: Notification[]): ActorSummary[] {
  const seen = new Set<string>();
  const actors: ActorSummary[] = [];
  for (const item of items) {
    if (!item.actor || seen.has(item.actor.user_id)) continue;
    seen.add(item.actor.user_id);
    actors.push(item.actor);
  }
  return actors;
}

function namesPhrase(names: string[], total: number): string {
  if (names.length === 0) return '';
  if (total <= 2) {
    return names.join(' and ');
  }
  const shown = names.slice(0, 2);
  const others = total - shown.length;
  if (others <= 0) return shown.join(' and ');
  return `${shown.join(', ')} and ${others} other${others === 1 ? '' : 's'}`;
}

export function aggregateTitle(items: Notification[]): string {
  const type = items[0]?.type as NotificationType | undefined;
  const names = uniqueActors(items).map(a => a.display_name).filter(Boolean);
  const subject = namesPhrase(names, items.length);

  if (type === 'star') {
    return subject ? `${subject} starred your post` : items[0].title;
  }
  if (type === 'follow') {
    return subject
      ? `${subject} started following you`
      : items[0].title;
  }
  return items[0].title;
}

export function getNotificationLink(notification: Notification): string | null {
  switch (notification.target_type) {
    case 'profile':
      return notification.actor ? `/profile/${notification.actor.username}` : null;
    case 'post':
      return notification.target_id ? `/post/${notification.target_id}` : null;
    case 'reel':
      return notification.target_id ? `/reels/${notification.target_id}` : null;
    case 'book':
      return notification.target_id ? `/library/book/${notification.target_id}` : null;
    case 'conversation':
      return notification.target_id ? `/messages?conv=${notification.target_id}` : null;
    case 'group':
      return notification.target?.slug ? `/groups/${notification.target.slug}` : null;
    default:
      return null;
  }
}

export function getInitials(name: string): string {
  return (
    name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}