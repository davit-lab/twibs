import type { ChallengeInstruction, ProofFrame } from '@/lib/security/faceLiveness';

export type { ChallengeInstruction, ProofFrame };

export type VerificationPurpose = 'verify' | 'enroll';

export type VerificationState =
  | 'idle'
  | 'camera_initializing'
  | 'camera_permission_required'
  | 'camera_error'
  | 'detecting_face'
  | 'multiple_faces'
  | 'camera_ready'
  | 'liveness_starting'
  | 'liveness_in_progress'
  | 'liveness_failed'
  | 'liveness_success'
  | 'face_matching'
  | 'face_match_failed'
  | 'authentication_success'
  | 'authentication_failed'
  | 'too_many_attempts';

export interface IssuedChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  sequence: ChallengeInstruction[];
}

export interface LivenessProof {
  challengeId: string;
  sequence: string[];
  frames: ProofFrame[];
  samplingRate: number;
  maxFaceGapMs: number;
  multiFaceFrames: number;
  minFaceSize: number;
  maxFaceSize: number;
}

export interface FaceVerificationSuccess {
  grantToken?: string;
  expiresIn?: number;
  expiresAt?: string;
}

export interface VerificationApiResult<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

/** Raw per-frame signal bundle handed to the liveness engine. */
export interface FaceFrameSignals {
  /** Number of faces detected in this frame. */
  faceCount: number;
  yaw: number;
  pitch: number;
  roll: number;
  eyeAspect: number;
  mouthAspect: number;
  smileAspect: number;
  faceSize: number;
  x: number;
  y: number;
  quality: number;
}

export interface FaceDetectionResult {
  signals: FaceFrameSignals | null;
  /** MediaPipe landmark points (0-1 normalized), for the face mesh overlay. */
  mesh: { x: number; y: number; z: number }[][];
}
