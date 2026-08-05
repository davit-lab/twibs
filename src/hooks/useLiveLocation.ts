import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LiveLocationSession {
  id: string;
  conversation_id: string;
  user_id: string;
  message_id: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  current_lat: number | null;
  current_lng: number | null;
  accuracy: number | null;
  updated_at: string;
  profiles?: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export type LiveLocationDuration = 15 | 60;

export type LocationSignal = 'acquiring' | 'gps' | 'coarse' | 'unavailable';

export function isSessionActive(session: LiveLocationSession, now: number = Date.now()): boolean {
  if (session.ended_at) return false;
  if (new Date(session.expires_at).getTime() <= now) return false;
  return true;
}

// Accuracy thresholds in meters.
// - Under GOOD_ACCURACY we trust the fix as real GPS (phone / precise location).
// - Between GOOD and USABLE it is WiFi/network-based (coarse but roughly right).
// - Above USABLE it is almost certainly IP/VPN/ISP-derived — we won't publish it.
const GOOD_ACCURACY = 100;
const USABLE_ACCURACY = 2000;
const ACQUIRE_TIMEOUT_MS = 25000;
const MAX_DRIFT_M = 200;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
};

export function accuracySignal(accuracy: number | null | undefined): LocationSignal {
  if (accuracy == null) return 'acquiring';
  if (accuracy <= GOOD_ACCURACY) return 'gps';
  if (accuracy <= USABLE_ACCURACY) return 'coarse';
  return 'unavailable';
}

export function formatAccuracy(accuracy: number | null | undefined): string {
  if (accuracy == null) return '';
  if (accuracy >= 1000) return `± ${(accuracy / 1000).toFixed(1)} km`;
  return `± ${Math.round(accuracy)} m`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number;
}

function fixFromPosition(pos: GeolocationPosition): LocationFix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

