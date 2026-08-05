import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

interface CallSignalingClient {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{
    error: { message?: string } | null;
  }>;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Something went wrong.';
};

export interface CallSession {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  sdp_offer: string | null;
  sdp_answer: string | null;
  caller_ice_candidates: RTCIceCandidateInit[];
  receiver_ice_candidates: RTCIceCandidateInit[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface CallState {
  session: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  isConnecting: boolean;
  isConnected: boolean;
  isScreenSharing: boolean;
  error: string | null;
  connectionState: RTCPeerConnectionState | null;
  iceState: RTCIceConnectionState | null;
  isFailed: boolean;
}

export interface StartCallResult {
  ok: boolean;
  error?: string;
}

const initialCallState: CallState = {
  session: null,
  localStream: null,
  remoteStream: null,
  screenStream: null,
  isConnecting: false,
  isConnected: false,
  isScreenSharing: false,
  error: null,
  connectionState: null,
  iceState: null,
  isFailed: false,
};

export function useWebRTC(conversationId: string | null, otherUserId: string | null) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>(initialCallState);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const addedIceCandidatesRef = useRef<Set<string>>(new Set());
  const activeSessionRef = useRef<CallSession | null>(null);
  const screenSharingRef = useRef(false);
  const toggleScreenShareRef = useRef<() => Promise<boolean>>(async () => false);
  const isCleaningUpRef = useRef(false);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    try {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      pendingIceCandidatesRef.current = [];
      addedIceCandidatesRef.current = new Set();
      activeSessionRef.current = null;
      screenSharingRef.current = false;

      if (mountedRef.current) {
        setCallState(initialCallState);
      }
    } finally {
      isCleaningUpRef.current = false;
    }
  }, []);

  const getUserMedia = async (type: 'audio' | 'video'): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video' ? {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: 'user',
      } : false,
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      const mediaError = error as { name?: string };
      if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
        throw new Error('Camera/microphone access denied.');
      } else if (mediaError.name === 'NotFoundError') {
        throw new Error('No camera or microphone found.');
      }
      throw new Error('Could not access camera/microphone.');
    }
  };

  const storeIceCandidate = async (sessionId: string, candidate: RTCIceCandidate, isCaller: boolean) => {
    try {
      const { error } = await (supabase as unknown as CallSignalingClient).rpc('append_call_ice_candidate', {
        p_session_id: sessionId,
        p_is_caller: isCaller,
        p_candidate: candidate.toJSON(),
      });

      if (!error) return;

      console.warn('[WebRTC] RPC append unavailable, using fallback:', error?.message);
      const candidateField = isCaller ? 'caller_ice_candidates' : 'receiver_ice_candidates';
      const { data: currentSession } = await supabase
        .from('call_sessions')
        .select(candidateField)
        .eq('id', sessionId)
        .single();

      if (currentSession) {
        const currentCandidates = (currentSession as unknown as Record<string, RTCIceCandidateInit[]>)[candidateField] || [];
        await supabase
          .from('call_sessions')
          .update({ [candidateField]: [...currentCandidates, candidate.toJSON()] })
          .eq('id', sessionId);
      }
    } catch (error) {
      console.error('[WebRTC] Failed to store ICE candidate:', error);
    }
  };

  const createPeerConnection = (sessionId: string, isCaller: boolean): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        storeIceCandidate(sessionId, event.candidate, isCaller);
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0] && mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          remoteStream: event.streams[0],
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (!mountedRef.current) return;
      setCallState(prev => ({
        ...prev,
        connectionState: pc.connectionState,
        isConnecting: pc.connectionState === 'connecting' || pc.connectionState === 'new',
        isConnected: pc.connectionState === 'connected',
        isFailed: pc.connectionState === 'failed' || pc.connectionState === 'disconnected',
        error: pc.connectionState === 'failed' ? 'Connection failed.' :
               pc.connectionState === 'disconnected' ? 'Connection lost.' : prev.error,
      }));
    };

    pc.oniceconnectionstatechange = () => {
      if (!mountedRef.current) return;
      setCallState(prev => ({
        ...prev,
        iceState: pc.iceConnectionState,
        isFailed: prev.isFailed || pc.iceConnectionState === 'failed',
        error: pc.iceConnectionState === 'failed' ? 'Network connection failed.' : prev.error,
      }));
    };

    return pc;
  };

  const addIceCandidates = async (candidates: RTCIceCandidateInit[]) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    for (const candidate of candidates) {
      const key = candidate?.candidate || JSON.stringify(candidate);
      if (addedIceCandidatesRef.current.has(key)) continue;

      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingIceCandidatesRef.current.push(new RTCIceCandidate(candidate));
        }
        addedIceCandidatesRef.current.add(key);
      } catch (error) {
        console.error('[WebRTC] Failed to add ICE candidate:', error);
      }
    }
  };

  const processPendingIceCandidates = async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;

    const pending = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.error('[WebRTC] Failed to add pending ICE candidate:', error);
      }
    }
  };

  const syncRemoteCandidates = async (sessionId: string, isCaller: boolean) => {
    const pc = peerConnectionRef.current;
    if (!pc || !pc.remoteDescription) return;

    const field = isCaller ? 'receiver_ice_candidates' : 'caller_ice_candidates';
    try {
      const { data } = await supabase
        .from('call_sessions')
        .select(field)
        .eq('id', sessionId)
        .single();
      const candidates = (data as unknown as Record<string, RTCIceCandidateInit[]> | null)?.[field] || [];
      if (candidates.length > 0) {
        await addIceCandidates(candidates);
      }
    } catch (error) {
      console.error('[WebRTC] Failed to sync remote ICE candidates:', error);
    }
  };

  const subscribeToSession = (sessionId: string, isCaller: boolean) => {
    const channel = supabase
      .channel(`call-signaling-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `id=eq.${sessionId}`,
        },
        async (payload) => {
          const updated = payload.new as CallSession;

          if (!mountedRef.current) return;
          setCallState(prev => ({ ...prev, session: updated }));

          if (updated.status === 'declined' || updated.status === 'ended') {
            cleanup();
            return;
          }

          const pc = peerConnectionRef.current;
          if (!pc) return;

          if (isCaller && updated.sdp_answer && !pc.remoteDescription) {
            try {
              const answer = JSON.parse(updated.sdp_answer);
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              await processPendingIceCandidates();
              await syncRemoteCandidates(sessionId, true);
            } catch (error) {
              console.error('[WebRTC] Failed to set remote answer:', error);
              if (mountedRef.current) {
                setCallState(prev => ({ ...prev, error: 'Failed to establish connection.' }));
              }
            }
          }

          if (isCaller && !pc.remoteDescription) return;

          const candidatesField = isCaller ? 'receiver_ice_candidates' : 'caller_ice_candidates';
          const candidates = (updated as unknown as Record<string, RTCIceCandidateInit[]>)[candidatesField] || [];
          if (candidates.length > 0 && pc.remoteDescription) {
            await addIceCandidates(candidates);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    syncRemoteCandidates(sessionId, isCaller);
  };

  const startCall = async (type: 'audio' | 'video'): Promise<StartCallResult> => {
    if (!user || !conversationId || !otherUserId) {
      return { ok: false, error: 'Missing conversation data.' };
    }

    if (activeSessionRef.current) {
      return { ok: false, error: 'You are already in a call.' };
    }

    if (callState.isConnecting) {
      return { ok: false, error: 'A call is already connecting...' };
    }

    try {
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, isConnecting: true, error: null, isFailed: false }));
      }

      const localStream = await getUserMedia(type);
      localStreamRef.current = localStream;
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, localStream }));
      }

      const { data: session, error } = await supabase
        .from('call_sessions')
        .insert({
          conversation_id: conversationId,
          caller_id: user.id,
          receiver_id: otherUserId,
          call_type: type,
          status: 'ringing',
          caller_ice_candidates: [],
          receiver_ice_candidates: [],
        })
        .select()
        .single();

      if (error || !session) throw new Error('Failed to create call.');

      const callSession = session as CallSession;
      activeSessionRef.current = callSession;

      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, session: callSession }));
      }

      const pc = createPeerConnection(callSession.id, true);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      await pc.setLocalDescription(offer);

      await supabase
        .from('call_sessions')
        .update({ sdp_offer: JSON.stringify(offer) })
        .eq('id', callSession.id);

      subscribeToSession(callSession.id, true);

      return { ok: true };
    } catch (error) {
      console.error('[WebRTC] Failed to start call:', error);
      if (mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          isConnecting: false,
          error: getErrorMessage(error) || 'Failed to start call.',
        }));
      }
      cleanup();
      return { ok: false, error: getErrorMessage(error) || 'Failed to start call.' };
    }
  };

  const answerCall = async (session: CallSession) => {
    if (!user) return;

    try {
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, isConnecting: true, error: null, isFailed: false, session }));
      }
      activeSessionRef.current = session;

      let latestSession = session;
      let attempts = 0;
      const maxAttempts = 20;

      while (!latestSession.sdp_offer && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 250));
        const { data } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', session.id)
          .single();

        if (data) {
          latestSession = data as CallSession;
          if (latestSession.status !== 'ringing') {
            cleanup();
            return;
          }
        }
        attempts++;
      }

      if (!latestSession.sdp_offer) throw new Error('Call connection timed out.');

      const localStream = await getUserMedia(latestSession.call_type);
      localStreamRef.current = localStream;
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, localStream }));
      }

      const pc = createPeerConnection(session.id, false);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      const offer = JSON.parse(latestSession.sdp_offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      await processPendingIceCandidates();
      await addIceCandidates(latestSession.caller_ice_candidates);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const now = new Date().toISOString();
      await supabase
        .from('call_sessions')
        .update({
          sdp_answer: JSON.stringify(answer),
          status: 'accepted',
          started_at: now,
        })
        .eq('id', session.id);

      if (mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          session: { ...latestSession, status: 'accepted', started_at: now },
        }));
      }

      subscribeToSession(session.id, false);
      await syncRemoteCandidates(session.id, false);
    } catch (error) {
      console.error('[WebRTC] Failed to answer call:', error);
      if (mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          isConnecting: false,
          error: getErrorMessage(error) || 'Failed to answer call.',
        }));
      }
      cleanup();
    }
  };

  const endCall = async () => {
    const session = activeSessionRef.current || callState.session;

    if (session) {
      try {
        await supabase
          .from('call_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', session.id);
      } catch (error) {
        console.error('[WebRTC] Failed to update call status:', error);
      }
    }

    cleanup();
  };

  const declineCall = async (sessionId: string) => {
    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch (error) {
      console.error('[WebRTC] Failed to decline call:', error);
    }
  };

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  };

  const toggleScreenShare = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return false;

    if (screenSharingRef.current) {
      screenSharingRef.current = false;

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
        });
      }

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');

      if (videoSender && cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }

      screenStreamRef.current = null;
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, screenStream: null, isScreenSharing: false }));
      }
      return false;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      screenSharingRef.current = true;
      screenTrack.onended = () => {
        toggleScreenShareRef.current();
      };

      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, screenStream, isScreenSharing: true }));
      }
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to start screen share:', error);
      return false;
    }
  };

  toggleScreenShareRef.current = toggleScreenShare;

  const retryCall = async () => {
    const session = activeSessionRef.current;
    if (!session) return;

    const callType = session.call_type;
    cleanup();
    await new Promise(r => setTimeout(r, 500));
    const result = await startCall(callType);
    if (!result.ok && mountedRef.current) {
      setCallState(prev => ({ ...prev, error: result.error || 'Failed to retry call.' }));
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    callState,
    startCall,
    answerCall,
    endCall,
    declineCall,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    retryCall,
  };
}
