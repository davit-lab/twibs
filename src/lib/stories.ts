// Shared model + media helpers for Twibsers Stories.
//
// Everything a story needs on top of its raw media (text, stickers, drawings,
// filter) is stored as a normalized `overlays` JSON array on the story row and
// rendered client-side so the exact thing a creator sees is what viewers see —
// the uploaded media itself is never re-encoded for overlays.

import { FILTERS, FilterPreset } from '@/lib/media-filters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STORY_MAX_DURATION = 15; // seconds, enforced at upload
export const STORY_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const STORY_IMAGE_DURATION = 5; // seconds an image story displays
export const STORY_DESIGN_WIDTH = 1080; // overlay coordinates are normalized to 0..1, font size is px @1080

// ---------------------------------------------------------------------------
// Overlay model
// ---------------------------------------------------------------------------

export interface StoryTextOverlay {
  id: string;
  type: 'text';
  x: number; // 0..1 (center)
  y: number; // 0..1 (center)
  text: string;
  color: string;
  background: string | null; // hex fill behind text, or null
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number; // px @1080 design width
  fontWeight: 'regular' | 'bold';
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  maxWidth: number; // 0..1
}

export interface StoryStickerOverlay {
  id: string;
  type: 'sticker';
  x: number; // 0..1 (center)
  y: number; // 0..1 (center)
  emoji: string;
  scale: number; // multiplier (base ~96px @1080)
}

export interface StoryDrawStroke {
  color: string;
  size: number; // px @1080
  points: [number, number][]; // normalized 0..1
}

export interface StoryDrawOverlay {
  id: string;
  type: 'draw';
  strokes: StoryDrawStroke[];
}

export interface StoryFilterOverlay {
  id: string;
  type: 'filter';
  preset: string; // FilterPreset.id
  intensity: number; // 0..1
}

export type StoryOverlay =
  | StoryTextOverlay
  | StoryStickerOverlay
  | StoryDrawOverlay
  | StoryFilterOverlay;

export interface StoryMusicPick {
  name: string;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function makeOverlayId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function parseOverlays(raw: unknown): StoryOverlay[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is StoryOverlay => {
    if (!item || typeof item !== 'object') return false;
    const t = (item as { type?: string }).type;
    return (
      t === 'text' ||
      t === 'sticker' ||
      t === 'draw' ||
      t === 'filter' ||
      t === 'background'
    );
  });
}

export function overlayFilter(overlays: StoryOverlay[]): StoryFilterOverlay | null {
  const candidates = overlays.filter((o): o is StoryFilterOverlay => o.type === 'filter');
  return candidates[candidates.length - 1] ?? null;
}

export function getFilterPreset(id: string): FilterPreset {
  return FILTERS.find((f) => f.id === id) || FILTERS[0];
}

export function filterCssOf(preset: string): string {
  return getFilterPreset(preset).css || 'none';
}

/** CSS to apply to the media element itself (intensity-scaled). */
export function storyMediaFilterStyle(
  overlays: StoryOverlay[],
): { filter: string | undefined; opacity: number } | undefined {
  const f = overlayFilter(overlays);
  if (!f || f.preset === 'original') return undefined;
  const preset = getFilterPreset(f.preset);
  const opacity = Math.min(Math.max(f.intensity, 0.15), 1);
  return { filter: preset.css || 'none', opacity };
}

// ---------------------------------------------------------------------------
// Text presets
// ---------------------------------------------------------------------------

export const STORY_TEXT_COLORS = [
  '#FFFFFF',
  '#0B0A10',
  '#8B5CF6',
  '#F43F5E',
  '#38BDF8',
  '#FBBF24',
  '#34D399',
  '#F472B6',
  '#F97316',
];

export type StoryFontId = StoryTextOverlay['fontFamily'];

export const STORY_FONTS: { id: StoryFontId; name: string; css: string }[] = [
  { id: 'sans', name: 'Sans', css: "'Inter', system-ui, sans-serif" },
  { id: 'serif', name: 'Serif', css: "'Georgia', 'Times New Roman', serif" },
  { id: 'mono', name: 'Mono', css: "'SFMono-Regular', Menlo, Consolas, monospace" },
];

export const STORY_EMOJI_PACK = [
  '😀', '😂', '😍', '🥳', '😎', '🤩',
  '🥺', '😭', '😮', '😢', '😤', '🤯',
  '👍', '👏', '🙏', '🔥', '✨', '⭐',
  '💜', '💖', '🌙', '☀️', '🌊', '🍕',
  '🎉', '🏆', '🎨', '📸', '⏳', '📍',
];

// ---------------------------------------------------------------------------
// Text-story backgrounds
// ---------------------------------------------------------------------------

