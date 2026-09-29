export type MediaType = 'image' | 'video';
export type MediaSource = 'upload' | 'gif' | 'camera';
export type UploadState = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'retrying';

export interface MediaItem {
  id: string;
  file: File | null;
  localPreviewUrl: string;
  type: MediaType;
  source: MediaSource;
  uploadState: UploadState;
  uploadProgress: number;
  remoteUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  fileSize: number | null;
  order: number;
  error: string | null;
}

export interface UploadedMediaItem {
  id: string;
  url: string;
  type: MediaType;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  position: number;
}

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
}

export const MAX_MEDIA_COUNT = 22;
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

export function validateMediaFile(file: File): MediaValidationResult {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (!isImage && !isVideo) {
    return { valid: false, error: 'Only images and videos are supported.' };
  }

  if (isImage && !SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Unsupported image format. Use JPEG, PNG, GIF, or WebP.' };
  }

  if (isVideo && !SUPPORTED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: 'Unsupported video format. Use MP4 or WebM.' };
  }

  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    const maxSizeMB = isVideo ? 25 : 10;
    return { valid: false, error: `File is too large. Maximum size is ${maxSizeMB}MB.` };
  }

  return { valid: true };
}

export function createMediaItem(file: File, source: MediaSource = 'upload'): MediaItem {
  const isVideo = file.type.startsWith('video/');
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    localPreviewUrl: URL.createObjectURL(file),
    type: isVideo ? 'video' : 'image',
    source,
    uploadState: 'pending',
    uploadProgress: 0,
    remoteUrl: null,
    width: null,
    height: null,
    mimeType: file.type,
    fileSize: file.size,
    order: 0,
    error: null,
  };
}

export function revokeMediaPreview(item: MediaItem) {
  if ((item.source === 'upload' || item.source === 'camera') && item.localPreviewUrl) {
    URL.revokeObjectURL(item.localPreviewUrl);
  }
}

export function getMediaDimensions(file: File, type: MediaType): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const finish = (dimensions: { width: number | null; height: number | null }) => {
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    if (type === 'image') {
      const img = new Image();
      img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => finish({ width: null, height: null });
      img.src = objectUrl;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => finish({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => finish({ width: null, height: null });
      video.src = objectUrl;
    }
  });
}
