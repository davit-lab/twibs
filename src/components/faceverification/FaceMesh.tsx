// Draws the real 478-point MediaPipe face mesh on a canvas overlay so the
// admin can see exactly what the liveness pipeline is tracking. Both the video
// preview and this canvas are mirrored with the same CSS transform, so the
// overlay stays aligned with the selfie view.
//
// The mesh is read from a ref (updated every camera frame) so this component
// never triggers a React re-render per frame — it just redraws on rAF.

import { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  z: number;
}

interface FaceMeshProps {
  /** Ref holding the mesh of the primary face (normalized 0-1 coords). */
  meshRef: React.MutableRefObject<Point[][] | null>;
  /** Whether the draw loop is running. */
  active?: boolean;
  /** Stroke color of the mesh points. */
  color?: string;
}

/** Map a normalized landmark coordinate to canvas px given object-fit: cover. */
function projectToCover(
  nx: number,
  ny: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const videoAspect = videoW / videoH;
  const canvasAspect = canvasW / canvasH;
  const scale = videoAspect > canvasAspect ? canvasW / videoW : canvasH / videoH;
  const dw = videoW * scale;
  const dh = videoH * scale;
  const offsetX = (canvasW - dw) / 2;
  const offsetY = (canvasH - dh) / 2;
  return { x: offsetX + nx * dw, y: offsetY + ny * dh };
}

export default function FaceMesh({ meshRef, active = true, color = 'rgba(56, 189, 248, 0.9)' }: FaceMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const host = canvas.parentElement;
    const resize = () => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (host) ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { width: cw, height: ch } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, cw, ch);

      const video = canvas.closest('[data-camera-root]')?.querySelector('video') as HTMLVideoElement | null;
      const faces = meshRef.current ?? [];
      if (faces.length === 0 || !video || video.videoWidth === 0 || cw === 0 || ch === 0) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const face = faces[0];
      if (!face || face.length < 300) return;

      ctx.fillStyle = color;
      for (const p of face) {
        const { x, y } = projectToCover(p.x, p.y, vw, vh, cw, ch);
        if (x < -2 || y < -2 || x > cw + 2 || y > ch + 2) continue;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, meshRef, color]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
      aria-hidden
      data-testid="face-mesh-overlay"
    />
  );
}