export interface StoryBackground {
  id: string;
  name: string;
  from: string;
  to: string;
}

export const STORY_BACKGROUNDS: StoryBackground[] = [
  { id: 'ink', name: 'Ink', from: '#0b0a10', to: '#191722' },
  { id: 'violet', name: 'Violet Haze', from: '#131022', to: '#2b2346' },
  { id: 'grape', name: 'Grape', from: '#1a0f26', to: '#421f54' },
  { id: 'midnight', name: 'Midnight', from: '#060910', to: '#14203a' },
  { id: 'smoke', name: 'Smoke', from: '#141414', to: '#2b2727' },
  { id: 'deep', name: 'Deep Sea', from: '#081018', to: '#0f2b3a' },
  { id: 'wine', name: 'Wine', from: '#1d0e14', to: '#3c1a24' },
  { id: 'fern', name: 'Fern', from: '#0a1410', to: '#12301f' },
];

export const DEFAULT_BACKGROUND: StoryBackground = STORY_BACKGROUNDS[0];

/** Bakes a flat (subtly sheened) 9:16 gradient to a JPEG File. */
export function bakeStoryBackground(bg: StoryBackground): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  return new Promise((resolve, reject) => {
    if (!ctx) {
      reject(new Error('Canvas is not supported in this browser.'));
      return;
    }
    const grad = ctx.createLinearGradient(0, 0, canvas.width * 0.9, canvas.height);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sheen = ctx.createRadialGradient(540, 340, 0, 540, 340, 1500);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not render the background.'));
          return;
        }
        resolve(new File([blob], 'story-text.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  });
}

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

export interface StoryVideoMeta {
  duration: number;
  width: number;
  height: number;
}

export function getVideoMeta(file: File): Promise<StoryVideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      video.src = '';
      if (!isFinite(duration) || duration <= 0) {
        reject(new Error('Could not read this video. It may be corrupted.'));
        return;
      }
      if (!width || !height) {
        reject(new Error('Could not read this video. It may be unsupported.'));
        return;
      }
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this video. Choose another file.'));
    };
    video.src = url;
  });
}

export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function pickRecordingMime(): string | null {
  const candidates = [
    'video/mp4',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

interface ExtractedAudioLike {
  track: MediaStreamTrack;
  close: () => void;
}

/** Extracts the audio track of an audio file for piping into a canvas stream. */
async function extractAudioTrack(file: File): Promise<ExtractedAudioLike | null> {
  try {
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.start();
    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      ctx.close().catch(() => {});
      return null;
    }
    return {
      track,
      close: () => {
        source.stop();
        ctx.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

/**
 * Trims (and optionally exports) a video to the [start, end] range.
 *
 * Re-encodes in real time to a webm/mp4 via canvas capture, preserving audio
 * when the source has any. Only used when a video exceeds the story limit so
 * the user understands precisely what will be uploaded.
 */
export async function trimVideo(
  file: File,
  start: number,
  end: number,
  onProgress?: (fraction: number) => void,
): Promise<File | null> {
  const mime = pickRecordingMime();
  if (!mime) return null;

  const meta = await getVideoMeta(file);
  const from = clamp(start, 0, meta.duration);
  const to = clamp(end, from + 0.5, meta.duration);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not read this video.'));
  });

  const scale = Math.min(1, 1280 / Math.max(meta.width, meta.height));
  const width = Math.max(2, Math.round(meta.width * scale));
  const height = Math.max(2, Math.round(meta.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    video.src = '';
    URL.revokeObjectURL(url);
    return null;
  }

  const stream = canvas.captureStream(30);
  const audio = await extractAudioTrack(file);
  if (audio) stream.addTrack(audio.track);

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 4_500_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<File | null>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const ext = mime.includes('webm') ? 'webm' : 'mp4';
      resolve(new File([blob], `story-trim-${Date.now()}.${ext}`, { type: mime }));
    };
  });

  const total = to - from;
  video.currentTime = from;
  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
  });

  await video.play().catch(() => {});
  recorder.start(250);
  onProgress?.(0);

  let last = -1;
  let raf = 0;
  const tick = () => {
    if (video.ended || video.currentTime >= to - 0.03) {
      onProgress?.(1);
      cleanup();
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, width, height);
    }
    const p = clamp((video.currentTime - from) / total, 0, 1);
    if (p - last >= 0.02) {
      last = p;
      onProgress?.(p);
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  const cleanup = () => {
    window.cancelAnimationFrame(raf);
    video.pause();
    video.src = '';
    URL.revokeObjectURL(url);
    audio?.close();
    stream.getTracks().forEach((t) => t.stop());
  };

  const result = await done;
  cleanup();
  return result;
}