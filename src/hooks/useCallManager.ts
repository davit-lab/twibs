import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { callAudio } from '@/lib/callAudio';
import {
  RING_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  QUALITY_SAMPLE_MS,
  QUALITY_EXCELLENT_RTT,
  QUALITY_GOOD_RTT,
  END_SCREEN_AUTO_CLOSE_MS,
  START_CALL_RETRY_DELAY_MS,
  RECONNECT_RETRY_MS,
} from '@/lib/callConstants';
import {
  CallPhase,
  CallEndReason,
  CallSession,
  CallType,
  CallQuality,
  CallMediaError,
  PeerProfile,
  MediaDeviceInfoBasic,
  CallSettings,
  CALL_DEFAULTS,
} from '@/lib/callTypes';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Something went wrong.';
};

const mapMediaError = (error: unknown, audio: boolean, video: boolean): CallMediaError => {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { code: 'permission-denied', audio, video, message: 'Camera / microphone access is not allowed.' };
  }
  if (name === 'NotFoundError') {
    return {
      code: 'not-found',
      audio,
      video,
      message: video && !audio ? 'No camera was found.' : audio && !video ? 'No microphone was found.' : 'No camera or microphone was found.',
    };
  }
  if (name === 'NotReadableError') {
    return { code: 'unavailable', audio, video, message: 'The camera or microphone is in use by another app.' };
  }
  return { code: 'unknown', audio, video, message: getErrorMessage(error) || 'Could not access camera or microphone.' };
};

const statusToEndReason = (status: string): CallEndReason => {
  switch (status) {
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'busy':
      return 'busy';
    case 'missed':
      return 'missed';
    default:
      return 'ended';
  }
};

const statusForReason = (reason: CallEndReason): CallSession['status'] => {
  switch (reason) {
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'busy':
      return 'busy';
    case 'missed':
      return 'missed';
    default:
      return 'ended';
  }
};

interface Devices {
  audioInputs: MediaDeviceInfoBasic[];
  videoInputs: MediaDeviceInfoBasic[];
  audioOutputs: MediaDeviceInfoBasic[];
}

export type { Devices as CallDevices };

export interface CallManager {
  phase: CallPhase;
  endReason: CallEndReason | null;
  session: CallSession | null;
  peerProfile: PeerProfile | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | null;
  iceState: RTCIceConnectionState | null;
  quality: CallQuality;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  mediaError: CallMediaError | null;
  error: string | null;
  devices: Devices;
  settings: CallSettings;
  isCallInProgress: boolean;
  isOutgoingRinging: boolean;
  startCall: (conversationId: string, otherUserId: string, type: CallType, peer: PeerProfile) => Promise<{ ok: boolean; error?: string }>;
  answerCall: (session: CallSession, peer: PeerProfile) => Promise<void>;
  declineIncoming: (session: CallSession) => Promise<void>;
  missIncoming: (session: CallSession) => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: () => Promise<void>;
  endOrCancel: () => void;
  retryLastCall: () => void;
  dismissEndScreen: () => void;
  clearMediaError: () => void;
  toggleMute: () => boolean;
  toggleVideo: () => Promise<boolean>;
  toggleScreenShare: () => Promise<boolean>;
  stopScreenShare: () => Promise<boolean>;
  switchCamera: () => Promise<boolean>;
  setAudioInput: (deviceId: string | null) => Promise<boolean>;
  setVideoInput: (deviceId: string | null) => Promise<boolean>;
  setAudioOutput: (deviceId: string | null) => void;
  updateSettings: (patch: Partial<CallSettings>) => void;
  sendReaction: (emoji: string) => void;
  onReaction: (cb: (emoji: string) => void) => () => void;
}

const initialQuality: CallQuality = { level: 'good', rttMs: null };

