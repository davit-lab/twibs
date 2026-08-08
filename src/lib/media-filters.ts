export interface FilterPreset {
  id: string;
  name: string;
  css: string;
  accent: string;
}

export interface CapturedMeta {
  kind: 'image' | 'video';
  duration?: number;
  filter: FilterPreset;
  intensity: number;
}

export const FILTERS: FilterPreset[] = [
  { id: 'original', name: 'Original', css: '', accent: '#ffffff' },
  { id: 'clarity', name: 'Clarity', css: 'contrast(1.12) saturate(1.12) brightness(1.02)', accent: '#6ee7b7' },
  { id: 'vesper', name: 'Vesper', css: 'contrast(1.15) saturate(1.2) brightness(0.95) sepia(0.08)', accent: '#fbbf24' },
  { id: 'elevate', name: 'Elevate', css: 'saturate(1.35) contrast(1.1) brightness(1.05)', accent: '#f472b6' },
  { id: 'sierra', name: 'Sierra', css: 'saturate(0.95) contrast(0.95) brightness(1.08) sepia(0.12)', accent: '#d6b48f' },
  { id: 'amaro', name: 'Amaro', css: 'sepia(0.2) contrast(1.15) brightness(1.05) saturate(1.15)', accent: '#c49a6c' },
  { id: 'willow', name: 'Willow', css: 'grayscale(0.5) contrast(1.25) brightness(0.98)', accent: '#9ca3af' },
  { id: 'mayfair', name: 'Mayfair', css: 'sepia(0.18) contrast(1.1) brightness(1.08) saturate(1.05)', accent: '#e8c39e' },
  { id: 'nashville', name: 'Nashville', css: 'sepia(0.25) contrast(1.05) brightness(1.1) saturate(0.85) hue-rotate(-5deg)', accent: '#f0b9a7' },
  { id: 'perpetua', name: 'Perpetua', css: 'contrast(1.1) brightness(1.05) saturate(1.1) hue-rotate(-8deg)', accent: '#a5c8e4' },
  { id: 'aden', name: 'Aden', css: 'sepia(0.1) contrast(0.9) brightness(1.05) saturate(0.8) hue-rotate(15deg)', accent: '#b8c8c5' },
  { id: 'gingham', name: 'Gingham', css: 'brightness(1.15) contrast(0.9) saturate(0.75)', accent: '#e4e0dc' },
  { id: 'ludwig', name: 'Ludwig', css: 'sepia(0.1) saturate(0.8) contrast(1.05) brightness(1.1) hue-rotate(-5deg)', accent: '#cbb9a4' },
  { id: 'ginza', name: 'Ginza', css: 'sepia(0.25) contrast(1.15) saturate(1.3) brightness(1.02) hue-rotate(-8deg)', accent: '#e0a458' },
  { id: 'skyline', name: 'Skyline', css: 'saturate(1.25) contrast(1.1) hue-rotate(-12deg) brightness(1.05)', accent: '#7aa5c9' },
  { id: 'dogpatch', name: 'Dogpatch', css: 'sepia(0.18) contrast(1.2) brightness(0.98) saturate(1.1) hue-rotate(-10deg)', accent: '#bf8f5f' },
  { id: 'moon', name: 'Moon', css: 'grayscale(0.85) contrast(1.15) brightness(1.02)', accent: '#c6c8cc' },
  { id: 'noire', name: 'Noire', css: 'grayscale(1) contrast(1.3) brightness(0.95)', accent: '#8b8f96' },
  { id: 'earlybird', name: 'Earlybird', css: 'sepia(0.3) contrast(1.05) brightness(1.12) saturate(0.9)', accent: '#e9b872' },
  { id: 'inkwell', name: 'Inkwell', css: 'grayscale(1) contrast(1.1) brightness(1.05)', accent: '#c0c4c9' },
  { id: 'crema', name: 'Crema', css: 'sepia(0.15) brightness(1.12) contrast(0.92) saturate(0.9)', accent: '#e8d6b0' },
  { id: 'slumber', name: 'Slumber', css: 'saturate(0.9) contrast(1.15) brightness(0.9) hue-rotate(20deg)', accent: '#6f88a8' },
  { id: 'helena', name: 'Helena', css: 'saturate(1.1) contrast(1.05) brightness(1.02) hue-rotate(-20deg) sepia(0.05)', accent: '#a58bb5' },
  { id: 'rise', name: 'Rise', css: 'sepia(0.2) brightness(1.1) contrast(0.98) saturate(1.05)', accent: '#ecc9a0' },
  { id: 'valencia', name: 'Valencia', css: 'sepia(0.15) contrast(1.1) brightness(1.06) saturate(1.1)', accent: '#e58a6a' },
  { id: 'xpro2', name: 'X-Pro II', css: 'sepia(0.25) contrast(1.2) brightness(1.05) saturate(1.2) hue-rotate(-5deg)', accent: '#d9634f' },
  { id: 'hudson', name: 'Hudson', css: 'saturate(1.2) contrast(1.05) brightness(1.05) hue-rotate(-18deg)', accent: '#6fb3d9' },
  { id: 'reyes', name: 'Reyes', css: 'sepia(0.2) contrast(0.95) brightness(1.1) saturate(0.8)', accent: '#d6b394' },
  { id: 'juno', name: 'Juno', css: 'sepia(0.15) saturate(1.3) contrast(1.1) hue-rotate(-10deg)', accent: '#e88bb3' },
  { id: 'lark', name: 'Lark', css: 'brightness(1.1) contrast(0.95) saturate(0.9)', accent: '#e7e0d2' },
  { id: 'maven', name: 'Maven', css: 'sepia(0.15) saturate(0.75) contrast(1.05) brightness(1.02) hue-rotate(10deg)', accent: '#a99a82' },
  { id: 'stinson', name: 'Stinson', css: 'sepia(0.25) contrast(0.9) brightness(1.12) saturate(0.85)', accent: '#d8b491' },
  { id: 'charmes', name: 'Charmes', css: 'sepia(0.1) contrast(1.15) saturate(1.3) brightness(1.05) hue-rotate(-8deg)', accent: '#e07f5a' },
  { id: 'pasadena', name: 'Pasadena', css: 'sepia(0.2) saturate(0.9) contrast(1.05) brightness(1.05) hue-rotate(35deg)', accent: '#8fae6b' },
  { id: 'kelvin', name: 'Kelvin', css: 'sepia(0.35) contrast(1.1) brightness(1.1) saturate(1.15) hue-rotate(-15deg)', accent: '#ff9c47' },
  { id: 'mister', name: 'Mister', css: 'saturate(0.9) contrast(1.02) brightness(1.02) hue-rotate(8deg)', accent: '#9aa8ad' },
  { id: 'walden', name: 'Walden', css: 'sepia(0.15) brightness(1.1) contrast(1.05) saturate(1.05) hue-rotate(-12deg)', accent: '#a5c3d8' },
  { id: 'temporal', name: 'Temporal', css: 'saturate(0.85) contrast(1.18) brightness(0.98)', accent: '#7c8aa0' },
  { id: 'prisma', name: 'Prisma', css: 'saturate(1.5) contrast(1.15) hue-rotate(15deg)', accent: '#c084fc' },
  { id: 'frost', name: 'Frost', css: 'saturate(0.7) brightness(1.12) contrast(1.05) hue-rotate(-30deg)', accent: '#9bd1e6' },
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

export function drawWithIntensity(
  ctx: CanvasRenderingContext2D,
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

    drawWithIntensity(ctx, (c) => c.drawImage(img, 0, 0), filter, intensity);
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
      drawWithIntensity(ctx, (c) => c.drawImage(video, 0, 0, width, height), filter, intensity);
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
