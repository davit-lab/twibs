import { describe, it, expect } from 'vitest';
import {
  sustainFrames,
  instructionSatisfied,
  totalTimelineMs,
  timelineIndex,
  InstructionTracker,
  type ChallengeInstruction,
  type FrameSignals,
} from './faceLiveness';
import { extractFaceMetrics, INDICES, type LandmarkLike } from '@/components/faceverification/faceGeometry';

const FIVE_HZ = 5;

function centeredSignals(overrides: Partial<FrameSignals> = {}): FrameSignals {
  return {
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeAspect: 0.9,
    mouthAspect: 0.1,
    smileAspect: 0.1,
    faceSize: 0.4,
    x: 0.5,
    y: 0.5,
    quality: 0.9,
    ...overrides,
  };
}

describe('sustainFrames', () => {
  it('requires ~1.4s of hold at the reported sampling rate', () => {
    expect(sustainFrames(FIVE_HZ)).toBe(7);
    expect(sustainFrames(10)).toBe(14);
    expect(sustainFrames(2)).toBe(3);
    expect(sustainFrames(1)).toBe(2);
  });
});

describe('instructionSatisfied (client mirror of server thresholds)', () => {
  it('center requires yaw/pitch/roll all within tolerance', () => {
    expect(instructionSatisfied('center', centeredSignals())).toBe(true);
    expect(instructionSatisfied('center', centeredSignals({ yaw: 13.9 }))).toBe(true);
    expect(instructionSatisfied('center', centeredSignals({ yaw: 14.1 }))).toBe(false);
    expect(instructionSatisfied('center', centeredSignals({ pitch: -11.9 }))).toBe(true);
    expect(instructionSatisfied('center', centeredSignals({ roll: 10.1 }))).toBe(false);
  });

  it('left/right require strong yaw', () => {
    expect(instructionSatisfied('left', centeredSignals({ yaw: -18 }))).toBe(true);
    expect(instructionSatisfied('left', centeredSignals({ yaw: -17 }))).toBe(false);
    expect(instructionSatisfied('right', centeredSignals({ yaw: 18 }))).toBe(true);
    expect(instructionSatisfied('right', centeredSignals({ yaw: 17 }))).toBe(false);
  });

  it('up/down require strong pitch', () => {
    expect(instructionSatisfied('up', centeredSignals({ pitch: -14 }))).toBe(true);
    expect(instructionSatisfied('up', centeredSignals({ pitch: -13 }))).toBe(false);
    expect(instructionSatisfied('down', centeredSignals({ pitch: 14 }))).toBe(true);
  });

  it('micro expressions need real movement', () => {
    expect(instructionSatisfied('smile', centeredSignals({ smileAspect: 0.28 }))).toBe(true);
    expect(instructionSatisfied('smile', centeredSignals({ smileAspect: 0.1 }))).toBe(false);
    expect(instructionSatisfied('open_mouth', centeredSignals({ mouthAspect: 0.32 }))).toBe(true);
    expect(instructionSatisfied('open_mouth', centeredSignals({ mouthAspect: 0.2 }))).toBe(false);
    expect(instructionSatisfied('blink', centeredSignals({ eyeAspect: 0.2 }))).toBe(true);
    expect(instructionSatisfied('blink', centeredSignals({ eyeAspect: 0.5 }))).toBe(false);
  });
});

describe('challenge timeline', () => {
  const seq: ChallengeInstruction[] = [
    { type: 'center', label: 'Look at the camera', windowMs: 2800 },
    { type: 'left', label: 'Turn your head left', windowMs: 3200 },
    { type: 'blink', label: 'Blink twice', windowMs: 4200 },
  ];

  it('computes total duration from windows', () => {
    expect(totalTimelineMs(seq)).toBe(2800 + 3200 + 4200);
  });

  it('maps relative time to the active instruction', () => {
    expect(timelineIndex(seq, 0)).toBe(0);
    expect(timelineIndex(seq, 2799)).toBe(0);
    expect(timelineIndex(seq, 2800)).toBe(1);
    expect(timelineIndex(seq, 5999)).toBe(1);
    expect(timelineIndex(seq, 6000)).toBe(2);
    expect(timelineIndex(seq, 99999)).toBe(2);
  });
});

