export interface FilterPreset {
  id: string;
  name: string;
  css: string;
  accent: string;
  vignette?: number;
  grain?: number;
}

export interface CapturedMeta {
  kind: 'image' | 'video';
  duration?: number;
  filter: FilterPreset;
  intensity: number;
}

export const FILTERS: FilterPreset[] = [
  { id: 'original', name: 'Original', css: '', accent: '#ffffff' },
  { id: 'portra', name: 'Portra', css: 'sepia(0.18) saturate(0.95) contrast(0.95) brightness(1.05)', accent: '#e0b48a', vignette: 0.12, grain: 0.1 },
  { id: 'film', name: 'Film', css: 'sepia(0.12) contrast(1.1) brightness(1.03) saturate(0.9)', accent: '#c8b390', vignette: 0.2, grain: 0.22 },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.3) saturate(0.7) brightness(1.12) contrast(0.85)', accent: '#d9b48c', vignette: 0.25, grain: 0.28 },
  { id: 'retro', name: 'Retro', css: 'sepia(0.45) saturate(1.1) brightness(1.05) contrast(0.9) hue-rotate(-15deg)', accent: '#d89a5e', vignette: 0.22, grain: 0.25 },
  { id: 'golden', name: 'Golden', css: 'sepia(0.35) saturate(1.15) brightness(1.1) contrast(0.95)', accent: '#e8a54f', vignette: 0.15, grain: 0.08 },
  { id: 'dawn', name: 'Dawn', css: 'sepia(0.25) saturate(1.1) brightness(1.15) contrast(0.9) hue-rotate(-30deg)', accent: '#f6a78b', vignette: 0.12, grain: 0.1 },
  { id: 'rose', name: 'Rose', css: 'sepia(0.2) saturate(1.2) brightness(1.08) hue-rotate(-20deg) contrast(0.95)', accent: '#e899a8', vignette: 0.18, grain: 0.1 },
  { id: 'lilac', name: 'Lilac', css: 'sepia(0.12) saturate(1.15) brightness(1.1) contrast(0.92) hue-rotate(35deg)', accent: '#b39ddb', vignette: 0.12, grain: 0.08 },
  { id: 'dusk', name: 'Dusk', css: 'sepia(0.15) saturate(1.1) brightness(0.95) hue-rotate(30deg) contrast(1.05)', accent: '#8b7bb8', vignette: 0.25, grain: 0.12 },
  { id: 'tokyo', name: 'Tokyo', css: 'saturate(1.35) contrast(1.08) brightness(1.06) hue-rotate(-15deg)', accent: '#f472b6', vignette: 0.1, grain: 0.1 },
  { id: 'neon', name: 'Neon', css: 'saturate(1.6) contrast(1.15) brightness(1.05)', accent: '#22d3ee', vignette: 0.12, grain: 0.1 },
  { id: 'cinematic', name: 'Cinematic', css: 'sepia(0.25) saturate(1.15) contrast(1.12) brightness(0.97) hue-rotate(-10deg)', accent: '#b9a25f', vignette: 0.3, grain: 0.15 },
  { id: 'velvet', name: 'Velvet', css: 'sepia(0.25) saturate(1.3) contrast(1.1) brightness(0.95) hue-rotate(-25deg)', accent: '#c0587a', vignette: 0.32, grain: 0.12 },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.2) brightness(1.03)', accent: '#9aa0a6', grain: 0.2, vignette: 0.22 },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.55) brightness(0.92)', accent: '#6f7479', vignette: 0.32, grain: 0.18 },
  { id: 'graphite', name: 'Graphite', css: 'grayscale(0.9) contrast(1.05) brightness(1.1)', accent: '#a3a8ad', vignette: 0.18, grain: 0.22 },
  { id: 'haze', name: 'Haze', css: 'brightness(1.15) contrast(0.85) saturate(1.05) blur(0.5px)', accent: '#cfc6e8', vignette: 0.1, grain: 0.12 },
  { id: 'chill', name: 'Chill', css: 'sepia(0.1) saturate(0.95) brightness(1.05) hue-rotate(20deg)', accent: '#7aa2c9', vignette: 0.12, grain: 0.1 },
  { id: 'summer', name: 'Summer', css: 'saturate(1.3) brightness(1.12) contrast(0.95) sepia(0.12)', accent: '#fbbf24', vignette: 0.08, grain: 0.05 },
  { id: 'fresh', name: 'Fresh', css: 'saturate(1.2) contrast(1.08) brightness(1.05)', accent: '#4ade80', vignette: 0.05, grain: 0.05 },
  { id: 'studio', name: 'Studio', css: 'contrast(0.98) brightness(1.08) saturate(0.95)', accent: '#cbd5e1', vignette: 0.08, grain: 0.06 },
];

