import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface ReelOverlay {
  type: 'poll' | 'quiz' | 'qna' | 'library';
  question?: string;
  options?: string[];
  correctIndex?: number;
  title?: string;
  subtitle?: string;
  url?: string;
}

export interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  audio_name: string | null;
  audio_url: string | null;
  duration: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  overlay?: ReelOverlay | null;
  profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  is_liked?: boolean;
}

export interface ReelComment {
  id: string;
  reel_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  is_liked?: boolean;
  profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  replies?: ReelComment[];
}

export type ReelsFeedType = 'foryou' | 'following';

export function useReels(feedType: ReelsFeedType = 'foryou') {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const queryClient = useQueryClient();

  const queryKey = ['reels', feedType, user?.id ?? null];

  const {
    data: reels = [],
    isLoading: loading,
    isFetching: refreshing,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      let followedIds: string[] = [];
      if (feedType === 'following' && user) {
        const { data: followedUsers } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'accepted');
        followedIds = followedUsers?.map(f => f.following_id) || [];
        if (followedIds.length === 0) return [] as Reel[];
      }

      let query = supabase
        .from('reels')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (feedType === 'following' && followedIds.length > 0) {
        query = query.in('user_id', followedIds);
      }

      const { data: reelsData, error: reelsError } = await query;
      if (reelsError) throw reelsError;
      if (!reelsData || reelsData.length === 0) return [] as Reel[];

      const userIds = [...new Set(reelsData.map((r: any) => r.user_id))];
      const [{ data: profiles }, { data: likesData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', userIds),
        user
          ? supabase.from('reel_likes').select('reel_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const likedSet = new Set((likesData || []).map((l: any) => l.reel_id));

      return reelsData.map((reel: any) => ({
        ...reel,
        duration: reel.duration ?? 0,
        view_count: reel.view_count ?? 0,
        like_count: reel.like_count ?? 0,
        comment_count: reel.comment_count ?? 0,
        share_count: reel.share_count ?? 0,
        is_published: reel.is_published ?? true,
        profile: profileMap.get(reel.user_id) || {
          username: 'unknown',
          display_name: 'Unknown User',
          avatar_url: null,
          is_verified: false,
        },
        is_liked: likedSet.has(reel.id),
      })) as Reel[];
    },
    staleTime: 10_000,
  });

  const likeReel = useCallback(async (reelId: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please sign in to like reels.' });
      return;
    }
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;

    try {
      if (reel.is_liked) {
        await supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', user.id);
      } else {
        await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: user.id });
      }
      await queryClient.invalidateQueries({ queryKey: ['reels'] });
    } catch (error) {
      console.error('Error liking reel:', error);
    }
  }, [user, reels, queryClient, toast]);

  const incrementView = useCallback(async (reelId: string) => {
    try {
      const { error } = await supabase.rpc('increment_reel_views' as any, { reel_id_input: reelId });
      if (error) {
        const current = reels.find(r => r.id === reelId);
        if (current) {
          await supabase.from('reels').update({ view_count: (current.view_count || 0) + 1 }).eq('id', reelId);
        }
      }
    } catch {
      // silent
    }
  }, [reels]);

  const uploadReel = async (
    file: File,
    caption: string,
    optionsOrProgress?: { audioName?: string | null; audioUrl?: string | null; duration?: number; isPublished?: boolean } | ((progress: number) => void),
    maybeProgress?: (progress: number) => void
  ) => {
    if (!user) throw new Error('Not authenticated');

    const options = typeof optionsOrProgress === 'function' ? {} : (optionsOrProgress ?? {});
    const onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : maybeProgress;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    onProgress?.(5);

    const { error: uploadError } = await supabase.storage
      .from('reels')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;
    onProgress?.(55);

    const { data: urlData } = supabase.storage.from('reels').getPublicUrl(fileName);

    let thumbnailUrl: string | null = null;
    onProgress?.(70);
    try {
      const objectUrl = URL.createObjectURL(file);
      const thumbBlob = await captureVideoThumbnail(objectUrl);
      URL.revokeObjectURL(objectUrl);
      const thumbName = `${user.id}/${Date.now()}-thumb.jpg`;
      const { error: thumbError } = await supabase.storage
        .from('reels')
        .upload(thumbName, thumbBlob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
      if (!thumbError) {
        thumbnailUrl = supabase.storage.from('reels').getPublicUrl(thumbName).data.publicUrl;
      }
    } catch (err) {
      console.error('Thumbnail generation skipped:', err);
    }

    const { data: reel, error: insertError } = await supabase
      .from('reels')
      .insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        thumbnail_url: thumbnailUrl,
        caption,
        duration: options.duration ?? 0,
        is_published: options.isPublished ?? true,
        audio_name: options.audioName ?? null,
        audio_url: options.audioUrl ?? null,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    onProgress?.(95);
    await queryClient.invalidateQueries({ queryKey: ['reels'] });
    onProgress?.(100);
    return reel;
  };

  return {
    reels,
    loading,
    refreshing,
    error: error ? (error as any).message ?? String(error) : null,
    currentIndex,
    setCurrentIndex,
    likeReel,
    incrementView,
    uploadReel,
    refetch,
  };
}

