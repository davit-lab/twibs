import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMediaDimensions } from '@/lib/media';
import type { MediaItem, UploadedMediaItem } from '@/lib/media';

interface MediaUploaderProps {
  mediaItems: MediaItem[];
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItem[]>>;
  userId: string;
  bucket?: 'post-media' | 'interest-media';
  onUploadComplete?: (uploaded: UploadedMediaItem[]) => void;
  onUploadError?: (error: Error) => void;
}

const MAX_CONCURRENT_UPLOADS = 3;

/** Shared upload coordinator for Feed and Interests. */
export function MediaUploader({ mediaItems, setMediaItems, userId, bucket = 'post-media', onUploadComplete, onUploadError }: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);

  const updateItem = useCallback((id: string, patch: Partial<MediaItem>) => {
    setMediaItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, [setMediaItems]);

  const uploadMedia = useCallback(async (item: MediaItem): Promise<UploadedMediaItem> => {
    if (item.remoteUrl && item.uploadState === 'uploaded') {
      return { id: item.id, url: item.remoteUrl, type: item.type, width: item.width, height: item.height, alt_text: null, position: item.order };
    }
    if (item.source === 'gif') {
      return { id: item.id, url: item.remoteUrl || item.localPreviewUrl, type: item.type, width: item.width, height: item.height, alt_text: null, position: item.order };
    }
    if (!item.file) throw new Error('The selected media file is unavailable.');

    updateItem(item.id, { uploadState: item.uploadState === 'failed' ? 'retrying' : 'uploading', uploadProgress: 10, error: null });
    try {
      const extension = item.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const fileName = `${userId}/${crypto.randomUUID()}.${extension}`;
      const signed = await supabase.storage.from(bucket).createSignedUploadUrl(fileName);
      if (!signed.error && signed.data?.token) {
        updateItem(item.id, { uploadProgress: 35 });
        const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(
          fileName,
          signed.data.token,
          item.file,
          { contentType: item.file.type, cacheControl: '31536000', upsert: false },
        );
        if (error) throw error;
      } else {
        updateItem(item.id, { uploadProgress: 35 });
        const { error } = await supabase.storage.from(bucket).upload(fileName, item.file, {
          upsert: false,
          contentType: item.file.type,
          cacheControl: '31536000',
        });
        if (error) throw error;
      }

      updateItem(item.id, { uploadProgress: 96 });
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
      const dimensions = await getMediaDimensions(item.file, item.type);
      const result: UploadedMediaItem = {
        id: item.id,
        url: publicUrl,
        type: item.type,
        width: dimensions.width,
        height: dimensions.height,
        alt_text: null,
        position: item.order,
      };
      updateItem(item.id, { uploadState: 'uploaded', uploadProgress: 100, remoteUrl: publicUrl, width: dimensions.width, height: dimensions.height, error: null });
      return result;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Upload failed');
      updateItem(item.id, { uploadState: 'failed', uploadProgress: 0, error: error.message });
      throw error;
    }
  }, [bucket, updateItem, userId]);

  const startUploads = useCallback(async (): Promise<UploadedMediaItem[]> => {
    if (!userId) throw new Error('Sign in before uploading media.');
    setIsUploading(true);
    const ordered = [...mediaItems].sort((a, b) => a.order - b.order);
    const results: Array<UploadedMediaItem | null> = new Array(ordered.length).fill(null);
    const errors: Error[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < ordered.length) {
        const index = cursor++;
        try {
          results[index] = await uploadMedia(ordered[index]);
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error('Upload failed'));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, ordered.length) }, worker));
      if (errors.length > 0) {
        const error = new Error(`${errors.length} media item${errors.length === 1 ? '' : 's'} failed to upload.`);
        onUploadError?.(error);
        throw error;
      }
      const uploaded = results.filter((item): item is UploadedMediaItem => item !== null);
      onUploadComplete?.(uploaded);
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  }, [mediaItems, onUploadComplete, onUploadError, uploadMedia, userId]);

  const retryUpload = useCallback(async (id: string) => {
    const item = mediaItems.find(candidate => candidate.id === id);
    if (!item) return null;
    setIsUploading(true);
    try {
      return await uploadMedia({ ...item, uploadState: 'failed' });
    } finally {
      setIsUploading(false);
    }
  }, [mediaItems, uploadMedia]);

  return { startUploads, retryUpload, isUploading };
}
