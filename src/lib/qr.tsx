import qrcode from 'qrcode-generator';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type QrThemeId = 'paper' | 'milk' | 'mist' | 'ink' | 'nebula' | 'storm';
export type QrShapeId = 'square' | 'rounded' | 'dots' | 'diamond';
export type QrAccentId = 'none' | 'violet' | 'sky' | 'emerald' | 'amber' | 'rose';
export type QrFrameId = 'none' | 'minimal' | 'card';

export interface QrTheme {
  id: QrThemeId;
  label: string;
  background: string;
  module: string;
  quietZone: number;
  darkSurface: boolean;
}

export interface QrAccentOption {
  id: QrAccentId;
  label: string;
  light: string;
  dark: string;
}

export interface QrConfig {
  theme: QrThemeId;
  accent: QrAccentId;
  shape: QrShapeId;
  frame: QrFrameId;
}

export const QR_THEMES: QrTheme[] = [
  {
    id: 'paper',
    label: 'Paper',
    background: '#ffffff',
    module: '#111114',
    quietZone: 4,
    darkSurface: false,
  },
  {
    id: 'milk',
    label: 'Milk',
    background: '#f4f4f6',
    module: '#1a1a1e',
    quietZone: 4,
    darkSurface: false,
  },
  {
    id: 'mist',
    label: 'Mist',
    background: '#f1effb',
    module: '#1b1729',
    quietZone: 4,
    darkSurface: false,
  },
  {
    id: 'ink',
    label: 'Ink',
    background: '#0e0e11',
    module: '#f6f6f7',
    quietZone: 4,
    darkSurface: true,
  },
  {
    id: 'nebula',
    label: 'Nebula',
    background: '#171526',
    module: '#eeecfb',
    quietZone: 4,
    darkSurface: true,
  },
  {
    id: 'storm',
    label: 'Storm',
    background: '#1d1e27',
    module: '#eef0f8',
    quietZone: 4,
    darkSurface: true,
  },
];

export const QR_ACCENTS: QrAccentOption[] = [
  { id: 'none', label: 'None', light: '#111114', dark: '#f6f6f7' },
  { id: 'violet', label: 'Violet', light: '#7c3aed', dark: '#a78bfa' },
  { id: 'sky', label: 'Sky', light: '#0284c7', dark: '#60a5fa' },
  { id: 'emerald', label: 'Emerald', light: '#059669', dark: '#34d399' },
  { id: 'amber', label: 'Amber', light: '#b45309', dark: '#fbbf24' },
  { id: 'rose', label: 'Rose', light: '#e11d48', dark: '#fb7185' },
];

export const QR_SHAPES: { id: QrShapeId; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'dots', label: 'Dots' },
  { id: 'diamond', label: 'Diamond' },
];

export const QR_FRAMES: { id: QrFrameId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'card', label: 'Card' },
];

export const DEFAULT_QR_THEME: QrThemeId = 'nebula';
export const DEFAULT_QR_ACCENT: QrAccentId = 'violet';
export const DEFAULT_QR_SHAPE: QrShapeId = 'rounded';
export const DEFAULT_QR_FRAME: QrFrameId = 'minimal';

export const DEFAULT_QR_CONFIG: QrConfig = {
  theme: DEFAULT_QR_THEME,
  accent: DEFAULT_QR_ACCENT,
  shape: DEFAULT_QR_SHAPE,
  frame: DEFAULT_QR_FRAME,
};

export function getTheme(id: QrThemeId): QrTheme {
  return QR_THEMES.find((t) => t.id === id) ?? QR_THEMES[4];
}