export function useCallManager(): CallManager {
  const { user } = useAuth();

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [endReason, setEndReason] = useState<CallEndReason | null>(null);
  const [session, setSession] = useState<CallSession | null>(null);
  const [peerProfile, setPeerProfile] = useState<PeerProfile | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
  const [iceState, setIceState] = useState<RTCIceConnectionState | null>(null);
  const [quality, setQuality] = useState<CallQuality>(initialQuality);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState<CallMediaError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Devices>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [settings, setSettings] = useState<CallSettings>(CALL_DEFAULTS);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reactChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const addedIceCandidatesRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<CallSession | null>(null);
  const peerProfileRef = useRef<PeerProfile | null>(null);
  const myRoleRef = useRef<'caller' | 'receiver'>('caller');
  const appliedAnswerRef = useRef<string | null>(null);
  const screenSharingRef = useRef(false);
  const isScreenSharingPendingRef = useRef(false);
  const isCleaningUpRef = useRef(false);
  const mountedRef = useRef(true);
  const ringTimeoutRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const qualityTimerRef = useRef<number | null>(null);
  const endScreenCleanupRef = useRef<number | null>(null);
  const phaseRef = useRef<CallPhase>('idle');
  const endReasonRef = useRef<CallEndReason | null>(null);
  const connectionStateRef = useRef<RTCPeerConnectionState | null>(null);
  const settingsRef = useRef<CallSettings>(CALL_DEFAULTS);
  const sessionIdForAudioRef = useRef<string | null>(null);
  /**
   * Last SDP offer the receiver has applied. When a *new* offer arrives over
   * signaling (voice→video upgrade or screen share on a voice call) the
   * receiver must answer it — this triggers the renegotiation answer.
   */
  const lastRemoteOfferRef = useRef<string | null>(null);
  /** Guards against concurrent renegotiations (createOffer races). */
  const renegotiatingRef = useRef(false);
  /**
   * Set when screen share had to ADD a video sender on a voice-only call.
   * On stop the sender must be removed (and the m-line dropped) rather than
   * replaced back with a camera track.
   */
  const screenShareAddedSenderRef = useRef<RTCRtpSender | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    endReasonRef.current = endReason;
  }, [endReason]);

  const phaseRefUpdate = (p: CallPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const stopTimers = () => {
    if (ringTimeoutRef.current !== null) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    clearConnectTimeout();
    if (qualityTimerRef.current !== null) {
      window.clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
    if (endScreenCleanupRef.current !== null) {
      window.clearTimeout(endScreenCleanupRef.current);
      endScreenCleanupRef.current = null;
    }
  };

  const teardownConnection = useCallback((stopMedia: boolean) => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    try {
      const pc = peerConnectionRef.current;
      if (pc) {
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
        peerConnectionRef.current = null;
      }
      if (stopMedia && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (stopMedia && screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reactChannelRef.current) {
        supabase.removeChannel(reactChannelRef.current);
        reactChannelRef.current = null;
      }
      pendingIceCandidatesRef.current = [];
      addedIceCandidatesRef.current = new Set();
      appliedAnswerRef.current = null;
      screenSharingRef.current = false;
      isScreenSharingPendingRef.current = false;
      screenShareAddedSenderRef.current = null;
      lastRemoteOfferRef.current = null;
      stopTimers();
      callAudio.stopAll();
      sessionIdForAudioRef.current = null;
    } finally {
      isCleaningUpRef.current = false;
    }
  }, []);

  /**
   * Schedule a delayed teardown that is only applied if the *same* session is
   * still current when it fires. This prevents a lingering end-screen cleanup
   * from killing a call that the user started/answered immediately afterwards
   * (e.g. end-current-then-accept from the call-waiting card).
   */
  const scheduleConnectionTeardown = useCallback(
    (stopMedia: boolean, delayMs: number) => {
      if (endScreenCleanupRef.current !== null) {
        window.clearTimeout(endScreenCleanupRef.current);
        endScreenCleanupRef.current = null;
      }
      const sessionIdAtSchedule = sessionRef.current?.id ?? null;
      endScreenCleanupRef.current = window.setTimeout(() => {
        endScreenCleanupRef.current = null;
        if (sessionRef.current?.id === sessionIdAtSchedule) {
          teardownConnection(stopMedia);
        }
      }, delayMs);
    },
    [teardownConnection]
  );

  /**
   * Best-effort, fire-and-forget persistence of the call row's terminal
   * status. Never rejects/throws into the caller so hangup is unconditional.
   */
  const persistCallStatus = useCallback(
    (sessionId: string, status: CallSession['status'], reason: CallEndReason) => {
      void (async () => {
        try {
          const { error } = await supabase
            .from('call_sessions')
            .update({ status, ended_at: new Date().toISOString(), ended_reason: reason })
            .eq('id', sessionId);
          if (error) {
            console.warn('[CallManager] Failed to persist call status:', error.message);
          }
        } catch (err) {
          console.warn('[CallManager] Failed to persist call status:', getErrorMessage(err));
        }
      })();
    },
    []
  );

  /** Set a terminal phase locally, stop audio, persist DB status. */
  const finishCall = useCallback(
    async (reason: CallEndReason, opts?: { dbStatus?: CallSession['status']; skipDb?: boolean }) => {
      const s = sessionRef.current;
      if (phaseRef.current === 'ended') return;

      callAudio.stopAll();
      if (ringTimeoutRef.current !== null) {
        window.clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      clearConnectTimeout();
      if (qualityTimerRef.current !== null) {
        window.clearInterval(qualityTimerRef.current);
        qualityTimerRef.current = null;
      }

      // Transition local state immediately — a terminal call must never stay
      // stuck waiting on the database or signaling before the UI leaves the
      // active state. DB persistence is best-effort and happens separately.
      if (mountedRef.current) {
        setEndReason(reason);
        setSession(s);
        if (reason === 'failed') {
          setError(connectionStateRef.current === 'connected' ? 'Connection lost.' : 'Connection failed.');
        }
        phaseRefUpdate('ended');
      }
      // Best-effort server-side status persistence; failure must not affect the
      // local terminal state already committed above. Done separately from the
      // local teardown so a slow/dead database can never block hangup.
      if (!opts?.skipDb && s) {
        const status = opts?.dbStatus ?? statusForReason(reason);
        persistCallStatus(s.id, status, reason);
      }

      // Keep streams briefly mounted so the end screen can keep a final frame.
      scheduleConnectionTeardown(false, END_SCREEN_AUTO_CLOSE_MS);
    },
    [scheduleConnectionTeardown, clearConnectTimeout, persistCallStatus]
  );

  /**
   * Guarantees a call never sits on "Connecting…" forever. Fires once the
   * connecting phase outlives CONNECT_TIMEOUT_MS and tears the call down.
   */
  const startConnectTimeout = useCallback(() => {
    clearConnectTimeout();
    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;
      if (phaseRef.current === 'connecting' && sessionRef.current && !isCleaningUpRef.current) {
        console.warn('[CallManager] Call did not establish a peer connection in time.');
        finishCall('failed', { dbStatus: 'ended' });
      }
    }, CONNECT_TIMEOUT_MS);
  }, [finishCall, clearConnectTimeout]);

  // ----------------------------------------------------------------- media --

  const buildConstraints = useCallback((type: CallType, st: CallSettings): MediaStreamConstraints => {
    const audio: MediaTrackConstraints = {
      echoCancellation: st.echoCancellation,
      noiseSuppression: st.noiseSuppression,
      autoGainControl: st.autoGainControl,
    };
    if (st.audioInputDeviceId) audio.deviceId = { exact: st.audioInputDeviceId };

    const video: MediaTrackConstraints | boolean =
      type === 'video'
        ? {
            width: { ideal: st.hdVideo ? 1920 : 1280 },
            height: { ideal: st.hdVideo ? 1080 : 720 },
            ...(st.videoInputDeviceId ? { deviceId: { exact: st.videoInputDeviceId } } : { facingMode: 'user' }),
          }
        : false;

    return { audio, video };
  }, []);

  const acquireMedia = useCallback(
    async (type: CallType, st: CallSettings): Promise<MediaStream> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const err = new Error('This browser does not support calling.');
        throw mapMediaError(err, true, type === 'video');
      }
      try {
        return await navigator.mediaDevices.getUserMedia(buildConstraints(type, st));
      } catch (error) {
        throw mapMediaError(error, true, type === 'video');
      }
    },
    [buildConstraints]
  );

  const integrateStream = useCallback((stream: MediaStream) => {
    let existing = localStreamRef.current;
    if (!existing) {
      existing = new MediaStream();
      localStreamRef.current = existing;
      if (mountedRef.current) setLocalStream(existing);
    }
    for (const track of stream.getTracks()) {
      const match = existing.getTracks().find((t) => t.kind === track.kind);
      if (match) existing.removeTrack(match);
      existing.addTrack(track);
    }
  }, []);

  const replaceSenderTrack = useCallback(async (
    pc: RTCPeerConnection,
    kind: 'audio' | 'video',
    track: MediaStreamTrack
  ) => {
    const sender = pc.getSenders().find((s) => s.track?.kind === kind);
    if (!sender) {
      pc.addTrack(track, localStreamRef.current ?? new MediaStream());
      return;
    }
    await sender.replaceTrack(track);
  }, []);

  // -------------------------------------------------------------- signaling --

  const storeIceCandidate = useCallback(
    async (sessionId: string, candidate: RTCIceCandidate, isCaller: boolean) => {
      const payload: Json = candidate.toJSON() as Json;
      const candidateField = isCaller ? 'caller_ice_candidates' : 'receiver_ice_candidates';

      // Preferred path: the atomic server-side RPC `append_call_ice_candidate`.
      // NOTE: `supabase.rpc(...)` MUST be invoked as a method on `supabase` so
      // that `this` is bound internally (it accesses `this.rest`). Detaching
      // the method (e.g. `const rpc = supabase.rpc`) makes `this` undefined
      // and throws `Cannot read properties of undefined (reading 'rest')`.
      try {
        const { error } = await supabase.rpc('append_call_ice_candidate', {
          p_session_id: sessionId,
          p_is_caller: isCaller,
          p_candidate: payload,
        });
        if (!error) return;
      } catch {
        // RPC unavailable or threw (network/parse). Fall through to RMW.
      }

      // Fallback: read-modify-write via the standard supabase.from() pattern
      // used elsewhere in Twibs. A failed candidate persist must never tear
      // down the call, so errors here are logged once and swallowed.
      try {
        const { data, error: fetchError } = await supabase
          .from('call_sessions')
          .select(candidateField)
          .eq('id', sessionId)
          .single();
        if (fetchError || !data) return;
        const current = (data as unknown as Record<string, unknown>)[candidateField];
        const currentCandidates: RTCIceCandidateInit[] = Array.isArray(current)
          ? (current as RTCIceCandidateInit[])
          : [];
        const { error: updateError } = await supabase
          .from('call_sessions')
          .update({ [candidateField]: [...currentCandidates, payload] })
          .eq('id', sessionId);
        if (updateError) {
          console.warn('[CallManager] Failed to persist ICE candidate (fallback):', updateError.message);
        }
      } catch (err) {
        console.warn('[CallManager] Failed to store ICE candidate:', getErrorMessage(err));
      }
    },
    []
  );

  const addIceCandidates = useCallback(async (candidates: RTCIceCandidateInit[]) => {
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
      } catch (err) {
        console.error('[CallManager] Failed to add ICE candidate:', err);
      }
    }
  }, []);

  const processPendingIceCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const pending = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error('[CallManager] Failed to add pending ICE candidate:', err);
      }
    }
  }, []);

  const syncRemoteCandidates = useCallback(async (sessionId: string, isCaller: boolean) => {
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
      if (candidates.length > 0) await addIceCandidates(candidates);
    } catch (err) {
      console.error('[CallManager] Failed to sync remote ICE candidates:', err);
    }
  }, [addIceCandidates]);

  /**
   * Push a fresh local offer so the remote peer can renegotiate (adding a VIDEO
   * m-line that was not present in the original offer). Used for voice→video
   * upgrades and for screen share started during a voice-only call.
   */
  const renegotiate = useCallback(async (): Promise<boolean> => {
    const pc = peerConnectionRef.current;
    const s = sessionRef.current;
    if (!pc || !s) return false;
    if (renegotiatingRef.current) return false;
    if (pc.signalingState !== 'stable') return false;
    renegotiatingRef.current = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await supabase
        .from('call_sessions')
        .update({ sdp_offer: JSON.stringify(offer) })
        .eq('id', s.id);
      return true;
    } catch (err) {
      console.error('[CallManager] Failed to renegotiate call:', err);
      return false;
    } finally {
      renegotiatingRef.current = false;
    }
  }, []);

  // ---------------------------------------------------------------- quality --

  const sampleQuality = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let bestRtt: number | null = null;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report as RTCIceCandidatePairStats).nominated) {
          const rtt = (report as RTCIceCandidatePairStats).currentRoundTripTime;
          if (typeof rtt === 'number' && (bestRtt === null || rtt < bestRtt)) bestRtt = rtt;
        }
      });
      if (mountedRef.current && phaseRef.current === 'connected') {
        if (bestRtt === null) setQuality({ level: 'good', rttMs: null });
        else if (bestRtt <= QUALITY_EXCELLENT_RTT) setQuality({ level: 'excellent', rttMs: bestRtt });
        else if (bestRtt <= QUALITY_GOOD_RTT) setQuality({ level: 'good', rttMs: bestRtt });
        else setQuality({ level: 'weak', rttMs: bestRtt });
      }
    } catch {
      // getStats can fail transiently; ignore.
    }
  }, []);

  const startQualitySampler = useCallback(() => {
    if (qualityTimerRef.current !== null) return;
    qualityTimerRef.current = window.setInterval(sampleQuality, QUALITY_SAMPLE_MS);
  }, [sampleQuality]);

  const stopQualitySampler = useCallback(() => {
    if (qualityTimerRef.current !== null) {
      window.clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
  }, []);

  // ------------------------------------------------------------------ react --

  const reactionListenersRef = useRef<Set<(emoji: string) => void>>(new Set());

  const subscribeReactions = useCallback((sessionId: string, onReactionCb: (emoji: string) => void) => {
    const channel = supabase
      .channel(`call-rt-${sessionId}`)
      .on('broadcast', { event: 'reaction' }, (payload) => {
        const emoji = (payload as { payload?: { emoji?: string } })?.payload?.emoji;
        if (!emoji) return;
        onReactionCb(emoji);
        reactionListenersRef.current.forEach((cb) => cb(emoji));
      })
      .subscribe();
    reactChannelRef.current = channel;
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const s = sessionRef.current;
    if (!s || phaseRef.current !== 'connected') return;
    reactChannelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } }).catch(() => {});
  }, []);

  /**
   * Register a listener for reactions received from the remote peer.
   * Returns an unsubscribe function.
   */
  const onReaction = useCallback((cb: (emoji: string) => void) => {
    reactionListenersRef.current.add(cb);
    return () => {
      reactionListenersRef.current.delete(cb);
    };
  }, []);

  // --------------------------------------------------------- peer connection --

  const createPeerConnection = useCallback(
    (sessionId: string, isCaller: boolean): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) storeIceCandidate(sessionId, event.candidate, isCaller);
      };

      pc.ontrack = (event) => {
        if (event.streams[0] && mountedRef.current) {
          setRemoteStream(event.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        connectionStateRef.current = pc.connectionState;
        setConnectionState(pc.connectionState);

        if (pc.connectionState === 'connected') {
          clearConnectTimeout();
          if (phaseRef.current === 'connecting' || phaseRef.current === 'reconnecting') {
            phaseRefUpdate('connected');
          }
          setError(null);
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          startQualitySampler();
          return;
        }
        if (pc.connectionState === 'disconnected') {
          stopQualitySampler();
          if (mountedRef.current) setQuality({ level: 'reconnecting', rttMs: null });
          if (phaseRef.current === 'connected' && !isCleaningUpRef.current) {
            phaseRefUpdate('reconnecting');
            if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
            const retryRestartIce = () => {
              reconnectTimerRef.current = null;
              try {
                const p = peerConnectionRef.current;
                if (p && p.connectionState !== 'connected' && p.signalingState !== 'closed') {
                  p.restartIce();
                }
              } catch {
                // ignore
              }
              if (peerConnectionRef.current?.connectionState === 'disconnected' && mountedRef.current) {
                reconnectTimerRef.current = window.setTimeout(retryRestartIce, RECONNECT_RETRY_MS);
              }
            };
            reconnectTimerRef.current = window.setTimeout(retryRestartIce, RECONNECT_RETRY_MS);
          }
          return;
        }
        if (pc.connectionState === 'failed') {
          stopQualitySampler();
          if (phaseRef.current !== 'ended') {
            finishCall('failed', { dbStatus: 'ended' });
          }
          return;
        }
        if (pc.connectionState === 'closed') {
          clearConnectTimeout();
          stopQualitySampler();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!mountedRef.current) return;
        setIceState(pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' && phaseRef.current !== 'ended') {
          stopQualitySampler();
          finishCall('failed', { dbStatus: 'ended' });
        }
      };

      return pc;
    },
    [finishCall, startQualitySampler, stopQualitySampler, storeIceCandidate, clearConnectTimeout]
  );

  const subscribeToSession = useCallback(
    (sessionId: string, isCaller: boolean) => {
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
            if (!mountedRef.current || !peerConnectionRef.current) return;
            if (phaseRef.current === 'ended') return;

            // Remote terminal transitions always win.
            const terminal = updated.status !== 'ringing' && updated.status !== 'accepted';
            if (terminal) {
              finishCall(statusToEndReason(updated.status), { skipDb: true });
              return;
            }

            if (isCaller && updated.status === 'accepted') {
              callAudio.stopOutgoingRingback(sessionId);
            }

            const pc = peerConnectionRef.current;
            if (isCaller && updated.sdp_answer && updated.sdp_answer !== appliedAnswerRef.current && !renegotiatingRef.current) {
              if (pc.signalingState === 'have-local-offer') {
                callAudio.stopOutgoingRingback(sessionId);
                appliedAnswerRef.current = updated.sdp_answer;
                phaseRefUpdate('connecting');
                startConnectTimeout();
                try {
                  const answer = JSON.parse(updated.sdp_answer);
                  await pc.setRemoteDescription(new RTCSessionDescription(answer));
                  await processPendingIceCandidates();
                  await syncRemoteCandidates(sessionId, true);
                } catch (err) {
                  if (mountedRef.current) {
                    finishCall('failed', { dbStatus: 'ended' });
                  }
                }
              }
              return;
            }

            // Receiver renegotiation: a NEW offer (voice→video upgrade or screen
            // share on a voice call) arrived mid-call. Answer it; ICE candidates
            // for the new m-line may be bundled with the same update.
            if (!isCaller && updated.sdp_offer && updated.sdp_offer !== lastRemoteOfferRef.current) {
              try {
                lastRemoteOfferRef.current = updated.sdp_offer;
                await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(updated.sdp_offer)));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await supabase
                  .from('call_sessions')
                  .update({ sdp_answer: JSON.stringify(answer) })
                  .eq('id', sessionId);
              } catch (err) {
                console.error('[CallManager] Failed to negotiate media upgrade:', err);
                if (mountedRef.current) {
                  finishCall('failed', { dbStatus: 'ended' });
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
    },
    [finishCall, addIceCandidates, processPendingIceCandidates, syncRemoteCandidates, startConnectTimeout]
  );

  // ----------------------------------------------------------------- outgoing --

  const startCall = useCallback(
    async (conversationId: string, otherUserId: string, type: CallType, peer: PeerProfile) => {
      if (!user) return { ok: false, error: 'You must be signed in.' };
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'ended') {
        return { ok: false, error: 'You are already in a call.' };
      }
      if (phaseRef.current === 'ended') {
        teardownConnection(true);
      }

      try {
        phaseRefUpdate('dialing');
        if (mountedRef.current) {
          setEndReason(null);
          setError(null);
          setMediaError(null);
        }
        callAudio.ensureUnlocked();

        const st = settingsRef.current;
        const stream = await acquireMedia(type, st);
        integrateStream(stream);

        const { data, error: insertError } = await supabase
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

        if (insertError || !data) throw new Error('Failed to create call.');

        const callSession = data as unknown as CallSession;
        sessionRef.current = callSession;
        peerProfileRef.current = peer;
        myRoleRef.current = 'caller';
        sessionIdForAudioRef.current = callSession.id;

        if (mountedRef.current) {
          setSession(callSession);
          setPeerProfile(peer);
        }

        const pc = createPeerConnection(callSession.id, true);
        peerConnectionRef.current = pc;
        const ls = localStreamRef.current;
        if (ls) ls.getTracks().forEach((track) => pc.addTrack(track, ls));

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
        subscribeReactions(callSession.id, () => {});

        callAudio.startOutgoingRingback(callSession.id);
        callAudio.ensureUnlocked();

        phaseRefUpdate('ringing');

        if (ringTimeoutRef.current !== null) window.clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = window.setTimeout(() => {
          if (phaseRef.current === 'ringing' && sessionRef.current) {
            finishCall('missed');
          }
          ringTimeoutRef.current = null;
        }, RING_TIMEOUT_MS);

        return { ok: true };
      } catch (err) {
        console.error('[CallManager] Failed to start call:', err);
        const mediaErr = (err as CallMediaError)?.code ? (err as CallMediaError) : mapMediaError(err, true, false);
        if (mountedRef.current) {
          setMediaError(mediaErr);
          setSession(null);
          setPeerProfile(null);
          setEndReason('failed');
          setError(mediaErr.message);
          phaseRefUpdate('ended');
        }
        teardownConnection(true);
        return { ok: false, error: mediaErr.message };
      }
    },
    [user, acquireMedia, integrateStream, createPeerConnection, subscribeToSession, subscribeReactions, finishCall, teardownConnection]
  );

  // ----------------------------------------------------------------- incoming --

  const prepareToAnswer = useCallback(
    async (s: CallSession, peer: PeerProfile) => {
      callAudio.stopAll();
      callAudio.ensureUnlocked();

      if (mountedRef.current) {
        setEndReason(null);
        setError(null);
        setMediaError(null);
        setSession(s);
        setPeerProfile(peer);
        phaseRefUpdate('dialing');
      }
      sessionRef.current = s;
      peerProfileRef.current = peer;
      myRoleRef.current = 'receiver';
      sessionIdForAudioRef.current = s.id;

      try {
        let latestSession = s;
        let attempts = 0;
        const maxAttempts = 40;
        while (!latestSession.sdp_offer && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 250));
          const { data } = await supabase
            .from('call_sessions')
            .select('*')
            .eq('id', s.id)
            .single();
          if (data) {
            latestSession = data as unknown as CallSession;
            if (latestSession.status !== 'ringing' && latestSession.status !== 'accepted') {
              finishCall(statusToEndReason(latestSession.status), { skipDb: true });
              return;
            }
          }
          attempts++;
        }
        if (!latestSession.sdp_offer) {
          throw new Error('Call connection timed out.');
        }

        const st = settingsRef.current;
        const stream = await acquireMedia(latestSession.call_type as CallType, st);
        integrateStream(stream);

        const pc = createPeerConnection(s.id, false);
        peerConnectionRef.current = pc;

        const ls = localStreamRef.current;
        if (ls) ls.getTracks().forEach((track) => pc.addTrack(track, ls));

        lastRemoteOfferRef.current = latestSession.sdp_offer;
        const offer = JSON.parse(latestSession.sdp_offer);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        await processPendingIceCandidates();
        await addIceCandidates(latestSession.caller_ice_candidates);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // SDP exchange complete: move to 'connecting' (and arm the connect
        // timeout) BEFORE the awaited DB write below, so an ICE 'connected'
        // event that fires during the write still promotes us correctly.
        phaseRefUpdate('connecting');
        startConnectTimeout();

        const now = new Date().toISOString();
        await supabase
          .from('call_sessions')
          .update({
            sdp_answer: JSON.stringify(answer),
            status: 'accepted',
            started_at: now,
          })
          .eq('id', s.id);

        if (mountedRef.current) {
          setSession({ ...latestSession, status: 'accepted', started_at: now });
        }

        subscribeToSession(s.id, false);
        subscribeReactions(s.id, () => {});
        await syncRemoteCandidates(s.id, false);
      } catch (err) {
        console.error('[CallManager] Failed to answer call:', err);
        const mediaErr = (err as CallMediaError)?.code ? (err as CallMediaError) : mapMediaError(err, true, false);
        if (mountedRef.current) {
          setMediaError(mediaErr);
          setEndReason('failed');
          setError(mediaErr.message);
          phaseRefUpdate('ended');
        }
        teardownConnection(true);
      }
    },
    [acquireMedia, integrateStream, createPeerConnection, subscribeToSession, subscribeReactions, syncRemoteCandidates, processPendingIceCandidates, addIceCandidates, finishCall, teardownConnection, startConnectTimeout]
  );

  const answerCall = useCallback(
    async (s: CallSession, peer: PeerProfile) => {
      await prepareToAnswer(s, peer);
    },
    [prepareToAnswer]
  );

  const declineIncoming = useCallback(async (s: CallSession) => {
    callAudio.stopIncomingRingtone(s.id);
    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString(), ended_reason: 'declined' })
        .eq('id', s.id);
    } catch (err) {
      console.error('[CallManager] Failed to decline call:', err);
    }
  }, []);

  const missIncoming = useCallback(async (s: CallSession) => {
    callAudio.stopIncomingRingtone(s.id);
    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'missed', ended_at: new Date().toISOString(), ended_reason: 'missed' })
        .eq('id', s.id);
    } catch (err) {
      console.error('[CallManager] Failed to mark call missed:', err);
    }
  }, []);

  // ----------------------------------------------------------------- controls --

  const cancelCall = useCallback(async () => {
    const s = sessionRef.current;
    if (phaseRef.current !== 'ringing' && phaseRef.current !== 'dialing') return;
    if (s) callAudio.stopOutgoingRingback(s.id);
    clearConnectTimeout();
    // Local teardown happens first and must not depend on the database.
    phaseRefUpdate('ended');
    setEndReason('cancelled');
    teardownConnection(true);
    // Best-effort: notify the remote peer (sets their terminal transition).
    if (s) persistCallStatus(s.id, 'cancelled', 'cancelled');
  }, [teardownConnection, clearConnectTimeout, persistCallStatus]);

  const endCall = useCallback(async () => {
    const s = sessionRef.current;
    if (!['connected', 'connecting', 'reconnecting'].includes(phaseRef.current)) return;
    callAudio.stopAll();
    clearConnectTimeout();
    // Immediate local cleanup — media, peer connection, listeners, timers,
    // and realtime subscriptions are torn down regardless of signaling/DB.
    phaseRefUpdate('ended');
    setEndReason('ended');
    teardownConnection(true);
    // Best-effort server-side status update; must never block the user hangup.
    if (s) persistCallStatus(s.id, 'ended', 'ended');
  }, [teardownConnection, clearConnectTimeout, persistCallStatus]);

  const endOrCancel = useCallback(() => {
    if (phaseRef.current === 'ringing' || phaseRef.current === 'dialing') {
      cancelCall();
    } else if (['connected', 'connecting', 'reconnecting'].includes(phaseRef.current)) {
      endCall();
    }
  }, [cancelCall, endCall]);

  const dismissEndScreen = useCallback(() => {
    if (endScreenCleanupRef.current !== null) {
      window.clearTimeout(endScreenCleanupRef.current);
      endScreenCleanupRef.current = null;
    }
    teardownConnection(true);
    sessionRef.current = null;
    peerProfileRef.current = null;
    myRoleRef.current = 'caller';
    if (mountedRef.current) {
      setSession(null);
      setPeerProfile(null);
      setEndReason(null);
      setLocalStream(null);
      setRemoteStream(null);
      setMediaError(null);
      setError(null);
      phaseRefUpdate('idle');
    }
  }, [teardownConnection]);

  const retryLastCall = useCallback(async () => {
    const prev = sessionRef.current;
    const peer = peerProfileRef.current;
    if (!prev || !peer || !user) return;
    const type = prev.call_type as CallType;
    const conversationId = prev.conversation_id;
    const otherUserId = prev.caller_id === user.id ? prev.receiver_id : prev.caller_id;
    teardownConnection(true);
    await new Promise((r) => setTimeout(r, START_CALL_RETRY_DELAY_MS));
    await startCall(conversationId, otherUserId, type, peer);
  }, [user, teardownConnection, startCall]);

  // ------------------------------------------------------------------ devices --

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return isMuted;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
    return !track.enabled;
  }, [isMuted]);

  const toggleVideo = useCallback(async () => {
    const pc = peerConnectionRef.current;
    const st = settingsRef.current;
    const ls = localStreamRef.current;

    // Turning video OFF.
    if (!isVideoOff) {
      const track = ls?.getVideoTracks()[0];
      if (track) track.enabled = false;
      if (mountedRef.current) setIsVideoOff(true);
      return true;
    }

    // Turning video ON. If the current call is voice-only there is no camera
    // track yet — acquire one (video-only, so the live audio is untouched),
    // add it, and renegotiate to add the video m-line.
    let track = ls?.getVideoTracks()[0];
    if (!track) {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: st.hdVideo ? 1920 : 1280 },
        height: { ideal: st.hdVideo ? 1080 : 720 },
        ...(st.videoInputDeviceId
          ? { deviceId: { exact: st.videoInputDeviceId } }
          : { facingMode: 'user' }),
      };
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
        integrateStream(videoStream);
      } catch (err) {
        if (mountedRef.current) {
          setError(mapMediaError(err, false, true).message);
        }
        return isVideoOff;
      }
      track = localStreamRef.current?.getVideoTracks()[0];
      if (pc && track) {
        pc.addTrack(track, localStreamRef.current!);
        const ok = await renegotiate();
        if (!ok) {
          if (mountedRef.current) setIsVideoOff(false);
          return isVideoOff;
        }
      }
    }
    if (!track) return isVideoOff;
    track.enabled = true;
    if (mountedRef.current) setIsVideoOff(false);
    return false;
  }, [isVideoOff, integrateStream, renegotiate]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharingPendingRef.current) return false;
    if (screenSharingRef.current) return stopScreenShareRef.current();
    isScreenSharingPendingRef.current = true;

    try {
      const pc = peerConnectionRef.current;
      if (!pc || phaseRef.current !== 'connected') return false;

      let screenStreamLocal: MediaStream;
      try {
        screenStreamLocal = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Screen share unavailable');
        return false;
      }

      screenStreamRef.current = screenStreamLocal;
      const screenTrack = screenStreamLocal.getVideoTracks()[0];
      if (!screenTrack) {
        screenStreamLocal.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        if (mountedRef.current) setError('No shareable content was selected.');
        return false;
      }

      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        screenShareAddedSenderRef.current = null;
      } else {
        // Voice-only call: add a video sender for the screen and renegotiate
        // so the remote gets a brand-new video m-line.
        const added = pc.addTrack(screenTrack, screenStreamLocal);
        screenShareAddedSenderRef.current = added;
        const ok = await renegotiate();
        if (!ok) {
          pc.removeTrack(added);
          screenStreamLocal.getTracks().forEach((t) => t.stop());
          screenStreamRef.current = null;
          screenShareAddedSenderRef.current = null;
          if (mountedRef.current) setError('Could not start screen share.');
          return false;
        }
      }

      screenSharingRef.current = true;
      if (mountedRef.current) {
        setScreenStream(screenStreamLocal);
        setIsScreenSharing(true);
        setError(null);
      }

      screenTrack.onended = () => {
        if (screenSharingRef.current) {
          void stopScreenShareRef.current();
        }
      };

      return true;
    } finally {
      isScreenSharingPendingRef.current = false;
    }
  }, [renegotiate]);

  const stopScreenShare = useCallback(async () => {
    if (isScreenSharingPendingRef.current) return false;
    if (!screenSharingRef.current) return false;
    isScreenSharingPendingRef.current = true;
    try {
      const pc = peerConnectionRef.current;
      if (!pc) return false;
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      }

      const addedSender = screenShareAddedSenderRef.current;
      if (addedSender) {
        // Screen share on a voice call: remove the video sender and drop the
        // video m-line by renegotiating back to the audio-only offer.
        try {
          pc.removeTrack(addedSender);
          screenShareAddedSenderRef.current = null;
          await renegotiate();
        } catch (err) {
          console.error('[CallManager] Failed to stop screen share (voice):', err);
        }
      } else {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender && cameraTrack) {
          try {
            await videoSender.replaceTrack(cameraTrack);
          } catch (err) {
            console.error('[CallManager] Failed to restore camera after screen share:', err);
          }
        }
      }

      screenSharingRef.current = false;
      screenStreamRef.current = null;
      if (mountedRef.current) {
        setScreenStream(null);
        setIsScreenSharing(false);
      }
      return true;
    } finally {
      isScreenSharingPendingRef.current = false;
    }
  }, [renegotiate]);

  const stopScreenShareRef = useRef<() => Promise<boolean>>(async () => false);
  if (stopScreenShareRef.current !== stopScreenShare) {
    stopScreenShareRef.current = stopScreenShare;
  }

  const switchCamera = useCallback(async () => {
    const st = settingsRef.current;
    const prevSettings = st;
    const curFacing = localStreamRef.current?.getVideoTracks()[0]?.getSettings()?.facingMode;
    const nextFacing = curFacing === 'user' ? 'environment' : 'user';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: st.hdVideo ? 1920 : 1280 },
          height: { ideal: st.hdVideo ? 1080 : 720 },
          facingMode: { exact: nextFacing },
        },
      });
      const track = stream.getVideoTracks()[0];
      const pc = peerConnectionRef.current;
      const ls = localStreamRef.current;
      const old = ls?.getVideoTracks()[0];
      if (ls) {
        if (old) ls.removeTrack(old);
        ls.addTrack(track);
      }
      if (pc) await replaceSenderTrack(pc, 'video', track).catch(() => {});
      old?.stop();
      setSettings({ ...prevSettings, videoInputDeviceId: null });
      settingsRef.current = { ...prevSettings, videoInputDeviceId: null };
      return true;
    } catch (err) {
      if (mountedRef.current) {
        const mapped = mapMediaError(err, false, true);
        setError(mapped.message);
      }
      return false;
    }
  }, [replaceSenderTrack]);

  const setAudioInput = useCallback(
    async (deviceId: string | null) => {
      const st = settingsRef.current;
      const next = { ...st, audioInputDeviceId: deviceId };
      settingsRef.current = next;
      setSettings(next);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: next.echoCancellation,
            noiseSuppression: next.noiseSuppression,
            autoGainControl: next.autoGainControl,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          video: false,
        });
        const track = stream.getAudioTracks()[0];
        const pc = peerConnectionRef.current;
        const ls = localStreamRef.current;
        const old = ls?.getAudioTracks()[0];
        if (ls) {
          if (old) ls.removeTrack(old);
          ls.addTrack(track);
        }
        if (pc) await replaceSenderTrack(pc, 'audio', track).catch(() => {});
        old?.stop();
        return true;
      } catch (err) {
        settingsRef.current = { ...st };
        setSettings({ ...st });
        setError('Could not switch microphone.');
        return false;
      }
    },
    [replaceSenderTrack]
  );

  const setVideoInput = useCallback(
    async (deviceId: string | null) => {
      const st = settingsRef.current;
      const next = { ...st, videoInputDeviceId: deviceId };
      settingsRef.current = next;
      setSettings(next);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { width: { ideal: st.hdVideo ? 1920 : 1280 }, height: { ideal: st.hdVideo ? 1080 : 720 }, deviceId: { exact: deviceId } }
            : { width: { ideal: st.hdVideo ? 1920 : 1280 }, height: { ideal: st.hdVideo ? 1080 : 720 }, facingMode: 'user' },
        });
        const track = stream.getVideoTracks()[0];
        const pc = peerConnectionRef.current;
        const ls = localStreamRef.current;
        const old = ls?.getVideoTracks()[0];
        if (ls) {
          if (old) ls.removeTrack(old);
          ls.addTrack(track);
        }
        if (pc) await replaceSenderTrack(pc, 'video', track).catch(() => {});
        old?.stop();
        return true;
      } catch (err) {
        settingsRef.current = { ...st };
        setSettings({ ...st });
        setError('Could not switch camera.');
        return false;
      }
    },
    [replaceSenderTrack]
  );

  const setAudioOutput = useCallback((deviceId: string | null) => {
    setSettings((prev) => (prev.audioOutputDeviceId === deviceId ? prev : { ...prev, audioOutputDeviceId: deviceId }));
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<CallSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      if (patch.noiseSuppression !== undefined || patch.echoCancellation !== undefined || patch.autoGainControl !== undefined) {
        setAudioInput(next.audioInputDeviceId);
      }
      if (patch.hdVideo !== undefined && localStreamRef.current?.getVideoTracks()[0]) {
        setVideoInput(next.videoInputDeviceId);
      }
    },
    [setAudioInput, setVideoInput]
  );

  const clearMediaError = useCallback(() => {
    if (mountedRef.current) {
      setMediaError(null);
      setError(null);
      if (phaseRef.current === 'ended' && endReasonRef.current === 'failed') {
        phaseRefUpdate('idle');
        sessionRef.current = null;
      }
    }
  }, []);

  // ------------------------------------------------------------------ devices --

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs: MediaDeviceInfoBasic[] = [];
      const videoInputs: MediaDeviceInfoBasic[] = [];
      const audioOutputs: MediaDeviceInfoBasic[] = [];
      for (const d of list) {
        const label =
          d.label ||
          (d.kind === 'audioinput' ? 'Microphone' : d.kind === 'videoinput' ? 'Camera' : 'Speaker');
        const item = { deviceId: d.deviceId, kind: d.kind as MediaDeviceInfoBasic['kind'], label };
        if (d.kind === 'audioinput') audioInputs.push(item);
        else if (d.kind === 'videoinput') videoInputs.push(item);
        else if (d.kind === 'audiooutput') audioOutputs.push(item);
      }
      setDevices({ audioInputs, videoInputs, audioOutputs });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    }
  }, [refreshDevices]);

  // ------------------------------------------------------------------ lifecycle --

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardownConnection(true);
    };
  }, [teardownConnection]);

  useEffect(() => {
    if (!user) {
      teardownConnection(true);
    }
  }, [user, teardownConnection]);

  const isCallInProgress = phase !== 'idle' && phase !== 'ended';
  const isOutgoingRinging = phase === 'ringing';

  return {
    phase,
    endReason,
    session,
    peerProfile,
    localStream,
    remoteStream,
    screenStream,
    connectionState,
    iceState,
    quality,
    isMuted,
    isVideoOff,
    isScreenSharing,
    mediaError,
    error,
    devices,
    settings,
    isCallInProgress,
    isOutgoingRinging,
    startCall,
    answerCall,
    declineIncoming,
    missIncoming,
    cancelCall,
    endCall,
    endOrCancel,
    retryLastCall,
    dismissEndScreen,
    clearMediaError,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    stopScreenShare,
    switchCamera,
    setAudioInput,
    setVideoInput,
    setAudioOutput,
    updateSettings,
    sendReaction,
    onReaction,
  };
}