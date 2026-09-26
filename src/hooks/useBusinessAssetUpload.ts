import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const AVATAR_BUCKET = 'avatars';
const COVER_BUCKET = 'covers';

export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Aliases so call sites read as intent rather than as the hook's internals. */
export const MAX_AVATAR_BYTES = MAX_BYTES;
export const ALLOWED_AVATAR_TYPES = ALLOWED;

export type BusinessAssetKind = 'avatar' | 'cover';

export interface BusinessAssetInput {
  kind: BusinessAssetKind;
  file: File;
  /** Id of the advertiser_accounts row that owns the asset. */
  businessId: string;
  /** Optional cropper output; already validated by the caller. */
  blob?: Blob;
}

export const extensionFor = (mime: string, fallback: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || fallback;
};

/**
 * Uploads business avatar/cover assets to a business-scoped Storage folder
 * (`<business_id>/...`) and returns the public URL.
 *
 * Authorisation is enforced by the `can_manage_asset_folder` RLS helper: a
 * business folder is writable only by that business's owners/admins, and a
 * personal folder only by its owner. Path layout therefore encodes *who may
 * write*, not merely *where* the bytes go.
 */
export function useBusinessAssetUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<BusinessAssetKind | null>(null);

  const upload = useCallback(
    async ({ kind, file, businessId, blob }: BusinessAssetInput): Promise<string> => {
      if (!user) throw new Error('You must be signed in to upload business media.');
      if (!businessId) throw new Error('Missing business id for upload.');

      const bucket = kind === 'avatar' ? AVATAR_BUCKET : COVER_BUCKET;
      const source = blob ?? file;
      if (!ALLOWED.includes(source.type)) {
        throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
      }
      if (source.size > MAX_BYTES) {
        throw new Error('Images must be 10MB or smaller.');
      }

      setUploading(kind);
      try {
        const ext = extensionFor(source.type, 'jpg');
        const path = `${businessId}/business-${kind}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, source, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
      } finally {
        setUploading(null);
      }
    },
    [user]
  );

  /**
   * Removes a previously uploaded business asset. The path is derived from the
   * public URL, and deletion is still gated by the same RLS helper, so this is
   * a no-op (with an error) for folders the caller cannot write.
   */
  const remove = useCallback(
    async (publicUrl: string | null | undefined, kind: BusinessAssetKind) => {
      if (!publicUrl) return;
      const bucket = kind === 'avatar' ? AVATAR_BUCKET : COVER_BUCKET;
      const marker = `/object/public/${bucket}/`;
      const idx = publicUrl.indexOf(marker);
      if (idx === -1) return; // Not one of ours (e.g. legacy external URL) — leave it alone.
      const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
      if (!path) return;
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) throw error;
    },
    []
  );

  return { upload, remove, uploading };
}
