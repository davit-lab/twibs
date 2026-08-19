// Client-side mirror of the server's liveness validation (see
// supabase/functions/admin-face-verify/_shared/livenessService.ts).
//
// The SERVER is authoritative: it re-derives the verdict from the raw per-frame
// metrics that the client uploads. The mirror here exists only so the UI can
// give instant feedback (progress bars, "keep going" nudges) while the liveness
// run is happening. A client that fakes these numbers still fails server-side.
//
// The numbers below MUST stay in sync with the edge function.

export type InstructionType =
  | 'center'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'blink'
  | 'smile'
  | 'open_mouth';

export interface ChallengeInstruction {
  type: InstructionType;
  label: string;
  windowMs: number;
}

export interface ProofFrame {
  t: number;
  action: string;
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

export interface FrameSignals {
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

// ---- Thresholds (mirrors the server) --------------------------------------
export const CENTER_YAW_MAX = 14;
export const CENTER_PITCH_MAX = 12;
export const CENTER_ROLL_MAX = 10;
export const GAZE_YAW_DEG = 18;
export const PITCH_UP_DEG = 14;
export const PITCH_DOWN_DEG = 14;
export const BLINK_CLOSED_MAX = 0.24;
export const BLINK_OPEN_MIN = 0.42;
export const MOUTH_OPEN_MIN = 0.32;
export const SMILE_MIN = 0.28;
export const FACE_SIZE_MIN = 0.18;
export const FACE_SIZE_MAX = 0.85;
export const FACE_GAP_MAX_MS = 1200;
export const QUALITY_MIN = 0.55;

/** Client proof sampling cadence (ms). Must be ~1/5 of a second. */
export const PROOF_SAMPLING_MS = 200;

export function sustainFrames(samplingRate: number): number {
  return Math.max(2, Math.round(samplingRate * 1.0));
}

export function instructionSatisfied(action: InstructionType, f: FrameSignals): boolean {
  switch (action) {
    case 'center':
      return Math.abs(f.yaw) <= CENTER_YAW_MAX && Math.abs(f.pitch) <= CENTER_PITCH_MAX && Math.abs(f.roll) <= CENTER_ROLL_MAX;
    case 'left':
      return f.yaw <= -GAZE_YAW_DEG;
    case 'right':
      return f.yaw >= GAZE_YAW_DEG;
    case 'up':
      return f.pitch <= -PITCH_UP_DEG;
    case 'down':
      return f.pitch >= PITCH_DOWN_DEG;
    case 'blink':
      return f.eyeAspect < BLINK_CLOSED_MAX;
    case 'smile':
      return f.smileAspect >= SMILE_MIN;
    case 'open_mouth':
      return f.mouthAspect >= MOUTH_OPEN_MIN;
    default:
      return false;
  }
}

/** Cumulative end time (ms) of the whole challenge timeline. */
export function totalTimelineMs(sequence: ChallengeInstruction[]): number {
  return sequence.reduce((sum, s) => sum + s.windowMs, 0);
}

/** Which instruction (index) is active at relative time t. */
export function timelineIndex(sequence: ChallengeInstruction[], t: number): number {
  let acc = 0;
  for (let i = 0; i < sequence.length; i++) {
    acc += sequence[i].windowMs;
    if (t < acc) return i;
  }
  return sequence.length - 1;
}

/** The most-earliest instruction that has NOT yet been satisfied (UI progress). */
export function currentInstructionIndex(
  sequence: ChallengeInstruction[],
  satisfied: boolean[],
): number {
  const idx = satisfied.findIndex((s) => !s);
  return idx === -1 ? sequence.length - 1 : idx;
}

/**
 * Tracks a single instruction and reports when it is satisfied. Blink is
 * special-cased: it needs a full open -> closed -> open transition.
 */
export class InstructionTracker {
  private satisfyCount = 0;
  private consecutive = 0;
  private minEye = 1;
  private maxEye = 0;
  private closedCount = 0;
  private done = false;

  constructor(
    private instruction: ChallengeInstruction,
    private samplingRate: number,
  ) {}

  get isDone(): boolean {
    return this.done;
  }

  feed(f: FrameSignals): boolean {
    if (this.done) return true;
    const action = this.instruction.type;

    if (action === 'blink') {
      this.minEye = Math.min(this.minEye, f.eyeAspect);
      this.maxEye = Math.max(this.maxEye, f.eyeAspect);
      if (f.eyeAspect < BLINK_CLOSED_MAX) this.closedCount += 1;
      const requiredClosed = Math.max(2, Math.round(sustainFrames(this.samplingRate) / 3));
      if (this.minEye < BLINK_CLOSED_MAX && this.maxEye > BLINK_OPEN_MIN && this.closedCount >= requiredClosed) {
        this.done = true;
      }
    } else {
      if (instructionSatisfied(action, f)) {
        this.consecutive += 1;
        this.satisfyCount += 1;
        if (this.consecutive >= sustainFrames(this.samplingRate)) {
          this.done = true;
        }
      } else {
        this.consecutive = 0;
      }
    }
    return this.done;
  }

  /** Rough 0-1 progress for the progress bar. */
  get progress(): number {
    const sustain = sustainFrames(this.samplingRate);
    if (this.instruction.type === 'blink') {
      const requiredClosed = Math.max(2, Math.round(sustain / 3));
      return Math.min(1, this.closedCount / requiredClosed);
    }
    return Math.min(1, this.satisfyCount / sustain);
  }

  get stats(): { minEye: number; maxEye: number; closedCount: number } {
    return { minEye: this.minEye, maxEye: this.maxEye, closedCount: this.closedCount };
  }
}
