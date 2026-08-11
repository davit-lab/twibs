// Camera acquisition + the <video> element with a selfie-mirrored preview.
// CameraView is a pure presentational shell; useCamera owns the media stream
// lifecycle so the parent can react to permission results and errors.

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type CameraStatus = 'starting' | 'streaming' | 'denied' | 'error';

const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 },
  },
};

export function useCamera(videoRef: React.MutableRefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>('starting');
  const streamRef = useRef<MediaStream | null>(null);
  const videoRefForSrc = videoRef;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = stream;
      const video = videoRefForSrc.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('streaming');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
    }
  }, [stop, videoRefForSrc]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { status, start, stop };
}

interface CameraViewProps {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  children?: ReactNode;
  className?: string;
}

export default function CameraView({ videoRef, children, className }: CameraViewProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-black', className)}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover -scale-x-100"
        data-testid="face-camera-preview"
      />
      {children}
    </div>
  );
}
