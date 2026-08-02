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

export interface CallSession {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  sdp_offer: string | null;
  sdp_answer: string | null;
  caller_ice_candidates: any[];
  receiver_ice_candidates: any[];
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
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera/microphone access denied.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found.');
      }
      throw new Error('Could not access camera/microphone.');
    }
  };

  const storeIceCandidate = async (sessionId: string, candidate: RTCIceCandidate, isCaller: boolean) => {
    const candidateField = isCaller ? 'caller_ice_candidates' : 'receiver_ice_candidates';

    try {
      const { data: currentSession } = await supabase
        .from('call_sessions')
        .select(candidateField)
        .eq('id', sessionId)
        .single();

      if (currentSession) {
        const currentCandidates = (currentSession as any)[candidateField] || [];
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

  const addIceCandidates = async (candidates: any[]) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    for (const candidate of candidates) {
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingIceCandidatesRef.current.push(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('[WebRTC] Failed to add ICE candidate:', error);
      }
    }
  };

  const processPendingIceCandidates = async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;

    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.error('[WebRTC] Failed to add pending ICE candidate:', error);
      }
    }
    pendingIceCandidatesRef.current = [];
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

              if (updated.receiver_ice_candidates?.length) {
                await addIceCandidates(updated.receiver_ice_candidates);
              }
            } catch (error) {
              console.error('[WebRTC] Failed to set remote answer:', error);
              if (mountedRef.current) {
                setCallState(prev => ({ ...prev, error: 'Failed to establish connection.' }));
              }
            }
          }

          const candidatesField = isCaller ? 'receiver_ice_candidates' : 'caller_ice_candidates';
          const candidates = (updated as any)[candidatesField] || [];
          if (candidates.length > 0 && pc.remoteDescription) {
            await addIceCandidates(candidates);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!user || !conversationId || !otherUserId) {
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, error: 'Missing conversation data.' }));
      }
      return null;
    }

    if (callState.session) return null;

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

      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, session: session as CallSession }));
      }

      const pc = createPeerConnection(session.id, true);
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
        .eq('id', session.id);

      subscribeToSession(session.id, true);

      return session.id;
    } catch (error: any) {
      console.error('[WebRTC] Failed to start call:', error);
      if (mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          isConnecting: false,
          error: error.message || 'Failed to start call.',
        }));
      }
      cleanup();
      return null;
    }
  };

  const answerCall = async (session: CallSession) => {
    if (!user) return;

    try {
      if (mountedRef.current) {
        setCallState(prev => ({ ...prev, isConnecting: true, error: null, isFailed: false, session }));
      }

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
      if (latestSession.caller_ice_candidates?.length) {
        await addIceCandidates(latestSession.caller_ice_candidates);
      }

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
    } catch (error: any) {
      console.error('[WebRTC] Failed to answer call:', error);
      if (mountedRef.current) {
        setCallState(prev => ({
          ...prev,
          isConnecting: false,
          error: error.message || 'Failed to answer call.',
        }));
      }
      cleanup();
    }
  };

  const endCall = async () => {
    const session = callState.session;

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

    if (callState.isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
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
    } else {
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

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        if (mountedRef.current) {
          setCallState(prev => ({ ...prev, screenStream, isScreenSharing: true }));
        }
        return true;
      } catch (error) {
        console.error('[WebRTC] Failed to start screen share:', error);
        return false;
      }
    }
  };

  const retryCall = async () => {
    const session = callState.session;
    if (!session) return;

    const callType = session.call_type;
    cleanup();
    await new Promise(r => setTimeout(r, 500));
    await startCall(callType);
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
