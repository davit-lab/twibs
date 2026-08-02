import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIncomingCalls } from '@/hooks/useIncomingCalls';
import { supabase } from '@/integrations/supabase/client';
import IncomingCallModal from '@/components/messaging/IncomingCallModal';
import CallWaitingIndicator from '@/components/calling/CallWaitingIndicator';
import HeldCallsIndicator from '@/components/calling/HeldCallsIndicator';

export default function GlobalCallProvider() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    incomingCall, 
    callerProfile, 
    callQueue,
    heldCalls,
    clearIncomingCall,
    declineQueuedCall,
    endHeldCall,
  } = useIncomingCalls();

  // Check if we're already on the messages page with this conversation
  const isOnMessagesPage = location.pathname === '/messages';
  const currentConvId = new URLSearchParams(location.search).get('conv');
  const isAlreadyInConversation = isOnMessagesPage && currentConvId === incomingCall?.conversation_id;

  const handleAnswerCall = useCallback(async () => {
    if (!incomingCall) return;
    
    console.log('[GlobalCall] Answering call:', incomingCall.id);
    
    // Navigate to messages with the conversation and answer flag
    navigate(`/messages?conv=${incomingCall.conversation_id}&answer=${incomingCall.id}`);
    clearIncomingCall();
  }, [incomingCall, navigate, clearIncomingCall]);

  const handleDeclineCall = useCallback(async () => {
    if (!incomingCall) return;
    
    console.log('[GlobalCall] Declining call:', incomingCall.id);
    
    try {
      const now = new Date().toISOString();
      await supabase
        .from('call_sessions')
        .update({
          status: 'declined',
          ended_at: now,
        })
        .eq('id', incomingCall.id);
    } catch (error) {
      console.error('[GlobalCall] Failed to decline call:', error);
    }
    
    clearIncomingCall();
  }, [incomingCall, clearIncomingCall]);

  const handleAnswerQueuedCall = useCallback(async (sessionId: string) => {
    const queuedCall = callQueue.find(c => c.session.id === sessionId);
    if (!queuedCall) return;

    console.log('[GlobalCall] Answering queued call:', sessionId);
    navigate(`/messages?conv=${queuedCall.session.conversation_id}&answer=${sessionId}`);
  }, [callQueue, navigate]);

  const handleDeclineQueuedCall = useCallback(async (sessionId: string) => {
    console.log('[GlobalCall] Declining queued call:', sessionId);
    await declineQueuedCall(sessionId);
  }, [declineQueuedCall]);

  const handleResumeHeldCall = useCallback((sessionId: string) => {
    const heldCall = heldCalls.find(c => c.session.id === sessionId);
    if (!heldCall) return;

    console.log('[GlobalCall] Resuming held call:', sessionId);
    navigate(`/messages?conv=${heldCall.session.conversation_id}&resume=${sessionId}`);
  }, [heldCalls, navigate]);

  const handleEndHeldCall = useCallback(async (sessionId: string) => {
    console.log('[GlobalCall] Ending held call:', sessionId);
    await endHeldCall(sessionId);
  }, [endHeldCall]);

  return (
    <>
      {/* Call waiting indicator for queued calls */}
      <CallWaitingIndicator
        queuedCalls={callQueue}
        onAnswer={handleAnswerQueuedCall}
        onDecline={handleDeclineQueuedCall}
      />

      {/* Held calls indicator */}
      <HeldCallsIndicator
        heldCalls={heldCalls}
        onResume={handleResumeHeldCall}
        onEnd={handleEndHeldCall}
      />

      {/* Main incoming call modal */}
      {incomingCall && !isAlreadyInConversation && (
        <IncomingCallModal
          session={incomingCall}
          callerProfile={callerProfile}
          onAnswer={handleAnswerCall}
          onDecline={handleDeclineCall}
        />
      )}
    </>
  );
}