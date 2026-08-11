// The real-time liveness engine (client side).
//
// Consumes raw per-frame signals from useFaceDetection and:
//   1. builds the raw proof (frames + counters) that is uploaded verbatim,
//   2. mirrors the server's thresholds for instant progress/feedback.
//
// The proof is labeled by the SERVER-issued challenge timeline (not by when the
// user happened to satisfy each step), so the uploaded frames line up exactly
// with what the server re-validates.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceDetectionResult, IssuedChallenge, LivenessProof } from './types';
import {
  FACE_GAP_MAX_MS,
  FACE_SIZE_MAX,
  FACE_SIZE_MIN,
  InstructionTracker,
  PROOF_SAMPLING_MS,
  currentInstructionIndex,
  sustainFrames,
  timelineIndex,
  totalTimelineMs,
} from '@/lib/security/faceLiveness';

export type LivenessPhase = 'idle' | 'active' | 'satisfied' | 'failed';

export interface LivenessStats {
  maxFaceGapMs: number;
  multiFaceFrames: number;
  minFaceSize: number;
  maxFaceSize: number;
  sampledFrames: number;
  timelineMs: number;
}

interface UseLivenessDetectionOptions {
  enabled: boolean;
  challenge: IssuedChallenge | null;
  challengeStartAtRef: React.MutableRefObject<number | null>;
}

