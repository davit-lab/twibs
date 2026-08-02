import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNowStrict } from 'date-fns';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const RECENT_WINDOW_MS = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export type PresenceStatus = 'online' | 'recent' | 'offline';

export function getPresenceStatus(lastSeenAt: string | null | undefined): PresenceStatus {
  if (!lastSeenAt) return 'offline';
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff <= ONLINE_WINDOW_MS) return 'online';
  if (diff <= RECENT_WINDOW_MS) return 'recent';
  return 'offline';
}

export function isUserOnline(lastSeenAt: string | null | undefined): boolean {
  return getPresenceStatus(lastSeenAt) === 'online';
}

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'Last seen recently';
  const status = getPresenceStatus(lastSeenAt);
  if (status === 'online') return 'Online now';
  if (status === 'recent') {
    return `Active ${formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}`;
  }
  return `Last seen ${formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}`;
}

export function usePresence() {
  const { user } = useAuth();
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const ping = async () => {
      if (!userRef.current) return;
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('user_id', userRef.current.id);
      } catch (error) {
        console.error('Presence ping failed:', error);
      }
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);
}
