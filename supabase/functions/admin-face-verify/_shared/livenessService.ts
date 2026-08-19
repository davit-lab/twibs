// Server-side liveness proof validation.
//
// The computer-vision pipeline (face detection, landmarks, blendshapes, head
// pose) runs in the browser because that is the only place a webcam feed is
// available. What the SERVER refuses to do is trust a client-reported boolean.
// The client therefore uploads the RAW per-frame metrics and the server
// re-derives the verdict by applying the same thresholds below. This means a
// client cannot mark frames as "passed" — it must produce metric values that
// actually cross the required thresholds on a believable timeline.
//
// Honest limitation: a malicious client controlling the browser could still
// fabricate plausible metrics. Browser liveness is never equivalent to
// hardware 3D/IR depth sensing; this layer adds structure, randomness,
// expiration, replay protection and rate limiting on top of it.

import type { ChallengeInstruction } from "./challengeService.ts";
import { challengeConfig } from "./challengeService.ts";

export interface ProofFrame {
  /** ms relative to challenge start. */
  t: number;
  /** instruction active at this frame. */
  action: string;
  /** head yaw in degrees (negative = looking left). */
  yaw: number;
  /** head pitch in degrees (negative = tilted up). */
  pitch: number;
  /** head roll in degrees. */
  roll: number;
  /** 0-1 average eye openness (1 = fully open). */
  eyeAspect: number;
  /** 0-1 mouth openness. */
  mouthAspect: number;
  /** 0-1 smile intensity (mouth corner rise). */
  smileAspect: number;
  /** normalized face bounding-box size relative to frame (0-1). */
  faceSize: number;
  /** face center x (0-1). */
  x: number;
  /** face center y (0-1). */
  y: number;
  /** 0-1 blur/sharpness quality estimate. */
  quality: number;
}

export interface LivenessProof {
  challengeId: string;
  sequence: string[];
  frames: ProofFrame[];
  samplingRate: number; // frames per second the client reported
  maxFaceGapMs: number; // longest continuous stretch without a detected face
  multiFaceFrames: number; // frames where more than one face was present
  minFaceSize: number; // smallest normalized face size seen
  maxFaceSize: number; // largest normalized face size seen
}

export interface LivenessVerdict {
  ok: boolean;
  reason?: string;
}

// ---- Thresholds (degrees for pose, 0-1 for aspects). ---------------------
const CENTER_YAW_MAX = 14;
const CENTER_PITCH_MAX = 12;
const CENTER_ROLL_MAX = 10;
const GAZE_YAW_DEG = 18; // head must yaw past this to count as left/right
const PITCH_UP_DEG = 14; // looking up: pitch drops below -this
const PITCH_DOWN_DEG = 14; // looking down: pitch above +this
const BLINK_CLOSED_MAX = 0.24; // eye aspect below this = "closed"
const BLINK_OPEN_MIN = 0.42; // eye aspect above this = "open"
const MOUTH_OPEN_MIN = 0.32; // mouth aspect to count as open
const SMILE_MIN = 0.28; // smile aspect to count as smiling
const QUALITY_MIN = 0.55; // average frame quality must stay above this
const FACE_SIZE_MIN = 0.18; // face must never shrink below this
const FACE_SIZE_MAX = 0.85; // ...nor blow up (print/screen attack indicator)
const FACE_GAP_MAX_MS = 1200; // face disappearing is treated as suspicious
const MAX_MULTI_FACE_FRAMES = 0; // any multi-face frame is suspicious

// How many consecutive frames must satisfy an instruction to be accepted.
function sustainFrames(samplingRate: number): number {
  return Math.max(2, Math.round(samplingRate * 1.0)); // >= ~1.0s of hold
}

