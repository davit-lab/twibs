export type CallType = 'audio' | 'video';

/**
 * Application-level call phases. This is the authoritative state for the
 * active call session (outgoing + answered incoming). Competing inbound calls
 * are handled by the queue / waiting system, not by this state machine.
 */
export type CallPhase =
  | 'idle'
  | 'dialing'      // getting media + creating the signaling session
  | 'ringing'      // outgoing, waiting for the remote to answer
  | 'connecting'   // SDP exchanged, ICE establishing
  | 'connected'
  | 'reconnecting' // ICE temporarily dropped; attempting recovery
  | 'ended';       // terminal; see endReason

export type CallEndReason =
  | 'ended'     // normal end (either side hung up while connected)
  | 'declined'  // remote rejected the call
  | 'cancelled' // caller cancelled while ringing
  | 'busy'      // remote is already in a call / can't accept
  | 'missed'    // never answered (timeout)
  | 'failed';   // connection failed / media access failed

export interface PeerProfile {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

/** Mirror of the call_sessions row used by the client. */
export interface CallSession {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed' | 'cancelled' | 'busy';
  sdp_offer: string | null;
  sdp_answer: string | null;
  caller_ice_candidates: RTCIceCandidateInit[];
  receiver_ice_candidates: RTCIceCandidateInit[];
  started_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
}

export interface CallQuality {
  level: 'excellent' | 'good' | 'weak' | 'reconnecting';
  rttMs: number | null;
}

export interface CallMediaError {
  code: 'permission-denied' | 'not-found' | 'unavailable' | 'unknown';
  audio: boolean;
  video: boolean;
  message: string;
}

export interface MediaDeviceInfoBasic {
  deviceId: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
  label: string;
}

/** DTMF / add-participant are intentionally absent: not supported by the backend. */
export interface CallSettings {
  audioInputDeviceId: string | null;
  videoInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  hdVideo: boolean;
}

export const CALL_DEFAULTS: CallSettings = {
  audioInputDeviceId: null,
  videoInputDeviceId: null,
  audioOutputDeviceId: null,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  hdVideo: false,
};