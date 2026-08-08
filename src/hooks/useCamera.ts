import { useCallback, useEffect, useRef, useState } from 'react';

export interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  facing: 'user' | 'environment';
  torch: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  start: (opts?: { facing?: 'user' | 'environment' }) => Promise<void>;
  stop: () => void;
  toggleFacing: () => Promise<void>;
  setTorch: (on: boolean) => Promise<void>;
  attachStream: (video: HTMLVideoElement | null) => void;
}

export function useCamera(): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [torch, setTorchState] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');

  const attachStream = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setTorchState(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async (opts?: { facing?: 'user' | 'environment' }) => {
    const targetFacing = opts?.facing || facingRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not supported on this device/browser.');
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: targetFacing,
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = mediaStream;
      facingRef.current = targetFacing;
      setFacing(targetFacing);
      setStream(mediaStream);
      setError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not access the camera. Please try again or upload a photo instead.');
      }
    }
  }, []);

  const toggleFacing = useCallback(async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    setTorchState(false);
    await start({ facing: next });
  }, [start]);

  const setTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error - torch is a non-standard constraint
      await track.applyConstraints({ advanced: [{ torch: on }] });
      setTorchState(on);
    } catch {
      // Torch unsupported on this device; ignore.
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return { stream, error, facing, torch, videoRef, start, stop, toggleFacing, setTorch, attachStream };
}
