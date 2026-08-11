// Loads the MediaPipe FaceLandmarker and drives a requestAnimationFrame loop
// that turns each camera frame into raw face signals + a landmark mesh.
//
// This hook is intentionally "dumb": it never decides anything. Every frame is
// handed to the onResult callback, and the liveness/verification decisions are
// made elsewhere (and re-made by the server).

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FaceDetectionResult } from './types';
import { extractFaceMetrics } from './faceGeometry';

interface UseFaceDetectionOptions {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  enabled: boolean;
}

const WASM_URL = '/wasm';

export function useFaceDetection({ videoRef, enabled }: UseFaceDetectionOptions) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const onResultRef = useRef<((res: FaceDetectionResult | null) => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  const setOnResult = useCallback((cb: ((res: FaceDetectionResult | null) => void) | null) => {
    onResultRef.current = cb;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const create = (delegate: 'GPU' | 'CPU') =>
          FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: '/face_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numFaces: 2,
            outputFaceBlendshapes: true,
            outputFaceLandmarks: true,
          });

        let lm: FaceLandmarker;
        try {
          lm = await create('GPU');
        } catch {
          lm = await create('CPU');
        }
        if (cancelled) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch {
        if (!cancelled) setError('Face detection model failed to load.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !landmarkerRef.current) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      const cb = onResultRef.current;
      if (!lm || !video || !cb) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      try {
        const result = lm.detectForVideo(video, performance.now());
        const faces = result.faceLandmarks ?? [];
        if (faces.length === 0) {
          cb({ signals: null, mesh: [] });
          return;
        }
        const blends = result.faceBlendshapes?.[0]?.categories ?? null;
        const metrics = extractFaceMetrics(faces[0], blends, video.videoWidth, video.videoHeight);
        cb({
          signals: metrics ? { ...metrics, faceCount: faces.length } : null,
          mesh: faces.slice(0, 1),
        });
      } catch {
        // A single failed inference frame should not kill the loop.
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return stop;
  }, [enabled, ready, videoRef, stop]);

  return { ready, error, setOnResult, stop };
}