export function useReelComments(reelId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!reelId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reel_comments')
        .select('*')
        .eq('reel_id', reelId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = [...new Set((data || []).map(c => c.user_id))];
      const [{ data: profiles }, { data: likesData }] = await Promise.all([
        supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds),
        user
          ? supabase.from('reel_comment_likes').select('comment_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
      const likedSet = new Set((likesData || []).map(l => l.comment_id));

      const commentMap = new Map<string, ReelComment>();
      const rootComments: ReelComment[] = [];

      for (const comment of data || []) {
        commentMap.set(comment.id, {
          ...comment,
          like_count: comment.like_count ?? 0,
          is_liked: likedSet.has(comment.id),
          profile: profileMap.get(comment.user_id),
          replies: [],
        });
      }

      for (const comment of data || []) {
        const enriched = commentMap.get(comment.id)!;
        if (comment.parent_id && commentMap.has(comment.parent_id)) {
          commentMap.get(comment.parent_id)!.replies!.push(enriched);
        } else if (!comment.parent_id) {
          rootComments.push(enriched);
        }
      }

      setComments(rootComments);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }, [reelId, user]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = async (content: string, parentId?: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reel_comments')
      .insert({ reel_id: reelId, user_id: user.id, content, parent_id: parentId || null })
      .select()
      .single();
    if (error) throw error;
    await fetchComments();
    return data;
  };

  const likeComment = async (commentId: string) => {
    if (!user) return;
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    if (comment.is_liked) {
      await supabase.from('reel_comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id);
    } else {
      await supabase.from('reel_comment_likes').insert({ comment_id: commentId, user_id: user.id });
    }

    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, is_liked: !c.is_liked, like_count: c.is_liked ? Math.max(0, c.like_count - 1) : c.like_count + 1 }
        : c
    ));
  };

  return { comments, loading, addComment, likeComment, refetch: fetchComments };
}

export function captureVideoThumbnail(src: string, seekTime = 0.5): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = src;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.addEventListener('error', onError);

    video.addEventListener('loadeddata', () => {
      try {
        const target = video.duration && isFinite(video.duration)
          ? Math.min(seekTime, video.duration * 0.25)
          : seekTime;
        video.currentTime = target;
      } catch {
        cleanup();
        reject(new Error('Video seeking not supported'));
      }
    });

    video.addEventListener('seeked', () => {
      try {
        const width = video.videoWidth || 720;
        const height = video.videoHeight || 1280;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('Failed to encode thumbnail'));
          },
          'image/jpeg',
          0.8
        );
      } catch (err) {
        cleanup();
        reject(err as Error);
      }
    });
  });
}
