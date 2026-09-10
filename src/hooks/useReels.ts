import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

const PAGE_SIZE = 10;

export interface UploadReelOptions {
  caption: string;
  audioName?: string | null;
  audioUrl?: string | null;
  duration?: number;
  isPublished?: boolean;
  thumbnailBlob?: Blob | null;
}

type ReelCursor = { created_at: string; id: string } | null;

async function fetchReelsPage({
  feedType,
  userId,
  targetUserId,
  cursor,
  pageSize,
}: {
  feedType: ReelsFeedType;
  userId: string | null;
  targetUserId?: string | null;
  cursor: ReelCursor;
  pageSize: number;
}) {
  let followedIds: string[] = [];
  if (!targetUserId && feedType === 'following' && userId) {
    const { data: followedUsers } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted');
    followedIds = followedUsers?.map(f => f.following_id) || [];
    if (followedIds.length === 0) return { reels: [] as Reel[], nextCursor: null as ReelCursor };
  }

  let query = supabase
    .from('reels')
    .select('*')
    .eq('is_published', true)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  if (targetUserId) {
    query = query.eq('user_id', targetUserId);
  } else if (feedType === 'following' && followedIds.length > 0) {
    query = query.in('user_id', followedIds);
  }

  if (cursor) {
    query = query.or(
      `and(created_at.lt."${cursor.created_at}"),and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`
    );
  }

  const { data: reelsData, error: reelsError } = await query;
  if (reelsError) throw reelsError;
  if (!reelsData || reelsData.length === 0) return { reels: [] as Reel[], nextCursor: null as ReelCursor };

  const userIds = [...new Set(reelsData.map((reel) => reel.user_id))];
  const [{ data: profiles }, { data: likesData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url, is_verified')
      .in('user_id', userIds),
    userId
      ? supabase.from('reel_likes').select('reel_id').eq('user_id', userId)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  const likedSet = new Set((likesData || []).map((like) => like.reel_id));

  const reels: Reel[] = reelsData.map((reel) => ({
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
  })) as unknown as Reel[];

  const nextCursor: ReelCursor =
    reels.length === pageSize
      ? { created_at: reels[reels.length - 1].created_at, id: reels[reels.length - 1].id }
      : null;

  return { reels, nextCursor };
}

export function useReels(feedType: ReelsFeedType = 'foryou', targetUserId?: string | null) {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const queryClient = useQueryClient();

  const queryKey = ['reels', feedType, user?.id ?? null, targetUserId ?? null];

  const infinite = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchReelsPage({
        feedType,
        userId: user?.id ?? null,
        targetUserId,
        cursor: pageParam as ReelCursor,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: null as ReelCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const reels = useMemo(
    () => infinite.data?.pages.flatMap(page => page.reels) || [],
    [infinite.data]
  );

  const likeReel = useCallback(async (reelId: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please sign in to like reels.' });
      return;
    }
    const liked = reels.find(r => r.id === reelId);
    if (!liked) return;

    try {
      if (liked.is_liked) {
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
    options: UploadReelOptions,
    onProgress?: (progress: number) => void
  ) => {
    if (!user) throw new Error('Not authenticated');
    if (!isEnabled('reels_upload_enabled')) throw new Error('Reel uploads are currently disabled by the admin.');

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
      let thumbBlob: Blob | null = options.thumbnailBlob ?? null;
      if (!thumbBlob) {
        const objectUrl = URL.createObjectURL(file);
        thumbBlob = await captureVideoThumbnail(objectUrl);
        URL.revokeObjectURL(objectUrl);
      }
      if (thumbBlob) {
        const thumbName = `${user.id}/${Date.now()}-thumb.jpg`;
        const { error: thumbError } = await supabase.storage
          .from('reels')
          .upload(thumbName, thumbBlob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
        if (!thumbError) {
          thumbnailUrl = supabase.storage.from('reels').getPublicUrl(thumbName).data.publicUrl;
        }
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
        caption: options.caption || null,
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
    await queryClient.invalidateQueries({ queryKey: ['user-reels', user.id] });
    onProgress?.(100);
    return reel;
  };

  return {
    reels,
    loading: infinite.isLoading,
    refreshing: infinite.isFetching,
    error: infinite.error ? (infinite.error as any).message ?? String(infinite.error) : null,
    fetchNextPage: infinite.fetchNextPage,
    hasNextPage: infinite.hasNextPage,
    isFetchingNextPage: infinite.isFetchingNextPage,
    currentIndex,
    setCurrentIndex,
    likeReel,
    incrementView,
    uploadReel,
    refetch: infinite.refetch,
  };
}

export function useUserReels(userId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-reels', userId],
    queryFn: async (): Promise<Reel[]> => {
      if (!userId) return [];
      const { data: reelsData, error } = await supabase
        .from('reels')
        .select('*')
        .eq('user_id', userId)
        .eq('is_published', true)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!reelsData || reelsData.length === 0) return [];

      const [{ data: profiles }, { data: likesData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .eq('user_id', userId),
        user
          ? supabase.from('reel_likes').select('reel_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);
      const profile = profiles?.[0] || null;
      const likedSet = new Set((likesData || []).map((like) => like.reel_id));

      return reelsData.map((reel) => ({
        ...reel,
        duration: reel.duration ?? 0,
        view_count: reel.view_count ?? 0,
        like_count: reel.like_count ?? 0,
        comment_count: reel.comment_count ?? 0,
        share_count: reel.share_count ?? 0,
        is_published: reel.is_published ?? true,
        profile,
        is_liked: likedSet.has(reel.id),
      })) as unknown as Reel[];
    },
    enabled: !!userId,
  });
}

export function useReelSaves() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const savesQuery = useQuery({
    queryKey: ['reel-saves', user?.id],
    queryFn: async (): Promise<Set<string>> => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase.from('reel_saves').select('reel_id');
      if (error) throw error;
      return new Set((data || []).map(d => d.reel_id));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const toggleSaveMutation = useMutation({
    mutationFn: async (reelId: string) => {
      if (!user) throw new Error('Sign in required');
      const saved = savesQuery.data?.has(reelId) ?? false;
      if (saved) {
        const { error } = await supabase.from('reel_saves').delete().eq('reel_id', reelId).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reel_saves').insert({ reel_id: reelId, user_id: user.id });
        if (error && !error.message?.includes('duplicate key')) throw error;
      }
    },
    onMutate: async (reelId) => {
      await queryClient.cancelQueries({ queryKey: ['reel-saves', user?.id] });
      const previous = queryClient.getQueryData<Set<string>>(['reel-saves', user?.id]);
      queryClient.setQueryData<Set<string>>(['reel-saves', user?.id], (old) => {
        const next = new Set(old ?? []);
        if (next.has(reelId)) next.delete(reelId);
        else next.add(reelId);
        return next;
      });
      return { previous };
    },
    onError: (error: any, _reelId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['reel-saves', user?.id], context.previous);
      }
      toast({
        variant: 'destructive',
        title: 'Failed to update saved reels',
        description: error?.message || 'Please try again.',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reel-saves', user?.id] });
    },
  });

  return {
    savedIds: savesQuery.data ?? new Set<string>(),
    savedLoading: savesQuery.isLoading,
    toggleSave: toggleSaveMutation.mutate,
    toggleSavePending: toggleSaveMutation.isPending,
  };
}

export function useReelComments(reelId: string) {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState(true);
  // Guard against stale responses when reelId changes mid-flight.
  const fetchTokenRef = useRef(0);

  const fetchComments = useCallback(async () => {
    if (!reelId) {
      setComments([]);
      setLoading(false);
      return;
    }

    const token = ++fetchTokenRef.current;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reel_comments')
        .select('*')
        .eq('reel_id', reelId)
        .order('created_at', { ascending: true });

      if (fetchTokenRef.current !== token) return;
      if (error) throw error;

      const rows = data || [];
      const userIds = [...new Set(rows.map(c => c.user_id))];
      const [{ data: profiles, error: profilesError }, { data: likesData }] = await Promise.all([
        userIds.length > 0
          ? supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds)
          : Promise.resolve({ data: [], error: null }),
        user
          ? supabase.from('reel_comment_likes').select('comment_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ]);
      if (fetchTokenRef.current !== token) return;
      if (profilesError) throw profilesError;

      // Explicit typing avoids inference issues from the empty-list fallback branch.
      const profileRows = (profiles || []) as { user_id: string; username: string; display_name: string; avatar_url: string | null }[];
      const profileMap = new Map<string, { username: string; display_name: string; avatar_url: string | null }>(
        profileRows.map(p => [p.user_id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }])
      );
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

  const addComment = async (content: string, parentId?: string) => {
    if (!user) return;
    if (!isEnabled('comments_enabled')) throw new Error('Comments are currently disabled by the admin.');
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

    // Replies live nested under their root comment, so search across the whole tree.
    const allComments = comments.flatMap(c => [c, ...(c.replies || [])]);
    const target = allComments.find(c => c.id === commentId);
    if (!target) return;

    if (target.is_liked) {
      const { error } = await supabase
        .from('reel_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('reel_comment_likes')
        .insert({ comment_id: commentId, user_id: user.id });
      if (error) throw error;
    }

    const toggle = (c: ReelComment[]): ReelComment[] => c.map(comment =>
      comment.id === commentId
        ? {
            ...comment,
            is_liked: !comment.is_liked,
            like_count: comment.is_liked ? Math.max(0, comment.like_count - 1) : comment.like_count + 1,
          }
        : { ...comment, replies: toggle(comment.replies || []) }
    );
    setComments(prev => toggle(prev));
  };

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

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