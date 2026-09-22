import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { showIncomingCallNotification } from '@/lib/pushNotifications';
import { CallSession } from '@/lib/callTypes';
import { MAX_INCOMING_QUEUE, RING_TIMEOUT_MS, STALE_CALL_GRACE_MS } from '@/lib/callConstants';

export interface CallerProfile {
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export interface QueuedCall {
  session: CallSession;
  callerProfile: CallerProfile | null;
}

export interface HeldCall {
  session: CallSession;
  callerProfile: CallerProfile | null;
  isActive: boolean;
}

export interface IncomingCallsOptions {
  /**
   * Live view of the global call engine. Lets the queue logic know whether
   * the user is already busy in a call, and — for simultaneous dials —
   * which conversation they are currently ringing themselves.
   */
  getEngineState?: () => { busy: boolean; outgoingReceiverId: string | null };
}

export function useIncomingCalls({ getEngineState }: IncomingCallsOptions = {}) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [callerProfile, setCallerProfile] = useState<CallerProfile | null>(null);
  const [callQueue, setCallQueue] = useState<QueuedCall[]>([]);
  const [heldCalls, setHeldCalls] = useState<HeldCall[]>([]);
  const [isOnActiveCall, setIsOnActiveCall] = useState(false);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const notificationRef = useRef<Notification | null>(null);
  const processedCallsRef = useRef<Set<string>>(new Set());
  const missedNotifiedRef = useRef<Set<string>>(new Set());