export function getFilter(id: string): FilterPreset {
  return FILTERS.find((f) => f.id === id) || FILTERS[0];
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

export function canvasToFile(canvas: HTMLCanvasElement, fileName: string, quality = 0.92): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], fileName, { type: blob.type }));
    }, 'image/jpeg', quality);
  });
}

let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = 116 + Math.floor(Math.random() * 28);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  grainTile = canvas;
  return canvas;
}

export function applyFilmEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: FilterPreset,
  intensity: number,
) {
  const amount = Math.min(Math.max(intensity, 0), 1);
  if (filter.vignette && filter.vignette > 0) {
    const strength = 0.55 * filter.vignette * amount;
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  if (filter.grain && filter.grain > 0) {
    const alpha = 0.16 * filter.grain * amount;
    if (alpha > 0.004) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const pattern = ctx.createPattern(getGrainTile(), 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    }
  }
}

export function drawWithIntensity(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  filter: FilterPreset,
  intensity: number,
) {
  draw(ctx);
  if (filter.id !== 'original' && intensity > 0 && filter.css) {
    ctx.globalAlpha = Math.min(Math.max(intensity, 0), 1);
    ctx.filter = filter.css;
    draw(ctx);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
  applyFilmEffects(ctx, width, height, filter, intensity);
}

export async function bakeImageWithFilter(
  file: File,
  filter: FilterPreset,
  intensity: number,
): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    drawWithIntensity(ctx, img.naturalWidth, img.naturalHeight, (c) => c.drawImage(img, 0, 0), filter, intensity);
    const out = await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '.jpg'));
    return out || file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function videoFrameToDataURL(
  file: File,
  timeSec = 0.25,
  width = 128,
  height = 224,
): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(timeSec, video.duration || 1);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

export function pickMediaRecorderMimeType(): string | null {
  const candidates = [
    'video/mp4',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function videoFromBlob(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load video'));
  });
}

interface ExtractedAudio {
  track: MediaStreamTrack;
  close: () => void;
}

async function extractAudioTrack(file: File): Promise<ExtractedAudio | null> {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
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

export interface BakeProgress {
  fraction: number;
}

export async function bakeVideoWithFilter(
  file: File,
  filter: FilterPreset,
  intensity: number,
  onProgress?: (progress: BakeProgress) => void,
): Promise<File | null> {
  if (filter.id === 'original') return file;

  const mimeType = pickMediaRecorderMimeType();
  if (!mimeType) return file;

  const video = await videoFromBlob(file);
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return file;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  const stream = canvas.captureStream(30);
  const audioTrack = await extractAudioTrack(file);
  if (audioTrack) stream.addTrack(audioTrack.track);

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<File | null>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      resolve(new File([blob], `filtered-${Date.now()}.${ext}`, { type: mimeType }));
    };
  });

  video.play().catch(() => {});
  recorder.start(250);
  onProgress?.({ fraction: 0 });

  const duration = video.duration || 1;
  const drawFrame = () => {
    if (video.readyState >= 2) {
      drawWithIntensity(ctx, width, height, (c) => c.drawImage(video, 0, 0, width, height), filter, intensity);
    }
  };

  const fps = 30;
  const interval = setInterval(drawFrame, 1000 / fps);
  const timer = setInterval(() => {
    if (video.ended || video.currentTime >= duration - 0.05) {
      onProgress?.({ fraction: 1 });
      clearInterval(interval);
      clearInterval(timer);
      if (recorder.state !== 'inactive') recorder.stop();
    } else {
      const f = Math.min(video.currentTime / duration, 1);
      onProgress?.({ fraction: f });
    }
  }, 120);

  const result = await done;
  URL.revokeObjectURL(video.currentSrc);
  video.src = '';
  audioTrack?.close();
  stream.getTracks().forEach((t) => t.stop());
  return result;
}
