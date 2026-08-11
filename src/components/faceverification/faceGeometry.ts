// Pure facial-geometry math shared by the real-time liveness engine.
//
// All inputs are "landmark-like" objects ({ x, y, z, visibility }) so this
// module has zero dependencies and is unit-testable. It mirrors the landmark
// indices used by MediaPipe's 478-point FaceLandmarker.

export interface LandmarkLike {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface BlendshapeLike {
  categoryName: string;
  score: number;
}

// ---- Landmark indices (MediaPipe 478-point face mesh) ----------------------
export const INDICES = {
  NOSE_TIP: 1,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  UPPER_LIP: 13,
  LOWER_LIP: 14,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
} as const;

const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;

function dist(a: LandmarkLike, b: LandmarkLike): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ear(points: readonly number[], lm: LandmarkLike[]): number {
  const [p1, p2, p3, p4, p5, p6] = points.map((i) => lm[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const v1 = dist(p2, p6);
  const v2 = dist(p3, p5);
  const h = dist(p1, p4);
  if (h === 0) return 0;
  return (v1 + v2) / (2 * h);
}

export function blendshapeScore(bs: BlendshapeLike[] | null | undefined, name: string): number {
  if (!bs || bs.length === 0) return 0;
  for (const c of bs) {
    if (c.categoryName === name) return c.score;
  }
  return 0;
}

export interface FaceMetrics {
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

/**
 * Reduce a single face mesh (478 landmarks) + optional ARKit-style blendshapes
 * into the raw signal bundle the liveness engine consumes.
 *
 * Head pose is estimated heuristically from the nose-tip offset relative to the
 * eye baseline, scaled by the inter-ocular distance. This is deliberately
 * coarse — the server re-derives the verdict from the raw numbers, so the only
 * requirement is that a real head turn produces yaw/pitch values that actually
 * cross the liveness thresholds.
 */
export function extractFaceMetrics(
  lm: LandmarkLike[],
  blendshapes: BlendshapeLike[] | null | undefined,
  frameW = 640,
  frameH = 480,
): FaceMetrics | null {
  if (!lm || lm.length < 300) return null;

  const leftEye = lm[INDICES.LEFT_EYE_OUTER];
  const rightEye = lm[INDICES.RIGHT_EYE_OUTER];
  if (!leftEye || !rightEye) return null;

  const interOcular = dist(leftEye, rightEye);
  if (interOcular === 0) return null;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const nose = lm[INDICES.NOSE_TIP];

  // Negative yaw = nose right of the eye midline = head turned LEFT.
  // Negative pitch = nose above the eye line = head tilted UP.
  const yaw = ((eyeMidX - nose.x) / interOcular) * 40;
  const pitch = ((nose.y - eyeMidY) / interOcular) * 40;
  const roll = (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;

  const geoEye = (ear(LEFT_EYE, lm) + ear(RIGHT_EYE, lm)) / 2;
  const blink = Math.max(
    blendshapeScore(blendshapes, 'eyeBlinkLeft'),
    blendshapeScore(blendshapes, 'eyeBlinkRight'),
  );
  const eyeAspect = blink > 0.02 ? 1 - blink : geoEye;

  const mouthCorner = dist(lm[INDICES.MOUTH_LEFT], lm[INDICES.MOUTH_RIGHT]);
  const mouthOpenGeo = mouthCorner > 0 ? dist(lm[INDICES.UPPER_LIP], lm[INDICES.LOWER_LIP]) / mouthCorner : 0;
  const mouthAspect = blendshapeScore(blendshapes, 'jawOpen') || mouthOpenGeo;

  const smile = Math.max(
    blendshapeScore(blendshapes, 'mouthSmileLeft'),
    blendshapeScore(blendshapes, 'mouthSmileRight'),
  );
  const smileAspect = smile || (mouthCorner > 0 ? (lm[INDICES.UPPER_LIP].y - (lm[INDICES.MOUTH_LEFT].y + lm[INDICES.MOUTH_RIGHT].y) / 2) / mouthCorner : 0);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let visSum = 0;
  let visCount = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (typeof p.visibility === 'number') {
      visSum += p.visibility;
      visCount += 1;
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const faceSize = Math.max(width, height) / Math.max(frameW, frameH);
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const quality = visCount > 0 ? visSum / visCount : 1;

  return {
    yaw,
    pitch,
    roll,
    eyeAspect: clamp01(eyeAspect),
    mouthAspect: clamp01(mouthAspect),
    smileAspect: clamp01(smileAspect),
    faceSize: clamp01(faceSize),
    x: clamp01(x),
    y: clamp01(y),
    quality: clamp01(quality),
  };
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function bboxForMesh(lm: LandmarkLike[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
