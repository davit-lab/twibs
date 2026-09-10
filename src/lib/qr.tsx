import qrcode from 'qrcode-generator';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type QrStyleId = 'classic' | 'twibsers' | 'soft' | 'compact' | 'dark';
export type QrFrame = 'none' | 'minimal' | 'card';
export type QrAccent = 'neutral' | 'violet';

export interface QrStyleConfig {
  id: QrStyleId;
  label: string;
  moduleFill: string;
  background: string;
  radius: number;
  quietZone: number;
  accentFinders: boolean;
  darkSurface: boolean;
}

export const QR_STYLES: QrStyleConfig[] = [
  {
    id: 'classic',
    label: 'Classic',
    moduleFill: '#111114',
    background: '#ffffff',
    radius: 0,
    quietZone: 4,
    accentFinders: false,
    darkSurface: false,
  },
  {
    id: 'twibsers',
    label: 'Twibsers',
    moduleFill: '#111114',
    background: '#ffffff',
    radius: 0.16,
    quietZone: 4,
    accentFinders: true,
    darkSurface: false,
  },
  {
    id: 'soft',
    label: 'Soft',
    moduleFill: '#111114',
    background: '#ffffff',
    radius: 0.42,
    quietZone: 3,
    accentFinders: true,
    darkSurface: false,
  },
  {
    id: 'compact',
    label: 'Compact',
    moduleFill: '#111114',
    background: '#ffffff',
    radius: 0,
    quietZone: 2,
    accentFinders: false,
    darkSurface: false,
  },
  {
    id: 'dark',
    label: 'Dark',
    moduleFill: '#f4f4f5',
    background: '#17171c',
    radius: 0.16,
    quietZone: 4,
    accentFinders: true,
    darkSurface: true,
  },
];

export const QR_FRAMES: { id: QrFrame; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'card', label: 'Card' },
];

export const QR_ACCENTS: { id: QrAccent; label: string }[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'violet', label: 'Violet' },
];

export const DEFAULT_QR_STYLE: QrStyleId = 'twibsers';
export const DEFAULT_QR_FRAME: QrFrame = 'minimal';
export const DEFAULT_QR_ACCENT: QrAccent = 'violet';

const BRAND_VIOLET = '#7c3aed';
const ACCENT_VIOLET = '#8b5cf6';

export function getStyleConfig(style: QrStyleId): QrStyleConfig {
  return QR_STYLES.find((s) => s.id === style) ?? QR_STYLES[1];
}

export function buildModuleMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    matrix.push(row);
  }
  return matrix;
}

function inFinder(r: number, c: number, size: number): boolean {
  const a = size - 7;
  return (
    (r < 7 && c < 7) || (r < 7 && c >= a) || (r >= a && c < 7)
  );
}

export interface QrRender {
  config: QrStyleConfig;
  accent: QrAccent;
}

function moduleFill(render: QrRender, r: number, c: number, size: number): string {
  const { config, accent } = render;
  if (accent === 'violet' && config.accentFinders && inFinder(r, c, size)) {
    return config.darkSurface ? ACCENT_VIOLET : BRAND_VIOLET;
  }
  return config.moduleFill;
}

export function renderQrSvg(
  matrix: boolean[][],
  style: QrStyleId,
  accent: QrAccent,
  className?: string
): ReactElement {
  const size = matrix.length;
  const config = getStyleConfig(style);
  const quiet = config.quietZone;
  const total = size + quiet * 2;

  const squares: ReactNode[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const fill = moduleFill({ config, accent }, r, c, size);
        squares.push(
          <rect
            key={`${r}-${c}`}
            x={c + quiet}
            y={r + quiet}
            width={1}
            height={1}
            rx={config.radius}
            fill={fill}
          />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={cn('h-auto w-full', className)}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={0} y={0} width={total} height={total} fill={config.background} />
      <g>{squares}</g>
    </svg>
  );
}

export function downloadQrMatrix(
  matrix: boolean[][],
  style: QrStyleId,
  accent: QrAccent,
  username: string
): HTMLCanvasElement | null {
  const size = matrix.length;
  const config = getStyleConfig(style);
  const quiet = config.quietZone;
  const scale = 18;
  const moduleSize = scale;
  const total = size + quiet * 2;
  const footerH = 104;

  const canvas = document.createElement('canvas');
  canvas.width = total * scale;
  canvas.height = total * scale + footerH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = config.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const radius = config.radius * moduleSize;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      ctx.fillStyle = moduleFill({ config, accent }, r, c, size);
      const x = (c + quiet) * scale;
      const y = (r + quiet) * scale;
      if (radius > 0 && typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, moduleSize, moduleSize, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, moduleSize, moduleSize);
      }
    }
  }

  // Identity footer beneath the QR.
  const footerY = total * scale;
  const midX = canvas.width / 2;

  ctx.fillStyle = config.darkSurface ? 'rgba(244,244,245,0.85)' : '#17171c';
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`@${username}`, midX, footerY + 42);

  ctx.fillStyle = config.darkSurface ? 'rgba(244,244,245,0.4)' : 'rgba(23,23,28,0.5)';
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TWIBSERS', midX, footerY + 78);

  return canvas;
}