import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCallManager } from '@/hooks/useCallManager';
import { useIncomingCalls } from '@/hooks/useIncomingCalls';
import { PeerProfile } from '@/lib/callTypes';
import { useCallOverlayBlocked } from '@/lib/callOverlayLayers';
import { CallContext, CallContextValue, FloatingReaction } from './callContext';
import { CallScreen } from './CallScreen';
import { CallMiniPlayer } from './CallMiniPlayer';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { CallWaitingCard } from './CallWaitingCard';

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const engine = useCallManager();
  const overlayBlocked = useCallOverlayBlocked();

  const [minimized, setMinimized] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const reactionIdRef = useRef(0);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const resumeRemoteAudio = useCallback(async () => {
    const element = remoteAudioRef.current;
    if (!element) return false;
    try {
      await element.play();
      if (import.meta.env.DEV) console.debug('[TwibsCall]', { event: 'AUDIO_PLAYBACK_STARTED' });
      setAudioPlaybackBlocked(false);
      return true;
    } catch {
      setAudioPlaybackBlocked(true);
      return false;
    }
  }, []);

  // Audio playback belongs to the persistent provider, so minimizing or
  // navigating never unmounts the only remote audio element.
  useEffect(() => {
    const element = remoteAudioRef.current;
    if (!element) return;
    if (!engine.remoteStream) {
      element.pause();
      element.srcObject = null;
      setAudioPlaybackBlocked(false);
      return;
    }
    if (element.srcObject !== engine.remoteStream) {
      element.srcObject = engine.remoteStream;
      if (import.meta.env.DEV) {
        console.debug('[TwibsCall]', {
          event: 'AUDIO_ELEMENT_ATTACHED',
          remoteAudioTracks: engine.remoteStream.getAudioTracks().length,
        });
      }
    }
    if (engine.remoteStream.getAudioTracks().length > 0) {
      void resumeRemoteAudio();
    }
  }, [engine.remoteStream, resumeRemoteAudio]);

  useEffect(() => {
    const element = remoteAudioRef.current;
    if (!element || typeof element.setSinkId !== 'function') return;
    void element.setSinkId(engine.settings.audioOutputDeviceId || '').catch(() => {});
  }, [engine.settings.audioOutputDeviceId]);

  // Who I am currently calling myself (for simultaneous-dial conflict
  // resolution in the incoming-queue logic).
  const outgoingReceiverId = useMemo(() => {
    if (!user || !engine.session) return null;
    const isOutgoing = engine.session.caller_id === user.id;
    const inProgress = engine.phase !== 'idle' && engine.phase !== 'ended';
    return isOutgoing && inProgress ? engine.session.receiver_id : null;
  }, [user, engine.session, engine.phase]);

  const incomingCalls = useIncomingCalls({
    getEngineState: useCallback(
      () => ({ busy: engine.isCallInProgress, outgoingReceiverId }),
      [engine.isCallInProgress, outgoingReceiverId]
    ),
  });
  const setActiveCall = incomingCalls.setActiveCall;
  const onReaction = engine.onReaction;
  const activeSessionId = engine.session?.id;

  // Keep the legacy active-flag in sync with the engine.
  useEffect(() => {
    setActiveCall(engine.isCallInProgress);
  }, [engine.isCallInProgress, setActiveCall]);

  // Force the end screen whenever a call finishes.
  useEffect(() => {
    if (engine.phase === 'ended') {
      setMinimized(false);
    }
  }, [engine.phase]);

  const fireReaction = useCallback((emoji: string, mine: boolean) => {
    const id = ++reactionIdRef.current;
    setReactions((prev) => [...prev.slice(-8), { id, emoji, mine }]);
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2200);
  }, []);

  // Render inbound reactions from the remote peer.
  useEffect(() => {
    if (!activeSessionId) return;
    return onReaction((emoji) => fireReaction(emoji, false));
  }, [activeSessionId, onReaction, fireReaction]);

  const sendLocalReaction = useCallback(
    (emoji: string) => {
      fireReaction(emoji, true);
      engine.sendReaction(emoji);
    },
    [engine, fireReaction]
  );

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);

  const navigateToConversation = useCallback(() => {
    const conversationId = engine.session?.conversation_id;
    if (conversationId) navigate(`/messages?conv=${conversationId}`);
  }, [navigate, engine.session?.conversation_id]);

  const answerIncoming = useCallback(
    (session: Parameters<CallContextValue['answerCall']>[0]) => {
      const profile: PeerProfile = incomingCalls.callerProfile
        ? { ...incomingCalls.callerProfile, user_id: session.caller_id }
        : {
            user_id: session.caller_id,
            display_name: 'Unknown user',
            username: 'unknown',
            avatar_url: null,
          };
      engine.dismissEndScreen();
      void engine.answerCall(session, profile);
      incomingCalls.clearIncomingCall();
    },
    [engine, incomingCalls]
  );

  const handleMissed = useCallback(
    (session: Parameters<CallContextValue['missIncoming']>[0]) => {
      void engine.missIncoming(session);
      incomingCalls.clearIncomingCall();
    },
    [engine, incomingCalls]
  );

  const handleDecline = useCallback(
    (session: Parameters<CallContextValue['declineIncoming']>[0]) => {
      void engine.declineIncoming(session);
      incomingCalls.clearIncomingCall();
    },
    [engine, incomingCalls]
  );

  const value = useMemo<CallContextValue>(
    () => ({
      ...engine,
      reactions,
      sendLocalReaction,
      minimized,
      minimize,
      restore,
      navigateToConversation,
      audioPlaybackBlocked,
      resumeRemoteAudio,
      incomingCall: incomingCalls.incomingCall,
      incomingCaller: incomingCalls.callerProfile,
      callQueue: incomingCalls.callQueue,
      clearIncomingCall: incomingCalls.clearIncomingCall,
      declineQueuedCall: incomingCalls.declineQueuedCall,
    }),
    [
      engine,
      reactions,
      sendLocalReaction,
      minimized,
      minimize,
      restore,
      navigateToConversation,
      audioPlaybackBlocked,
      resumeRemoteAudio,
      incomingCalls,
    ]
  );

  const inProgress = engine.phase !== 'idle' && engine.phase !== 'ended';
  const showFull = engine.phase !== 'idle' && !minimized && !overlayBlocked;
  const showMini = inProgress && minimized && !overlayBlocked;
  const showIncoming = !!incomingCalls.incomingCall;
  const showWaiting = incomingCalls.callQueue.length > 0;

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline onCanPlay={() => void resumeRemoteAudio()} className="hidden" />
      {showMini ? <CallMiniPlayer /> : null}
      {showWaiting ? <CallWaitingCard /> : null}
      {showIncoming ? (
        <IncomingCallOverlay onAnswer={answerIncoming} onDecline={handleDecline} onMiss={handleMissed} />
      ) : null}
      {showFull ? <CallScreen /> : null}
    </CallContext.Provider>
  );
}