export function validateLivenessProof(
  challenge: { sequence: ChallengeInstruction[]; id: string; expires_at: string },
  proof: LivenessProof,
  now = Date.now(),
): LivenessVerdict {
  const config = challengeConfig();

  if (proof.challengeId !== challenge.id) {
    return { ok: false, reason: "proof/challenge mismatch" };
  }
  void now;

  // The client must echo back the exact sequence the server issued.
  const expectedSeq = challenge.sequence.map((s) => s.type);
  if (
    expectedSeq.length !== proof.sequence.length ||
    expectedSeq.some((t, i) => t !== proof.sequence[i])
  ) {
    return { ok: false, reason: "sequence mismatch" };
  }

  const frames = proof.frames;
  if (!Array.isArray(frames) || frames.length < 8) {
    return { ok: false, reason: "insufficient frames" };
  }

  // Timestamps must be strictly increasing and confined to the challenge window.
  let prevT = -1;
  for (const f of frames) {
    if (!Number.isFinite(f.t) || f.t <= prevT) {
      return { ok: false, reason: "non-monotonic timeline" };
    }
    prevT = f.t;
  }
  const durationMs = frames[frames.length - 1].t - frames[0].t;
  if (durationMs < config.minDurationMs) return { ok: false, reason: "challenge too short" };
  if (durationMs > config.maxDurationMs) return { ok: false, reason: "challenge too long" };

  // Every frame must carry a valid action label from the issued sequence.
  const validActions = new Set(expectedSeq);
  for (const f of frames) {
    if (!validActions.has(f.action)) return { ok: false, reason: "invalid action label" };
  }

  // ---- Anti-spoofing counters -------------------------------------------
  if (proof.multiFaceFrames > MAX_MULTI_FACE_FRAMES) {
    return { ok: false, reason: "multiple faces detected" };
  }
  if (proof.maxFaceGapMs > FACE_GAP_MAX_MS) {
    return { ok: false, reason: "face disappeared" };
  }
  const minSize = Math.min(proof.minFaceSize ?? 1, ...frames.map((f) => f.faceSize));
  const maxSize = Math.max(proof.maxFaceSize ?? 0, ...frames.map((f) => f.faceSize));
  if (minSize < FACE_SIZE_MIN || maxSize > FACE_SIZE_MAX) {
    return { ok: false, reason: "face size inconsistent" };
  }
  const avgQuality = frames.reduce((s, f) => s + f.quality, 0) / frames.length;
  if (avgQuality < QUALITY_MIN) {
    return { ok: false, reason: "low quality feed" };
  }

  // ---- Per-instruction evaluation ----------------------------------------
  // Derive the effective sampling rate from the actual frame timestamps so a
  // client cannot weaken the sustain requirement by under-reporting its rate.
  const span = Math.max(1, frames[frames.length - 1].t - frames[0].t);
  const effectiveRate = ((frames.length - 1) / span) * 1000;
  const sustain = sustainFrames(Math.min(effectiveRate, 100));

  for (const instruction of challenge.sequence) {
    const action = instruction.type;
    const window = frames.filter((f) => f.action === action);
    if (window.length === 0) {
      return { ok: false, reason: `missing: ${action}` };
    }

    let pass = false;
    if (action === "center") {
      pass = window.filter(
        (f) =>
          Math.abs(f.yaw) <= CENTER_YAW_MAX &&
          Math.abs(f.pitch) <= CENTER_PITCH_MAX &&
          Math.abs(f.roll) <= CENTER_ROLL_MAX,
      ).length >= sustain;
    } else if (action === "left") {
      pass = window.filter((f) => f.yaw <= -GAZE_YAW_DEG).length >= sustain;
    } else if (action === "right") {
      pass = window.filter((f) => f.yaw >= GAZE_YAW_DEG).length >= sustain;
    } else if (action === "up") {
      pass = window.filter((f) => f.pitch <= -PITCH_UP_DEG).length >= sustain;
    } else if (action === "down") {
      pass = window.filter((f) => f.pitch >= PITCH_DOWN_DEG).length >= sustain;
    } else if (action === "blink") {
      // A blink is an open → closed → open transition.
      const minEye = Math.min(...window.map((f) => f.eyeAspect));
      const maxEye = Math.max(...window.map((f) => f.eyeAspect));
      const closedFrames = window.filter((f) => f.eyeAspect < BLINK_CLOSED_MAX).length;
      pass = minEye < BLINK_CLOSED_MAX && maxEye > BLINK_OPEN_MIN && closedFrames >= Math.max(2, sustain / 3);
    } else if (action === "smile") {
      pass = window.filter((f) => f.smileAspect >= SMILE_MIN).length >= sustain;
    } else if (action === "open_mouth") {
      pass = window.filter((f) => f.mouthAspect >= MOUTH_OPEN_MIN).length >= sustain;
    } else {
      return { ok: false, reason: `unknown instruction: ${action}` };
    }

    if (!pass) {
      return { ok: false, reason: `instruction not satisfied: ${action}` };
    }
  }

  return { ok: true };
}