export function useLiveLocation(conversationId: string | null) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<LiveLocationSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<LocationSignal>('acquiring');
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  const watcherRef = useRef<number | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionIdsRef = useRef<string[]>([]);
  const publishedFixRef = useRef<LocationFix | null>(null);
  const acquireTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bestFixRef = useRef<LocationFix | null>(null);

  const hasActiveSession = sessions.some((s) => s.user_id === user?.id && isSessionActive(s));
  const activeSessions = sessions.filter((s) => isSessionActive(s));

  const fetchSessions = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data, error } = await supabase
        .from('live_location_sessions')
        .select(`
          *,
          profiles:profiles!live_location_sessions_user_id_fkey (display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as LiveLocationSession[];
      setSessions(rows);
      sessionIdsRef.current = rows.map((r) => r.id);
    } catch (err) {
      console.error('Error fetching live location sessions:', err);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`live-locations-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_location_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const session = payload.new as LiveLocationSession;
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', session.user_id)
            .single();
          setSessions((prev) => [
            { ...session, profiles: profile || null },
            ...prev.filter((s) => s.id !== session.id),
          ]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_location_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as LiveLocationSession;
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_location_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id: string }).id;
          setSessions((prev) => prev.filter((s) => s.id !== oldId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  useEffect(() => {
    return () => {
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      if (acquireTimerRef.current) {
        clearTimeout(acquireTimerRef.current);
        acquireTimerRef.current = null;
      }
    };
  }, []);

  const publishPosition = useCallback(
    async (sessionId: string, pos: GeolocationPosition) => {
      await supabase
        .from('live_location_sessions')
        .update({
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    },
    []
  );

  // Watch handler that only accepts fixes that are GPS-grade, an improvement
  // over what we last published, or close enough to be plausible drift.
  // Rejects far-away coarse jumps (IP/VPN/ISP-derived coordinates).
  const handleWatchPosition = useCallback(
    (sessionId: string, pos: GeolocationPosition) => {
      const fix = fixFromPosition(pos);
      const last = publishedFixRef.current;

      if (last) {
        const distance = haversineDistance(last.lat, last.lng, fix.lat, fix.lng);
        const isBetter = fix.accuracy <= last.accuracy;
        const isGpsGrade = fix.accuracy <= GOOD_ACCURACY;
        if (!isGpsGrade && !isBetter && distance > MAX_DRIFT_M) {
          return;
        }
      }

      publishedFixRef.current = fix;
      setLastAccuracy(fix.accuracy);
      setSignal(accuracySignal(fix.accuracy));
      publishPosition(sessionId, pos);
    },
    [publishPosition]
  );

  // Acquire a usable fix before creating the session. Prefers a real GPS fix,
  // falls back to the best (lowest-accuracy) fix seen within the window.
  const acquirePosition = useCallback((): Promise<LocationFix> => {
    return new Promise<LocationFix>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported on this device.'));
        return;
      }

      bestFixRef.current = null;

      const settleWithBest = () => {
        if (acquireTimerRef.current) {
          clearTimeout(acquireTimerRef.current);
          acquireTimerRef.current = null;
        }
        const best = bestFixRef.current;
        if (best) {
          resolve(best);
        } else {
          reject(new Error('Could not get your location. Check your browser permission.'));
        }
      };

      const onSuccess = (pos: GeolocationPosition) => {
        const fix = fixFromPosition(pos);
        const best = bestFixRef.current;
        if (!best || fix.accuracy < best.accuracy) {
          bestFixRef.current = fix;
        }
        if (fix.accuracy <= GOOD_ACCURACY) {
          settleWithBest();
        }
      };

      const onError = (err: GeolocationPositionError) => {
        if (bestFixRef.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission denied. Allow location access to share your live position.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          if (acquireTimerRef.current) {
            clearTimeout(acquireTimerRef.current);
            acquireTimerRef.current = null;
          }
          reject(new Error('GPS signal unavailable. Move near a window or go outside, then try again.'));
        }
      };

      watcherRef.current = navigator.geolocation.watchPosition(onSuccess, onError, WATCH_OPTIONS);
      acquireTimerRef.current = setTimeout(() => {
        settleWithBest();
        if (watcherRef.current !== null) {
          navigator.geolocation.clearWatch(watcherRef.current);
          watcherRef.current = null;
        }
      }, ACQUIRE_TIMEOUT_MS);
    });
  }, []);

  const startSharing = useCallback(
    async (durationMinutes: LiveLocationDuration = 15) => {
      if (!conversationId || !user) {
        setError('You must be in a conversation to share your location.');
        return null;
      }
      setRequesting(true);
      setError(null);
      setSignal('acquiring');
      setLastAccuracy(null);
      publishedFixRef.current = null;

      try {
        const fix = await acquirePosition();

        if (fix.accuracy > USABLE_ACCURACY) {
          throw new Error(
            'Only approximate network location is available right now — not your real position (IP/VPN based). Allow precise location, or share from your phone with GPS.'
          );
        }

        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

        const { data: session, error: sessionError } = await supabase
          .from('live_location_sessions')
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            expires_at: expiresAt,
            current_lat: fix.lat,
            current_lng: fix.lng,
            accuracy: fix.accuracy,
          })
          .select()
          .single();

        if (sessionError) throw sessionError;

        const { error: msgError } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: 'Shared a live location',
          location_session_id: session.id,
        });
        if (msgError) throw msgError;

        publishedFixRef.current = fix;
        setLastAccuracy(fix.accuracy);
        setSignal(accuracySignal(fix.accuracy));

        activeSessionIdRef.current = session.id;
        watcherRef.current = navigator.geolocation.watchPosition(
          (pos) => handleWatchPosition(session.id, pos),
          (err) => console.error('Location watch error:', err),
          WATCH_OPTIONS
        );

        await fetchSessions();
        return session.id;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start sharing your location.');
        return null;
      } finally {
        setRequesting(false);
      }
    },
    [conversationId, user, acquirePosition, handleWatchPosition, fetchSessions]
  );

  const stopSharing = useCallback(
    async (sessionId: string) => {
      const { error } = await supabase
        .from('live_location_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) console.error('Error stopping live location:', error);

      if (activeSessionIdRef.current === sessionId) {
        activeSessionIdRef.current = null;
        if (watcherRef.current !== null) {
          navigator.geolocation.clearWatch(watcherRef.current);
          watcherRef.current = null;
        }
        publishedFixRef.current = null;
        setLastAccuracy(null);
        setSignal('acquiring');
      }
      await fetchSessions();
    },
    [fetchSessions]
  );

  return {
    sessions,
    activeSessions,
    hasActiveSession,
    loading,
    requesting,
    error,
    signal,
    lastAccuracy,
    startSharing,
    stopSharing,
    refresh: fetchSessions,
  };
}

export function useLiveLocationSession(sessionId: string | null) {
  const [session, setSession] = useState<LiveLocationSession | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data } = await supabase
        .from('live_location_sessions')
        .select(`
          *,
          profiles:profiles!live_location_sessions_user_id_fkey (display_name, avatar_url)
        `)
        .eq('id', sessionId)
        .single();
      if (data) setSession(data as LiveLocationSession);
    };

    load();

    channel = supabase
      .channel(`live-location-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_location_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession((prev) => (prev ? { ...prev, ...(payload.new as LiveLocationSession) } : (payload.new as LiveLocationSession)));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'live_location_sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => setSession(null)
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return session;
}
