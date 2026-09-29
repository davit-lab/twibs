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

type CallDiagnosticEvent =
  | 'LOCAL_TRACK_ADDED'
  | 'REMOTE_TRACK_RECEIVED'
  | 'CONNECTION_STATE'
  | 'ICE_STATE'
  | 'SCREEN_TRACK_ACQUIRED'
  | 'SCREEN_TRACK_REPLACED'
  | 'REMOTE_SCREEN_TRACK'
  | 'SCREEN_TRACK_ENDED'
  | 'REMOTE_HANGUP'
  | 'CLEANUP_COMPLETE';

const callDiagnostic = (event: CallDiagnosticEvent, details: Record<string, unknown> = {}) => {
  if (!import.meta.env.DEV) return;
  console.debug('[TwibsCall]', { event, ...details });
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
  remoteIsScreenSharing: boolean;
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

/**
 * Persisting trickle ICE is useful, but must not be the only route to a
 * working call. Waiting briefly lets the initial SDP carry host/STUN/TURN
 * candidates too, which survives a transient realtime or RPC failure.
 */
const waitForIceGathering = (pc: RTCPeerConnection, timeoutMs = 1800): Promise<void> =>
  new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const timeout = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    }
    function onStateChange() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', onStateChange);
  });

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
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState<CallMediaError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Devices>({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [settings, setSettings] = useState<CallSettings>(CALL_DEFAULTS);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Build one stable remote stream from individual ontrack events. Some
  // browsers omit event.streams, and relying on streams[0] loses audio when
  // video/audio tracks arrive independently.
  const remoteStreamRef = useRef<MediaStream | null>(null);
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
  const mutedRef = useRef(false);
  const videoOffRef = useRef(false);
  const isScreenSharingPendingRef = useRef(false);
  const isCleaningUpRef = useRef(false);
  const mountedRef = useRef(true);
  const ringTimeoutRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const qualityTimerRef = useRef<number | null>(null);
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
  /** The last offer created by this peer, used to ignore our own realtime echo. */
  const localOfferRef = useRef<string | null>(null);
  /** Guards against concurrent renegotiations (createOffer races). */
  const renegotiatingRef = useRef(false);
  /**
   * Set when screen share had to ADD a video sender on a voice-only call.
   * On stop the sender must be removed (and the m-line dropped) rather than
   * replaced back with a camera track.
   */
  const screenShareAddedSenderRef = useRef<RTCRtpSender | null>(null);
  // Serialize persisted screen-state updates so a quick native stop cannot be
  // overtaken by the preceding "started sharing" request on a slow network.
  const screenSignalChainRef = useRef<Promise<void>>(Promise.resolve());

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

  const stopTimers = useCallback(() => {
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
  }, [clearConnectTimeout]);

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
      remoteStreamRef.current = null;
      if (mountedRef.current) {
        setLocalStream(null);
        setRemoteStream(null);
        setScreenStream(null);
        setIsScreenSharing(false);
        setRemoteIsScreenSharing(false);
        setConnectionState(null);
        setIceState(null);
      }
      connectionStateRef.current = null;
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
      localOfferRef.current = null;
      renegotiatingRef.current = false;
      mutedRef.current = false;
      videoOffRef.current = false;
      if (mountedRef.current) {
        setIsMuted(false);
        setIsVideoOff(false);
      }
      stopTimers();
      callAudio.stopAll();
      sessionIdForAudioRef.current = null;
      callDiagnostic('CLEANUP_COMPLETE', { stopMedia });
    } finally {
      isCleaningUpRef.current = false;
    }
  }, [stopTimers]);

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
            .update({ status, ended_at: new Date().toISOString(), ended_reason: reason, screen_sharing_by: null })
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

      // Stop every capture track immediately. Keeping a final video frame is
      // never worth leaving a microphone, camera or shared display live after
      // either participant hangs up.
      teardownConnection(true);
    },
    [teardownConnection, clearConnectTimeout, persistCallStatus]
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
      if (match) {
        existing.removeTrack(match);
        match.stop();
      }
      existing.addTrack(track);
      callDiagnostic('LOCAL_TRACK_ADDED', {
        callId: sessionRef.current?.id ?? null,
        peer: peerProfileRef.current?.user_id ?? null,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      });
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
      const serializedOffer = JSON.stringify(pc.localDescription);
      localOfferRef.current = serializedOffer;
      // The row contains the answer to the previous negotiation. Clear it in
      // the same write as the new offer so this peer can never consume a stale
      // answer before the remote has answered the new offer.
      appliedAnswerRef.current = null;
      const { error: signalError } = await supabase
        .from('call_sessions')
        .update({ sdp_offer: serializedOffer, sdp_answer: null })
        .eq('id', s.id);
      if (signalError) throw signalError;
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
      .on('broadcast', { event: 'screen-share' }, (payload) => {
        const message = (payload as { payload?: { sharing?: boolean; userId?: string } })?.payload;
        if (!message || message.userId === user?.id) return;
        if (mountedRef.current) setRemoteIsScreenSharing(message.sharing === true);
      })
      .subscribe();
    reactChannelRef.current = channel;
  }, [user?.id]);

  const signalScreenSharing = useCallback(async (sharing: boolean) => {
    const s = sessionRef.current;
    if (!s || !user) return false;
    // Broadcast gives the active peer immediate UI feedback. The RPC persists
    // the same state so a delayed/reconnected subscriber catches up reliably.
    void reactChannelRef.current?.send({
      type: 'broadcast',
      event: 'screen-share',
      payload: { sharing, userId: user.id },
    }).catch(() => {});
    const request = screenSignalChainRef.current.then(async () => {
      try {
        const { error: signalError } = await supabase.rpc('set_call_screen_sharing', {
          p_session_id: s.id,
          p_sharing: sharing,
        });
        if (signalError && import.meta.env.DEV) {
          console.warn('[CallManager] Screen-share state signal failed:', signalError.message);
        }
        return !signalError;
      } catch (signalError) {
        if (import.meta.env.DEV) {
          console.warn('[CallManager] Screen-share state signal failed:', getErrorMessage(signalError));
        }
        return false;
      }
    });
    screenSignalChainRef.current = request.then(() => undefined);
    return request;
  }, [user]);

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
        callDiagnostic('REMOTE_TRACK_RECEIVED', {
          callId: sessionId,
          peer: isCaller ? 'receiver' : 'caller',
          kind: event.track.kind,
          enabled: event.track.enabled,
          muted: event.track.muted,
          readyState: event.track.readyState,
        });
        let remote = remoteStreamRef.current;
        if (!remote) {
          remote = new MediaStream();
          remoteStreamRef.current = remote;
        }
        if (!remote.getTracks().some(track => track.id === event.track.id)) {
          remote.addTrack(event.track);
        }
        const publishRemoteStream = () => {
          const current = remoteStreamRef.current;
          if (current && mountedRef.current) {
            // Publish a new MediaStream wrapper because React will otherwise
            // bail out when a later track is added to the same mutable stream.
            setRemoteStream(new MediaStream(current.getTracks()));
          }
        };
        event.track.onmute = publishRemoteStream;
        event.track.onunmute = publishRemoteStream;
        event.track.onended = () => {
          const current = remoteStreamRef.current;
          if (!current) return;
          const track = current.getTracks().find(item => item.id === event.track.id);
          if (track) current.removeTrack(track);
          publishRemoteStream();
        };
        publishRemoteStream();
      };

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        connectionStateRef.current = pc.connectionState;
        setConnectionState(pc.connectionState);
        callDiagnostic('CONNECTION_STATE', {
          callId: sessionId,
          peer: isCaller ? 'receiver' : 'caller',
          state: pc.connectionState,
          senders: pc.getSenders().map((sender) => sender.track?.kind ?? 'empty'),
          receivers: pc.getReceivers().map((receiver) => receiver.track?.kind ?? 'empty'),
          transceivers: pc.getTransceivers().map((transceiver) => ({
            mid: transceiver.mid,
            direction: transceiver.direction,
            currentDirection: transceiver.currentDirection,
          })),
        });

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
        callDiagnostic('ICE_STATE', {
          callId: sessionId,
          peer: isCaller ? 'receiver' : 'caller',
          state: pc.iceConnectionState,
        });
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
      const handleSessionUpdate = async (updated: CallSession) => {
        if (!mountedRef.current || !peerConnectionRef.current) return;
        if (phaseRef.current === 'ended') return;

        // Remote terminal transitions always win.
        const terminal = updated.status !== 'ringing' && updated.status !== 'accepted';
        if (terminal) {
          callDiagnostic('REMOTE_HANGUP', {
            callId: sessionId,
            peer: isCaller ? 'receiver' : 'caller',
            status: updated.status,
          });
          finishCall(statusToEndReason(updated.status), { skipDb: true });
          return;
        }

        const remoteSharing =
          !!updated.screen_sharing_by && updated.screen_sharing_by !== user?.id;
        setRemoteIsScreenSharing(remoteSharing);
        if (remoteSharing) {
          callDiagnostic('REMOTE_SCREEN_TRACK', {
            callId: sessionId,
            peer: isCaller ? 'receiver' : 'caller',
            remoteVideoTracks: remoteStreamRef.current?.getVideoTracks().length ?? 0,
          });
        }

        if (isCaller && updated.status === 'accepted') {
          callAudio.stopOutgoingRingback(sessionId);
        }

        const pc = peerConnectionRef.current;
        // Either side may create a renegotiation offer. Apply an answer when
        // this peer currently owns the local offer.
        if (
          updated.sdp_answer &&
          updated.sdp_answer !== appliedAnswerRef.current &&
          pc.signalingState === 'have-local-offer'
        ) {
          try {
            callAudio.stopOutgoingRingback(sessionId);
            appliedAnswerRef.current = updated.sdp_answer;
            phaseRefUpdate('connecting');
            startConnectTimeout();
            await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(updated.sdp_answer)));
            await processPendingIceCandidates();
            await syncRemoteCandidates(sessionId, isCaller);
          } catch {
            finishCall('failed', { dbStatus: 'ended' });
            return;
          }
        }

        // A new offer can originate from either participant. The receiver is
        // the polite peer for simultaneous-offer collision handling.
        if (
          updated.sdp_offer &&
          updated.sdp_offer !== lastRemoteOfferRef.current &&
          updated.sdp_offer !== localOfferRef.current
        ) {
          try {
            const offerCollision = pc.signalingState !== 'stable';
            if (offerCollision && isCaller) return;
            if (offerCollision) await pc.setLocalDescription({ type: 'rollback' });
            lastRemoteOfferRef.current = updated.sdp_offer;
            await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(updated.sdp_offer)));
            await processPendingIceCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const { error: answerError } = await supabase
              .from('call_sessions')
              .update({ sdp_answer: JSON.stringify(pc.localDescription) })
              .eq('id', sessionId);
            if (answerError) throw answerError;
            await syncRemoteCandidates(sessionId, isCaller);
          } catch (err) {
            console.error('[CallManager] Failed to negotiate media upgrade:', err);
            finishCall('failed', { dbStatus: 'ended' });
            return;
          }
        }

        const candidatesField = isCaller ? 'receiver_ice_candidates' : 'caller_ice_candidates';
        const candidates = (updated as unknown as Record<string, RTCIceCandidateInit[]>)[candidatesField] || [];
        if (candidates.length > 0 && pc.remoteDescription) {
          await addIceCandidates(candidates);
        }
      };

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
            await handleSessionUpdate(payload.new as CallSession);
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          // Realtime can subscribe just after the remote answer/hangup update.
          // Read the authoritative row once so that edge is never missed.
          void supabase
            .from('call_sessions')
            .select('*')
            .eq('id', sessionId)
            .single()
            .then(({ data }) => {
              if (data) void handleSessionUpdate(data as unknown as CallSession);
            });
        });

      channelRef.current = channel;
      syncRemoteCandidates(sessionId, isCaller);
    },
    [finishCall, addIceCandidates, processPendingIceCandidates, syncRemoteCandidates, startConnectTimeout, user?.id]
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
        mutedRef.current = false;
        videoOffRef.current = type === 'audio';
        setIsMuted(false);
        setIsVideoOff(type === 'audio');

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

        // Subscribe before publishing the offer. This closes the race where a
        // very fast answer arrives between the database write and subscription.
        subscribeToSession(callSession.id, true);
        subscribeReactions(callSession.id, () => {});

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: type === 'video',
        });
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);
        localOfferRef.current = JSON.stringify(pc.localDescription);

        const { error: offerError } = await supabase
          .from('call_sessions')
          .update({ sdp_offer: localOfferRef.current })
          .eq('id', callSession.id);
        if (offerError) throw offerError;

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
        mutedRef.current = false;
        videoOffRef.current = latestSession.call_type === 'audio';
        setIsMuted(false);
        setIsVideoOff(latestSession.call_type === 'audio');

        // The caller may hang up while the browser permission prompt is open.
        // Re-read the row before creating/accepting the connection so a late
        // permission grant cannot resurrect a cancelled call.
        const { data: currentSession, error: currentSessionError } = await supabase
          .from('call_sessions')
          .select('status')
          .eq('id', s.id)
          .single();
        if (currentSessionError) throw currentSessionError;
        if (currentSession.status !== 'ringing') {
          await finishCall(statusToEndReason(currentSession.status), { skipDb: true });
          return;
        }

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
        await waitForIceGathering(pc);

        // SDP exchange complete: move to 'connecting' (and arm the connect
        // timeout) BEFORE the awaited DB write below, so an ICE 'connected'
        // event that fires during the write still promotes us correctly.
        phaseRefUpdate('connecting');
        startConnectTimeout();

        const now = new Date().toISOString();
        const { data: acceptedSession, error: answerSignalError } = await supabase
          .from('call_sessions')
          .update({
            sdp_answer: JSON.stringify(pc.localDescription),
            status: 'accepted',
            started_at: now,
          })
          .eq('id', s.id)
          .eq('status', 'ringing')
          .select('id')
          .maybeSingle();
        if (answerSignalError) throw answerSignalError;
        if (!acceptedSession) {
          const { data: endedSession } = await supabase
            .from('call_sessions')
            .select('status')
            .eq('id', s.id)
            .single();
          await finishCall(statusToEndReason(endedSession?.status ?? 'ended'), { skipDb: true });
          return;
        }

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
    if (!track) return mutedRef.current;
    track.enabled = !track.enabled;
    mutedRef.current = !track.enabled;
    setIsMuted(mutedRef.current);
    return mutedRef.current;
  }, []);

  const toggleVideo = useCallback(async () => {
    const pc = peerConnectionRef.current;
    const st = settingsRef.current;
    const ls = localStreamRef.current;

    // Turning video OFF.
    if (!isVideoOff) {
      const track = ls?.getVideoTracks()[0];
      if (track) track.enabled = false;
      videoOffRef.current = true;
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
        const addedSender = pc.addTrack(track, localStreamRef.current!);
        const ok = await renegotiate();
        if (!ok) {
          pc.removeTrack(addedSender);
          localStreamRef.current?.removeTrack(track);
          track.stop();
          videoOffRef.current = true;
          if (mountedRef.current) {
            setIsVideoOff(true);
            setError('Could not turn on video. Please try again.');
          }
          return true;
        }
      }
    }
    if (!track) return isVideoOff;
    track.enabled = true;
    videoOffRef.current = false;
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
      if (!navigator.mediaDevices?.getDisplayMedia) {
        if (mountedRef.current) setError('Screen sharing is not supported by this browser.');
        return false;
      }

      let screenStreamLocal: MediaStream;
      try {
        screenStreamLocal = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 15, max: 30 },
          },
          audio: false,
        });
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (mountedRef.current) {
          setError(name === 'AbortError' || name === 'NotAllowedError'
            ? 'Screen sharing was cancelled or not allowed.'
            : err instanceof Error ? err.message : 'Screen share unavailable');
        }
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
      callDiagnostic('SCREEN_TRACK_ACQUIRED', {
        readyState: screenTrack.readyState,
        width: screenTrack.getSettings().width,
        height: screenTrack.getSettings().height,
      });

      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        callDiagnostic('SCREEN_TRACK_REPLACED', { mode: 'replace-camera' });
        screenShareAddedSenderRef.current = null;
      } else {
        // Voice-only call: add a video sender for the screen and renegotiate
        // so the remote gets a brand-new video m-line.
        const added = pc.addTrack(screenTrack, screenStreamLocal);
        callDiagnostic('SCREEN_TRACK_REPLACED', { mode: 'new-video-sender' });
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
        callDiagnostic('SCREEN_TRACK_ENDED', { source: 'browser-or-track' });
        if (screenSharingRef.current) {
          void stopScreenShareRef.current();
        }
      };

      // The media operation is complete; do not hold the UI lock while the
      // persisted state travels to Supabase. The serialized queue preserves
      // start/stop ordering if the browser-native Stop action fires now.
      void signalScreenSharing(true);

      return true;
    } finally {
      isScreenSharingPendingRef.current = false;
    }
  }, [renegotiate, signalScreenSharing]);

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
      void signalScreenSharing(false);
      return true;
    } finally {
      isScreenSharingPendingRef.current = false;
    }
  }, [renegotiate, signalScreenSharing]);

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
      track.enabled = !videoOffRef.current;
      const pc = peerConnectionRef.current;
      const ls = localStreamRef.current;
      const old = ls?.getVideoTracks()[0];
      if (ls) {
        if (old) ls.removeTrack(old);
        ls.addTrack(track);
      }
      // While presenting, the sender must keep the display track. Updating the
      // local camera here prepares the camera that will be restored on stop.
      if (pc && !screenSharingRef.current) {
        await replaceSenderTrack(pc, 'video', track).catch(() => {});
      }
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
        track.enabled = !mutedRef.current;
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
        track.enabled = !videoOffRef.current;
        const pc = peerConnectionRef.current;
        const ls = localStreamRef.current;
        const old = ls?.getVideoTracks()[0];
        if (ls) {
          if (old) ls.removeTrack(old);
          ls.addTrack(track);
        }
        // Preserve the display sender during screen sharing. The newly chosen
        // camera remains in localStream and becomes the restored track later.
        if (pc && !screenSharingRef.current) {
          await replaceSenderTrack(pc, 'video', track).catch(() => {});
        }
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
    remoteIsScreenSharing,
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
