import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { CustomBackground } from '@/lib/chatWallpapers';

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const THUMB_WIDTH = 480;

/**
 * Typed facade for the `custom_backgrounds` table. The generated Supabase types
 * do not yet know this table, so we keep a minimal contract here instead of
 * loosening the whole client.
 */
type TableResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};
type MutateResult = { error: { message?: string } | null };
interface WallpaperTableClient {
  select: () => {
    eq: (column: string, value: string) => {
      order: (column: string, opts: { ascending: boolean }) => Promise<TableResult>;
    };
  };
  insert: (row: Record<string, unknown>) => Promise<MutateResult>;
  delete: () => { eq: (column: string, value: string) => Promise<MutateResult> };
}

function wallpapersTable(): WallpaperTableClient {
  return (supabase.from as unknown as (table: string) => WallpaperTableClient)('custom_backgrounds');
}

function publicUrl(path: string): string {
  return supabase.storage.from('wallpapers').getPublicUrl(path).data.publicUrl;
}

/**
 * Downscale an image to a lightweight JPEG thumb for the selector grid.
 * Uses the browser's decoder, so it works for JPEG/PNG/WebP.
 */
async function makeThumb(file: File): Promise<{ data: Blob; width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
    );
    if (!blob) return null;
    return { data: blob, width: originalWidth, height: originalHeight };
  } catch {
    return null;
  }
}

export function useCustomBackgrounds() {
  const { user } = useAuth();
  const [items, setItems] = useState<CustomBackground[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      if (mountedRef.current) setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await wallpapersTable()
      .select()
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && mountedRef.current) {
      setItems((data || []) as unknown as CustomBackground[]);
    }
    if (mountedRef.current) setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Upload a user wallpaper and register it in the ownership table.
   * Returns the public URL to store on the conversation, or null on failure.
   */
  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG or WebP).');
      if (file.size > MAX_FILE_SIZE) throw new Error('Maximum file size is 8 MB.');

      setUploading(true);
      try {
        const stamp = Date.now();
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const storagePath = `${user.id}/wallpapers/${stamp}.${ext}`;
        const thumbPath = `${user.id}/wallpapers/${stamp}-thumb.jpg`;

        // Original, preserved as uploaded.
        const { error: originalError } = await supabase.storage
          .from('wallpapers')
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });
        if (originalError) throw originalError;

        // Lightweight thumb for the selector grid (best effort).
        let thumbUploadError: { message: string } | null = null;
        const thumb = await makeThumb(file);
        if (thumb) {
          const { error } = await supabase.storage
            .from('wallpapers')
            .upload(thumbPath, thumb.data, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
          thumbUploadError = error;
        }

        const url = publicUrl(storagePath);
        const { error: insertError } = await wallpapersTable().insert({
          user_id: user.id,
          url,
          storage_path: storagePath,
          thumb_path: thumbUploadError ? null : thumbPath,
          mime: file.type,
          file_size: file.size,
          width: thumb?.width ?? null,
          height: thumb?.height ?? null,
        });
        if (insertError) throw insertError;

        await refresh();
        return url;
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    },
    [user, refresh]
  );

  /** Delete an owned custom background and drop it from any of the user's chats. */
  const remove = useCallback(
    async (item: CustomBackground): Promise<boolean> => {
      if (!user || item.user_id !== user.id) return false;
      try {
        if (item.url) {
          const rpc = supabase.rpc as unknown as (
            fn: 'remove_conversation_wallpaper_by_url',
            params: { wallpaper_url: string }
          ) => Promise<{ error: { message?: string } | null }>;
          await rpc('remove_conversation_wallpaper_by_url', { wallpaper_url: item.url });
        }
        const { error: delError } = await wallpapersTable().delete().eq('id', item.id);
        if (delError) throw delError;
        const paths = [item.storage_path, item.thumb_path].filter(Boolean) as string[];
        if (paths.length > 0) {
          await supabase.storage.from('wallpapers').remove(paths).catch(() => {});
        }
        await refresh();
        return true;
      } catch (err) {
        console.error('[CustomBackgrounds] Failed to delete wallpaper:', err);
        return false;
      }
    },
    [user, refresh]
  );

  return { items, loading, uploading, upload, remove, refresh };
}