  // Refs mirroring state so async realtime handlers never read stale closures
  const incomingCallRef = useRef<CallSession | null>(null);
  const callQueueRef = useRef<QueuedCall[]>([]);
  const isOnActiveCallRef = useRef(false);
  const doNotDisturbRef = useRef(false);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callQueueRef.current = callQueue;
  }, [callQueue]);

  useEffect(() => {
    isOnActiveCallRef.current = isOnActiveCall;
  }, [isOnActiveCall]);

  useEffect(() => {
    doNotDisturbRef.current = doNotDisturb;
  }, [doNotDisturb]);

  /**
   * The engine is busy when the user has an active/connecting/ringing call OR
   * one of these legacy flags is set. Kept separate so the queue decision is
   * always in sync with the live engine rather than a mirrored state.
   */
  const isEngineBusy = useCallback((): boolean => {
    return getEngineState?.().busy ?? isOnActiveCallRef.current;
  }, [getEngineState]);

  // Fetch DND status
  useEffect(() => {
    if (!user) return;

    const fetchDND = async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('do_not_disturb')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setDoNotDisturb(data.do_not_disturb ?? false);
      }
    };

    fetchDND();

    const channel = supabase
      .channel('dnd-preference-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { do_not_disturb?: boolean };
          if (updated.do_not_disturb !== undefined) {
            setDoNotDisturb(updated.do_not_disturb);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Check if caller is blocked
  const isCallerBlocked = useCallback(async (callerId: string): Promise<boolean> => {
    if (!user) return false;

    const { data } = await supabase
      .from('call_blocks')
      .select('id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', callerId)
      .maybeSingle();

    return !!data;
  }, [user]);

  // Create missed call notification (deduped per session)
  const createMissedCallNotification = useCallback(async (
    callerId: string,
    callType: CallSession['call_type'],
    conversationId: string,
    sessionId?: string
  ) => {
    if (!user) return;
    if (sessionId && missedNotifiedRef.current.has(sessionId)) return;
    if (sessionId) missedNotifiedRef.current.add(sessionId);

    try {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'missed_call',
        title: `Missed ${callType} call`,
        body: `Missed ${callType} call from this conversation`,
        actor_id: callerId,
        target_type: 'conversation',
        target_id: conversationId,
        is_read: false,
      });
    } catch (error) {
      console.error('[IncomingCalls] Failed to create missed call notification:', error);
    }
  }, [user]);

  /**
   * Reject a call with a terminal DB status without creating a missed
   * notification (used for busy auto-rejects and blocked/dnd declines).
   */
  const hardRejectCall = useCallback(async (session: CallSession, status: CallSession['status']) => {
    try {
      await supabase
        .from('call_sessions')
        .update({
          status,
          ended_at: new Date().toISOString(),
          ended_reason: status,
        })
        .eq('id', session.id);
      console.log(`[IncomingCalls] Auto-rejected call (${status}):`, session.id);
    } catch (error) {
      console.error('[IncomingCalls] Failed to auto-reject call:', error);
    }
  }, []);

  // Process a single incoming (ringing) call session
  const processIncomingSession = useCallback(async (session: CallSession) => {
    // Prevent processing the same call twice
    if (processedCallsRef.current.has(session.id)) {
      return;
    }
    processedCallsRef.current.add(session.id);

    // Abandoned calls: if the caller's client died mid-ring (or the caller
    // reloaded) the row can stay `ringing` forever. A row that is older than
    // the ring timeout (+ grace) must never ring this device again — close it
    // out as missed without showing an overlay, so reloads never produce
    // "unexpected" incoming calls.
    const createdAtMs = session.created_at ? new Date(session.created_at).getTime() : Date.now();
    if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > RING_TIMEOUT_MS + STALE_CALL_GRACE_MS) {
      console.log('[IncomingCalls] Discarding stale ringing call:', session.id);
      await hardRejectCall(session, 'missed');
      return;
    }

    // Check if caller is blocked
    const blocked = await isCallerBlocked(session.caller_id);
    if (blocked) {
      await hardRejectCall(session, 'declined');
      return;
    }

    // Check DND mode
    if (doNotDisturbRef.current) {
      await hardRejectCall(session, 'declined');
      return;
    }

    // Simultaneous dial: I am currently calling this person myself.
    const outgoingReceiver = getEngineState?.().outgoingReceiverId ?? null;
    if (outgoingReceiver && outgoingReceiver === session.caller_id) {
      // Deterministic resolution: the call I initiated keeps ringing; reject
      // the mirror call so only one session ever becomes active.
      console.log('[IncomingCalls] Simultaneous dial detected, rejecting mirror call:', session.id);
      await hardRejectCall(session, 'busy');
      return;
    }

    // Fetch caller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('user_id', session.caller_id)
      .single();

    // Already handling a call (active or incoming) -> queue or busy.
    if (isEngineBusy() || incomingCallRef.current) {
      if (callQueueRef.current.length >= MAX_INCOMING_QUEUE) {
        console.log('[IncomingCalls] Queue full, auto-rejecting with busy:', session.id);
        await hardRejectCall(session, 'busy');
        return;
      }

      console.log('[IncomingCalls] Adding call to queue');
      setCallQueue((prev) => {
        const exists = prev.some((c) => c.session.id === session.id);
        if (exists) return prev;
        return [...prev, { session, callerProfile: profile }];
      });

      if (profile) {
        await showIncomingCallNotification(
          profile.display_name,
          session.call_type,
          session.conversation_id,
          profile.avatar_url
        );
      }
      return;
    }

    // Free: show the incoming call immediately.
    setCallerProfile(profile);
    setIncomingCall(session);

    if (profile) {
      const notification = await showIncomingCallNotification(
        profile.display_name,
        session.call_type,
        session.conversation_id,
        profile.avatar_url
      );
      notificationRef.current = notification;
    }
  }, [isCallerBlocked, hardRejectCall, isEngineBusy, getEngineState]);

  // Recover ringing calls on mount / reconnect (e.g. after a reload)
  useEffect(() => {
    if (!user) return;

    const recoverRingingCalls = async () => {
      const { data } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('status', 'ringing')
        .order('created_at', { ascending: true });

      for (const session of (data || []) as unknown as CallSession[]) {
        await processIncomingSession(session);
      }
    };

    recoverRingingCalls();
  }, [user, processIncomingSession]);

  // Handle incoming calls subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-incoming-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
        },
        async (payload) => {
          const session = payload.new as CallSession;

          // Only handle calls where we are the receiver and it's ringing
          if (session.receiver_id !== user.id || session.status !== 'ringing') {
            return;
          }

          await processIncomingSession(session);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
        },
        async (payload) => {
          const session = payload.new as CallSession;

          // The current incoming call changed status.
          if (incomingCallRef.current?.id === session.id && session.status !== 'ringing') {
            // Missed (never answered / receiver-side timeout).
            if (session.status === 'missed' && session.receiver_id === user.id) {
              await createMissedCallNotification(
                session.caller_id,
                session.call_type,
                session.conversation_id,
                session.id
              );
            }

            setIncomingCall(null);
            setCallerProfile(null);
            processedCallsRef.current.delete(session.id);

            if (notificationRef.current) {
              notificationRef.current.close();
              notificationRef.current = null;
            }

            // Process next call from the queue.
            if (callQueueRef.current.length > 0) {
              const [nextCall, ...rest] = callQueueRef.current;
              setIncomingCall(nextCall.session);
              setCallerProfile(nextCall.callerProfile);
              setCallQueue(rest);
            }
          }

          // A queued call changed status -> drop it from the queue.
          if (session.status !== 'ringing') {
            const dropped = callQueueRef.current.some((c) => c.session.id === session.id);
            if (dropped) {
              if (session.status === 'missed' && session.receiver_id === user.id) {
                await createMissedCallNotification(
                  session.caller_id,
                  session.call_type,
                  session.conversation_id,
                  session.id
                );
              }
              setCallQueue((prev) => prev.filter((c) => c.session.id !== session.id));
              processedCallsRef.current.delete(session.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, processIncomingSession, createMissedCallNotification]);

  const clearIncomingCall = useCallback(() => {
    if (incomingCall) {
      processedCallsRef.current.delete(incomingCall.id);
    }

    setIncomingCall(null);
    setCallerProfile(null);

    if (notificationRef.current) {
      notificationRef.current.close();
      notificationRef.current = null;
    }

    // Process next call in queue
    if (callQueue.length > 0) {
      const [nextCall, ...rest] = callQueue;
      setIncomingCall(nextCall.session);
      setCallerProfile(nextCall.callerProfile);
      setCallQueue(rest);
    }
  }, [callQueue, incomingCall]);

  const setActiveCall = useCallback((active: boolean) => {
    setIsOnActiveCall(active);
  }, []);

  const declineQueuedCall = useCallback(async (sessionId: string) => {
    try {
      await supabase
        .from('call_sessions')
        .update({
          status: 'declined',
          ended_at: new Date().toISOString(),
          ended_reason: 'declined',
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('[IncomingCalls] Failed to decline queued call:', error);
    }

    setCallQueue((prev) => prev.filter((c) => c.session.id !== sessionId));
    processedCallsRef.current.delete(sessionId);
  }, []);

  const holdAndSwitch = useCallback((
    currentSession: CallSession | null,
    currentProfile: CallerProfile | null,
    targetSessionId: string
  ) => {
    const queuedCall = callQueue.find((c) => c.session.id === targetSessionId);
    const heldCall = heldCalls.find((c) => c.session.id === targetSessionId);

    const targetCall = queuedCall || heldCall;
    if (!targetCall) return null;

    if (currentSession && currentProfile) {
      setHeldCalls((prev) => [
        ...prev.filter((c) => c.session.id !== currentSession.id),
        { session: currentSession, callerProfile: currentProfile, isActive: false },
      ]);
    }

    if (queuedCall) {
      setCallQueue((prev) => prev.filter((c) => c.session.id !== targetSessionId));
    } else {
      setHeldCalls((prev) => prev.filter((c) => c.session.id !== targetSessionId));
    }

    return targetCall;
  }, [callQueue, heldCalls]);

  const resumeHeldCall = useCallback((sessionId: string) => {
    const heldCall = heldCalls.find((c) => c.session.id === sessionId);
    if (!heldCall) return null;

    setHeldCalls((prev) => prev.filter((c) => c.session.id !== sessionId));
    return heldCall;
  }, [heldCalls]);

  const endHeldCall = useCallback(async (sessionId: string) => {
    try {
      await supabase
        .from('call_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('[IncomingCalls] Failed to end held call:', error);
    }

    setHeldCalls((prev) => prev.filter((c) => c.session.id !== sessionId));
  }, []);

  return {
    incomingCall,
    callerProfile,
    callQueue,
    heldCalls,
    isOnActiveCall,
    doNotDisturb,
    clearIncomingCall,
    setActiveCall,
    declineQueuedCall,
    holdAndSwitch,
    resumeHeldCall,
    endHeldCall,
  };
}