describe('InstructionTracker', () => {
  it('satisfies center after enough consecutive centered frames', () => {
    const t = new InstructionTracker({ type: 'center', label: '', windowMs: 1000 }, FIVE_HZ);
    for (let i = 0; i < 7; i++) t.feed(centeredSignals());
    expect(t.isDone).toBe(true);
  });

  it('resets consecutive progress when the face drifts off-center', () => {
    const t = new InstructionTracker({ type: 'center', label: '', windowMs: 1000 }, FIVE_HZ);
    for (let i = 0; i < 5; i++) t.feed(centeredSignals());
    t.feed(centeredSignals({ yaw: 30 }));
    expect(t.isDone).toBe(false);
    for (let i = 0; i < 7; i++) t.feed(centeredSignals());
    expect(t.isDone).toBe(true);
  });

  it('satisfies blink after an open -> closed -> open transition', () => {
    const t = new InstructionTracker({ type: 'blink', label: '', windowMs: 1000 }, FIVE_HZ);
    t.feed(centeredSignals()); // open
    t.feed(centeredSignals({ eyeAspect: 0.1 })); // closed
    t.feed(centeredSignals({ eyeAspect: 0.15 })); // closed again
    t.feed(centeredSignals()); // open again
    expect(t.stats.minEye).toBeLessThan(0.24);
    expect(t.stats.maxEye).toBeGreaterThan(0.42);
    expect(t.isDone).toBe(true);
  });

  it('does not satisfy blink without a full closure', () => {
    const t = new InstructionTracker({ type: 'blink', label: '', windowMs: 1000 }, FIVE_HZ);
    t.feed(centeredSignals());
    t.feed(centeredSignals({ eyeAspect: 0.3 }));
    t.feed(centeredSignals({ eyeAspect: 0.25 }));
    expect(t.isDone).toBe(false);
  });
});

describe('extractFaceMetrics', () => {
  function makeMesh(noseOffsetX = 0, noseOffsetY = 0): LandmarkLike[] {
    const pts: LandmarkLike[] = [];
    for (let i = 0; i < 478; i++) pts.push({ x: 0.5, y: 0.5, z: 0 });
    pts[INDICES.LEFT_EYE_OUTER] = { x: 0.42, y: 0.45, z: 0 };
    pts[INDICES.RIGHT_EYE_OUTER] = { x: 0.58, y: 0.45, z: 0 };
    pts[INDICES.NOSE_TIP] = { x: 0.5 + noseOffsetX, y: 0.55 + noseOffsetY, z: 0 };
    pts[INDICES.MOUTH_LEFT] = { x: 0.45, y: 0.6, z: 0 };
    pts[INDICES.MOUTH_RIGHT] = { x: 0.55, y: 0.6, z: 0 };
    pts[INDICES.UPPER_LIP] = { x: 0.5, y: 0.58, z: 0 };
    pts[INDICES.LOWER_LIP] = { x: 0.5, y: 0.62, z: 0 };
    const eye = (id: number, x: number, y: number) => {
      pts[id] = { x, y, z: 0 };
    };
    // left eye
    eye(160, 0.44, 0.45);
    eye(158, 0.445, 0.46);
    eye(153, 0.455, 0.46);
    eye(144, 0.44, 0.46);
    eye(33, 0.42, 0.45);
    eye(133, 0.45, 0.45);
    // right eye
    eye(385, 0.56, 0.45);
    eye(387, 0.555, 0.46);
    eye(373, 0.545, 0.46);
    eye(380, 0.56, 0.46);
    eye(362, 0.55, 0.45);
    eye(263, 0.58, 0.45);
    return pts;
  }

  it('yields a near-zero yaw for a centered face', () => {
    const m = extractFaceMetrics(makeMesh(), null, 640, 480);
    expect(m).not.toBeNull();
    expect(Math.abs(m!.yaw)).toBeLessThan(2);
  });

  it('turning the head left (nose right) drives yaw negative', () => {
    // interocular = 0.16; nose 0.09 right of center -> yaw ~= -22.5
    const m = extractFaceMetrics(makeMesh(0.09), null, 640, 480);
    expect(m).not.toBeNull();
    expect(m!.yaw).toBeLessThanOrEqual(-18);
  });
});
