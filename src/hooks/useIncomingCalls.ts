import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { showIncomingCallNotification } from '@/lib/pushNotifications';
import { CallSession } from '@/hooks/useWebRTC';

interface CallerProfile {
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

export function useIncomingCalls() {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [callerProfile, setCallerProfile] = useState<CallerProfile | null>(null);
  const [callQueue, setCallQueue] = useState<QueuedCall[]>([]);
  const [heldCalls, setHeldCalls] = useState<HeldCall[]>([]);
  const [isOnActiveCall, setIsOnActiveCall] = useState(false);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const notificationRef = useRef<Notification | null>(null);
  const processedCallsRef = useRef<Set<string>>(new Set());

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

  // Create missed call notification
  const createMissedCallNotification = useCallback(async (
    callerId: string,
    callType: 'audio' | 'video',
    conversationId: string
  ) => {
    if (!user) return;

    try {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'missed_call',
        title: `Missed ${callType} call`,
        body: `You missed a ${callType} call`,
        actor_id: callerId,
        target_type: 'conversation',
        target_id: conversationId,
        is_read: false,
      });
      console.log('[IncomingCalls] Created missed call notification');
    } catch (error) {
      console.error('[IncomingCalls] Failed to create missed call notification:', error);
    }
  }, [user]);

  // Auto-decline call
  const autoDeclineCall = useCallback(async (session: CallSession, reason: 'dnd' | 'blocked') => {
    try {
      const now = new Date().toISOString();
      await supabase
        .from('call_sessions')
        .update({
          status: 'declined',
          ended_at: now,
        })
        .eq('id', session.id);

      await createMissedCallNotification(
        session.caller_id,
        session.call_type,
        session.conversation_id
      );

      console.log(`[IncomingCalls] Auto-declined call (${reason}):`, session.id);
    } catch (error) {
      console.error('[IncomingCalls] Failed to auto-decline call:', error);
    }
  }, [createMissedCallNotification]);

  // Process a single incoming (ringing) call session
  const processIncomingSession = useCallback(async (session: CallSession) => {
    // Prevent processing the same call twice
    if (processedCallsRef.current.has(session.id)) {
      return;
    }
    processedCallsRef.current.add(session.id);

    console.log('[IncomingCalls] Incoming call:', session.id, session.call_type);

    // Check if caller is blocked
    const blocked = await isCallerBlocked(session.caller_id);
    if (blocked) {
      console.log('[IncomingCalls] Caller is blocked, auto-declining');
      await autoDeclineCall(session, 'blocked');
      return;
    }

    // Check DND mode
    if (doNotDisturbRef.current) {
      console.log('[IncomingCalls] DND is on, auto-declining');
      await autoDeclineCall(session, 'dnd');
      return;
    }
    
    // Fetch caller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('user_id', session.caller_id)
      .single();

    // If already handling a call, add to queue
    if (isOnActiveCallRef.current || incomingCallRef.current) {
      console.log('[IncomingCalls] Adding call to queue');
      setCallQueue(prev => [...prev, { session, callerProfile: profile }]);
      
      if (profile) {
        await showIncomingCallNotification(
          profile.display_name,
          session.call_type,
          session.conversation_id,
          profile.avatar_url
        );
      }
    } else {
      // Set as current incoming call
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
    }
  }, [isCallerBlocked, autoDeclineCall]);

  // Recover ringing calls on mount / reconnect (e.g. after a reload)
  useEffect(() => {
    if (!user) return;

    const recoverRingingCalls = async () => {
      console.log('[IncomingCalls] Recovering ringing calls for user:', user.id);
      const { data } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('status', 'ringing')
        .order('created_at', { ascending: true });

      for (const session of (data || []) as CallSession[]) {
        await processIncomingSession(session);
      }
    };

    recoverRingingCalls();
  }, [user, processIncomingSession]);

  // Handle incoming calls subscription
  useEffect(() => {
    if (!user) return;

    console.log('[IncomingCalls] Listening for incoming calls for user:', user.id);

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
          
          // Handle current incoming call status change
          if (incomingCallRef.current?.id === session.id && session.status !== 'ringing') {
            console.log('[IncomingCalls] Current call status changed:', session.status);
            
            // Check if it was a missed call (unanswered for ~30s)
            if (session.status === 'declined' && session.receiver_id === user.id) {
              const endedAt = session.ended_at ? new Date(session.ended_at) : new Date();
              const createdAt = new Date(session.created_at);
              const duration = (endedAt.getTime() - createdAt.getTime()) / 1000;
              
              if (duration >= 25) {
                await createMissedCallNotification(
                  session.caller_id,
                  session.call_type,
                  session.conversation_id
                );
              }
            }
            
            setIncomingCall(null);
            setCallerProfile(null);
            processedCallsRef.current.delete(session.id);
            
            if (notificationRef.current) {
              notificationRef.current.close();
              notificationRef.current = null;
            }

            // Process next call in queue
            if (callQueueRef.current.length > 0) {
              const [nextCall, ...rest] = callQueueRef.current;
              setIncomingCall(nextCall.session);
              setCallerProfile(nextCall.callerProfile);
              setCallQueue(rest);
            }
          }
          
          // Handle queued call status changes
          if (session.status !== 'ringing') {
            setCallQueue(prev => {
              const filtered = prev.filter(c => c.session.id !== session.id);
              if (filtered.length !== prev.length) {
                processedCallsRef.current.delete(session.id);
              }
              return filtered;
            });
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
      const now = new Date().toISOString();
      await supabase
        .from('call_sessions')
        .update({
          status: 'declined',
          ended_at: now,
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('[IncomingCalls] Failed to decline queued call:', error);
    }
    
    setCallQueue(prev => prev.filter(c => c.session.id !== sessionId));
    processedCallsRef.current.delete(sessionId);
  }, []);

  const holdAndSwitch = useCallback((
    currentSession: CallSession | null,
    currentProfile: CallerProfile | null,
    targetSessionId: string
  ) => {
    const queuedCall = callQueue.find(c => c.session.id === targetSessionId);
    const heldCall = heldCalls.find(c => c.session.id === targetSessionId);
    
    const targetCall = queuedCall || heldCall;
    if (!targetCall) return null;

    if (currentSession && currentProfile) {
      setHeldCalls(prev => [
        ...prev.filter(c => c.session.id !== currentSession.id),
        { session: currentSession, callerProfile: currentProfile, isActive: false }
      ]);
    }

    if (queuedCall) {
      setCallQueue(prev => prev.filter(c => c.session.id !== targetSessionId));
    } else {
      setHeldCalls(prev => prev.filter(c => c.session.id !== targetSessionId));
    }

    return targetCall;
  }, [callQueue, heldCalls]);

  const resumeHeldCall = useCallback((sessionId: string) => {
    const heldCall = heldCalls.find(c => c.session.id === sessionId);
    if (!heldCall) return null;

    setHeldCalls(prev => prev.filter(c => c.session.id !== sessionId));
    return heldCall;
  }, [heldCalls]);

  const endHeldCall = useCallback(async (sessionId: string) => {
    try {
      const now = new Date().toISOString();
      await supabase
        .from('call_sessions')
        .update({
          status: 'ended',
          ended_at: now,
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('[IncomingCalls] Failed to end held call:', error);
    }
    
    setHeldCalls(prev => prev.filter(c => c.session.id !== sessionId));
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