export function useLivenessDetection({ enabled, challenge, challengeStartAtRef }: UseLivenessDetectionOptions) {
  const [phase, setPhase] = useState<LivenessPhase>('idle');
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [instructionProgress, setInstructionProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [stats, setStats] = useState<LivenessStats>({
    maxFaceGapMs: 0,
    multiFaceFrames: 0,
    minFaceSize: 1,
    maxFaceSize: 0,
    sampledFrames: 0,
    timelineMs: 0,
  });

  const stateRef = useRef({
    challenge: null as IssuedChallenge | null,
    trackers: [] as InstructionTracker[],
    satisfied: [] as boolean[],
    frames: [] as LivenessProof['frames'],
    maxFaceGapMs: 0,
    lastFaceAt: -1,
    multiFaceFrames: 0,
    minFaceSize: 1,
    maxFaceSize: 0,
    lastSampleAt: -Infinity,
    phase: 'idle' as LivenessPhase,
    failedReason: null as string | null,
    samplingRate: 5,
  });

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.challenge = null;
    s.trackers = [];
    s.satisfied = [];
    s.frames = [];
    s.maxFaceGapMs = 0;
    s.lastFaceAt = -1;
    s.multiFaceFrames = 0;
    s.minFaceSize = 1;
    s.maxFaceSize = 0;
    s.lastSampleAt = -Infinity;
    s.phase = 'idle';
    s.failedReason = null;
    s.samplingRate = 1000 / PROOF_SAMPLING_MS;
    setPhase('idle');
    setFailedReason(null);
    setActiveIndex(0);
    setInstructionProgress(0);
    setTotalProgress(0);
    setStats({
      maxFaceGapMs: 0,
      multiFaceFrames: 0,
      minFaceSize: 1,
      maxFaceSize: 0,
      sampledFrames: 0,
      timelineMs: 0,
    });
  }, []);

  // (Re)initialize the engine whenever a new challenge is bound.
  useEffect(() => {
    const s = stateRef.current;
    if (!enabled || !challenge) {
      reset();
      return;
    }
    s.challenge = challenge;
    s.trackers = challenge.sequence.map(
      (instruction) => new InstructionTracker(instruction, s.samplingRate),
    );
    s.satisfied = challenge.sequence.map(() => false);
    s.frames = [];
    s.maxFaceGapMs = 0;
    s.lastFaceAt = -1;
    s.multiFaceFrames = 0;
    s.minFaceSize = 1;
    s.maxFaceSize = 0;
    s.lastSampleAt = -Infinity;
    s.phase = 'active';
    s.failedReason = null;
    setPhase('active');
    setFailedReason(null);
    setActiveIndex(0);
    setInstructionProgress(0);
    setTotalProgress(0);
    setStats((prev) => ({ ...prev, timelineMs: totalTimelineMs(challenge.sequence) }));
  }, [enabled, challenge, reset]);

  const fail = useCallback((reason: string) => {
    const s = stateRef.current;
    if (s.phase !== 'active') return;
    s.phase = 'failed';
    s.failedReason = reason;
    setPhase('failed');
    setFailedReason(reason);
  }, []);

  const feed = useCallback(
    (res: FaceDetectionResult | null) => {
      const s = stateRef.current;
      if (s.phase !== 'active' || !s.challenge || !challengeStartAtRef.current) return;

      const seq = s.challenge.sequence;
      const totalMs = totalTimelineMs(seq);
      const now = performance.now();
      const t = now - challengeStartAtRef.current;

      // Face present?
      if (res?.signals) {
        const sig = res.signals;
        if (sig.faceCount > 1) {
          s.multiFaceFrames += 1;
        }
        s.minFaceSize = Math.min(s.minFaceSize, sig.faceSize);
        s.maxFaceSize = Math.max(s.maxFaceSize, sig.faceSize);
        s.lastFaceAt = t;

        if (t <= totalMs && t - s.lastSampleAt >= PROOF_SAMPLING_MS) {
          const action = seq[timelineIndex(seq, t)].type;
          s.frames.push({
            t: Math.round(t),
            action,
            yaw: sig.yaw,
            pitch: sig.pitch,
            roll: sig.roll,
            eyeAspect: sig.eyeAspect,
            mouthAspect: sig.mouthAspect,
            smileAspect: sig.smileAspect,
            faceSize: sig.faceSize,
            x: sig.x,
            y: sig.y,
            quality: sig.quality,
          });
          s.lastSampleAt = t;

          // Feed the tracker at the SAME cadence the proof samples (5Hz), so
          // the on-screen progress matches what the server will re-validate.
          const idx = currentInstructionIndex(seq, s.satisfied);
          const tracker = s.trackers[idx];
          if (tracker && tracker.feed(sig)) {
            s.satisfied[idx] = true;
          }
        }

        // React to anti-spoof counters immediately (server would reject these).
        if (s.multiFaceFrames > 0) {
          fail('multiple_faces');
        } else if (s.maxFaceGapMs > FACE_GAP_MAX_MS) {
          fail('face_lost');
        } else if (s.minFaceSize < FACE_SIZE_MIN || s.maxFaceSize > FACE_SIZE_MAX) {
          fail('face_size');
        }
      } else {
        if (s.lastFaceAt >= 0) {
          s.maxFaceGapMs = Math.max(s.maxFaceGapMs, t - s.lastFaceAt);
          if (s.maxFaceGapMs > FACE_GAP_MAX_MS) fail('face_lost');
        }
      }

      // UI snapshot (throttled, cheap).
      const idx = currentInstructionIndex(seq, s.satisfied);
      setActiveIndex((prev) => (prev === idx ? prev : idx));
      const ip = s.trackers[idx]?.progress ?? 0;
      setInstructionProgress((prev) => (Math.round(ip * 20) === Math.round(prev * 20) ? prev : ip));
      const doneCount = s.satisfied.filter(Boolean).length;
      const tp = doneCount / seq.length;
      setTotalProgress((prev) => (Math.round(tp * 40) === Math.round(prev * 40) ? prev : tp));

      // Completion: every instruction satisfied AND the challenge timeline fully
      // elapsed. Proof frames are labelled by the timeline, so the upload must
      // cover every instruction window — otherwise the server sees the final
      // instruction as "missing" and rejects the proof.
      if (s.phase === 'active') {
        const allDone = s.satisfied.every(Boolean);
        if (allDone && t >= totalMs) {
          s.phase = 'satisfied';
          setPhase('satisfied');
          setStats({
            maxFaceGapMs: s.maxFaceGapMs,
            multiFaceFrames: s.multiFaceFrames,
            minFaceSize: s.minFaceSize,
            maxFaceSize: s.maxFaceSize,
            sampledFrames: s.frames.length,
            timelineMs: totalMs,
          });
        }
      }
    },
    [challengeStartAtRef, fail],
  );

  const buildProof = useCallback((): LivenessProof | null => {
    const s = stateRef.current;
    if (s.phase !== 'satisfied' || !s.challenge) return null;
    return {
      challengeId: s.challenge.challengeId,
      sequence: s.challenge.sequence.map((i) => i.type),
      frames: s.frames,
      samplingRate: s.samplingRate,
      maxFaceGapMs: s.maxFaceGapMs,
      multiFaceFrames: s.multiFaceFrames,
      minFaceSize: s.minFaceSize,
      maxFaceSize: s.maxFaceSize,
    };
  }, []);

  return {
    phase,
    failedReason,
    activeIndex,
    activeInstruction: challenge?.sequence[activeIndex] ?? null,
    instructionProgress,
    totalProgress,
    stats,
    feed,
    reset,
    buildProof,
    sustainFrames,
  };
}