export function getAccent(id: QrAccentId): QrAccentOption {
  return QR_ACCENTS.find((a) => a.id === id) ?? QR_ACCENTS[1];
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

function finderZoneKind(
  matrix: boolean[][],
  r: number,
  c: number,
  size: number
): 'outer' | 'inner' | 'center' | null {
  const a = size - 7;
  const zones: [number, number][] = [
    [0, 0],
    [0, a],
    [a, 0],
  ];
  for (const [zr, zc] of zones) {
    if (matrix[r][c] && r >= zr && r < zr + 7 && c >= zc && c < zc + 7) {
      const fr = r - zr;
      const fc = c - zc;
      const d = Math.max(Math.abs(fr - 3), Math.abs(fc - 3));
      if (d === 3) return 'outer';
      if (d === 1) return 'inner';
      if (d === 0) return 'center';
      return null;
    }
  }
  return null;
}

function shapeNode(
  shape: QrShapeId,
  x: number,
  y: number,
  fill: string,
  key: string
): ReactNode {
  switch (shape) {
    case 'dots':
      return <circle key={key} cx={x + 0.5} cy={y + 0.5} r={0.44} fill={fill} />;
    case 'diamond':
      return (
        <rect
          key={key}
          x={x + 0.25}
          y={y + 0.25}
          width={0.5}
          height={0.5}
          rx={0.05}
          fill={fill}
          transform={`rotate(45 ${x + 0.5} ${y + 0.5})`}
        />
      );
    case 'rounded':
      return <rect key={key} x={x} y={y} width={1} height={1} rx={0.4} fill={fill} />;
    default:
      return <rect key={key} x={x} y={y} width={1} height={1} fill={fill} />;
  }
}

export function renderQrSvg(
  matrix: boolean[][],
  config: QrConfig,
  className?: string
): ReactElement {
  const size = matrix.length;
  const theme = getTheme(config.theme);
  const quiet = theme.quietZone;
  const total = size + quiet * 2;
  const accent = config.accent === 'none' ? null : getAccent(config.accent);
  const accentFill = accent ? (theme.darkSurface ? accent.dark : accent.light) : null;

  const nodes: ReactNode[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      const kind = finderZoneKind(matrix, r, c, size);
      const fill =
        accentFill && kind === 'outer' ? accentFill : theme.module;
      nodes.push(shapeNode(config.shape, c + quiet, r + quiet, fill, `${r}-${c}`));
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={cn('h-auto w-full', className)}
      shapeRendering={config.shape === 'square' ? 'crispEdges' : 'geometricPrecision'}
      aria-hidden="true"
      focusable="false"
    >
      <rect x={0} y={0} width={total} height={total} fill={theme.background} />
      <g>{nodes}</g>
    </svg>
  );
}

export function downloadQrMatrix(
  matrix: boolean[][],
  config: QrConfig,
  username: string
): HTMLCanvasElement | null {
  const size = matrix.length;
  const theme = getTheme(config.theme);
  const quiet = theme.quietZone;
  const scale = 18;
  const total = size + quiet * 2;
  const footerH = 104;
  const accent = config.accent === 'none' ? null : getAccent(config.accent);
  const accentFill = accent ? (theme.darkSurface ? accent.dark : accent.light) : null;

  const canvas = document.createElement('canvas');
  canvas.width = total * scale;
  canvas.height = total * scale + footerH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const m = scale;
  const radius = m * 0.4;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      const kind = finderZoneKind(matrix, r, c, size);
      const fill =
        accentFill && kind === 'outer' ? accentFill : theme.module;
      ctx.fillStyle = fill;
      const x = (c + quiet) * scale;
      const y = (r + quiet) * scale;
      switch (config.shape) {
        case 'dots': {
          ctx.beginPath();
          ctx.arc(x + m / 2, y + m / 2, m * 0.44, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'diamond': {
          ctx.save();
          ctx.translate(x + m / 2, y + m / 2);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-m * 0.25, -m * 0.25, m * 0.5, m * 0.5);
          ctx.restore();
          break;
        }
        case 'rounded': {
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, m, m, radius);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, m, m);
          }
          break;
        }
        default: {
          ctx.fillRect(x, y, m, m);
        }
      }
    }
  }

  const footerY = total * scale;
  const midX = canvas.width / 2;

  ctx.fillStyle = theme.darkSurface ? 'rgba(255,255,255,0.9)' : '#17171c';
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`@${username}`, midX, footerY + 42);

  ctx.fillStyle = accentFill
    ? accentFill
    : (theme.darkSurface ? 'rgba(255,255,255,0.45)' : 'rgba(23,23,28,0.45)');
  ctx.font = '700 19px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TWIBSERS', midX, footerY + 76);

  return canvas;
}