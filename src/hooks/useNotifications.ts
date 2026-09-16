import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'star'
  | 'mention'
  | 'message'
  | 'comment'
  | 'system'
  | 'missed_call';

export interface ActorSummary {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface NotificationTarget {
  type: string;
  id: string;
  url: string | null;
  mediaType?: string | null;
  name?: string | null;
  slug?: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: ActorSummary;
  target?: NotificationTarget | null;
}
// Fetch lightweight preview info for content targets so rows can show
// real thumbnails (post media, reel, story, book cover, group image).
export async function enrichNotificationTargets(
  list: Notification[]
): Promise<Notification[]> {
  const candidates = list.filter(
    n => n.target_id && ['post', 'reel', 'story', 'book', 'group'].includes(n.target_type || '')
  );
  if (candidates.length === 0) return list;

  const map = new Map<string, NotificationTarget>();
  const put = (type: string, id: string, target: NotificationTarget) =>
    map.set(`${type}:${id}`, target);
  const idsFor = (type: string) => [
    ...new Set(candidates.filter(n => n.target_type === type).map(n => n.target_id!)),
  ];

  const postIds = idsFor('post');
  if (postIds.length > 0) {
    try {
      const { data } = await supabase
        .from('post_media')
        .select('post_id, url, type')
        .in('post_id', postIds)
        .order('position', { ascending: true });
      const firstByPost = new Map<string, { url: string; type: string }>();
      for (const media of data || []) {
        if (!firstByPost.has(media.post_id)) {
          firstByPost.set(media.post_id, { url: media.url, type: media.type });
        }
      }
      firstByPost.forEach((media, postId) =>
        put('post', postId, { type: 'post', id: postId, url: media.url, mediaType: media.type, name: null, slug: null })
      );
    } catch (error) {
      console.error('Error enriching post targets:', error);
    }
  }

  const reelIds = idsFor('reel');
  if (reelIds.length > 0) {
    try {
      const { data } = await supabase
        .from('reels')
        .select('id, thumbnail_url, video_url, caption')
        .in('id', reelIds);
      for (const reel of data || []) {
        put('reel', reel.id, {
          type: 'reel',
          id: reel.id,
          url: reel.thumbnail_url || reel.video_url || null,
          mediaType: 'video',
          name: reel.caption,
          slug: null,
        });
      }
    } catch (error) {
      console.error('Error enriching reel targets:', error);
    }
  }

  const storyIds = idsFor('story');
  if (storyIds.length > 0) {
    try {
      const { data } = await supabase
        .from('stories')
        .select('id, media_url, media_type')
        .in('id', storyIds);
      for (const story of data || []) {
        put('story', story.id, {
          type: 'story',
          id: story.id,
          url: story.media_url,
          mediaType: story.media_type,
          name: null,
          slug: null,
        });
      }
    } catch (error) {
      console.error('Error enriching story targets:', error);
    }
  }

  const bookIds = idsFor('book');
  if (bookIds.length > 0) {
    try {
      const { data } = await supabase
        .from('books')
        .select('id, cover_url, title')
        .in('id', bookIds);
      for (const book of data || []) {
        put('book', book.id, {
          type: 'book',
          id: book.id,
          url: book.cover_url,
          name: book.title,
          slug: null,
        });
      }
    } catch (error) {
      console.error('Error enriching book targets:', error);
    }
  }

  const groupIds = idsFor('group');
  if (groupIds.length > 0) {
    try {
      const { data } = await supabase
        .from('groups')
        .select('id, avatar_url, name, slug')
        .in('id', groupIds);
      for (const group of data || []) {
        put('group', group.id, {
          type: 'group',
          id: group.id,
          url: group.avatar_url,
          name: group.name,
          slug: group.slug,
        });
      }
    } catch (error) {
      console.error('Error enriching group targets:', error);
    }
  }

  return list.map(n => {
    if (!n.target_id || !n.target_type) return n;
    const target = map.get(`${n.target_type}:${n.target_id}`);
    return target ? { ...n, target } : n;
  });
}

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const actorIds = [...new Set((data || []).filter(n => n.actor_id).map(n => n.actor_id))];

      let actorMap = new Map();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', actorIds);

        actorMap = new Map(profiles?.map(p => [p.user_id, p]));
      }

      const notificationsWithActors = (data || []).map(n => ({
        ...n,
        actor: n.actor_id ? actorMap.get(n.actor_id) : undefined,
      })) as Notification[];

      const enriched = await enrichNotificationTargets(notificationsWithActors);
      setNotifications(enriched);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newNotif = payload.new as Notification;

          if (newNotif.actor_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('user_id, username, display_name, avatar_url')
              .eq('user_id', newNotif.actor_id)
              .single();

            newNotif.actor = profile || undefined;
          }

          const enriched = await enrichNotificationTargets([newNotif]);
          setNotifications(prev => [enriched[0] || newNotif, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev =>
            prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update notification' });
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to mark notifications as read' });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    try {
      const notif = notifications.find(n => n.id === notificationId);

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete notification' });
    }
  };

  const clearAll = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to clear notifications' });
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    refetch: fetchNotifications,
  };
}
