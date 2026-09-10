import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestPostActions, uploadInterestMedia } from '@/hooks/useInterestPosts';

export interface CreateInterestPostInput {
  content: string;
  categoryId: string;
  file: File | null;
}

export interface CreateInterestPostResult {
  ok: boolean;
  error?: string;
}

/**
 * Shared publish flow for interest posts (upload media if present, then create the post).
 * Reused by every surface that hosts the CreatePostDialog so posting logic stays in one place.
 */
export function useCreateInterestPost() {
  const { user } = useAuth();
  const { createPost } = useInterestPostActions();

  return useCallback(
    async ({ content, categoryId, file }: CreateInterestPostInput): Promise<CreateInterestPostResult> => {
      try {
        let mediaUrl: string | undefined;
        let mediaType: string | undefined;

        if (file && user) {
          const uploaded = await uploadInterestMedia(file, user.id);
          if (!uploaded || !uploaded.url) {
            return {
              ok: false,
              error: uploaded?.error || 'Could not upload this file. Try again.',
            };
          }
          mediaUrl = uploaded.url;
          mediaType = uploaded.type;
        }

        await createPost.mutateAsync({ content, categoryId, mediaUrl, mediaType });
        return { ok: true };
      } catch (err) {
        const message = (err as any)?.message || "Couldn't publish this post. Try again.";
        return { ok: false, error: message };
      }
    },
    [user, createPost]
  );
}