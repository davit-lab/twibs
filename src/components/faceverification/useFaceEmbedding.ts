// Extracts a 128-d FaceRecognitionNet embedding from a video/canvas frame
// using @vladmandic/face-api. This produces the "probe" descriptor that is
// uploaded (once, in memory) for the server to compare against the stored
// administrator template. Templates are never kept on the client.

import { useCallback, useRef, useState } from 'react';

const MODEL_URL = '/models';

export function useFaceEmbedding() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  const load = useCallback(() => {
    if (loadedRef.current || loadingRef.current) return;
    loadingRef.current = true;
    (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api');
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        loadedRef.current = true;
        setReady(true);
      } catch {
        setError('Face recognition model failed to load.');
      }
    })();
  }, []);

  const extractEmbedding = useCallback(
    async (source: HTMLVideoElement | HTMLCanvasElement): Promise<number[] | null> => {
      if (!loadedRef.current) return null;
      try {
        const faceapi = await import('@vladmandic/face-api');
        const detection = await faceapi
          .detectSingleFace(
            source,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }),
          )
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (!detection?.descriptor) return null;
        return Array.from(detection.descriptor);
      } catch {
        return null;
      }
    },
    [],
  );

  return { ready, error, load, extractEmbedding };
}
