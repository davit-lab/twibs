import { useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';

export interface InterestPost {
  id: string;
  user_id: string;
  category_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  interest_categories: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
  profiles: {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  user_has_liked?: boolean;
  user_has_saved?: boolean;
}

export interface InterestPostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  updated_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

interface UseInterestPostsOptions {
  userId?: string;
  categoryId?: string;
  categoryIds?: string[];
  limit?: number;
  /** Fetch a user's posts in any category (e.g. profile feed), skipping the category filter. */
  includeAll?: boolean;
}

export function useInterestPosts(options: UseInterestPostsOptions = {}) {
  const { userId, categoryId, categoryIds, limit = 10, includeAll = false } = options;
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: ['interest-posts', userId, categoryId, categoryIds?.slice().sort()],
    queryFn: async ({ pageParam }): Promise<{ posts: InterestPost[]; nextCursor: string | null }> => {
      let query = (supabase as any)
        .from('interest_posts')
        .select(`
          *,
          interest_categories (
            id,
            name,
            icon,
            color
          )
        `)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (!includeAll) {
        if (categoryId) {
          query = query.eq('category_id', categoryId);
        } else if (categoryIds && categoryIds.length > 0) {
          query = query.in('category_id', categoryIds);
        } else {
          return { posts: [], nextCursor: null };
        }
      }

      // Cursor-based pagination using created_at
      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;

      if (error) throw error;

      const enriched = await enrichInterestPosts(data || [], user?.id);

      // Determine next cursor
      const nextCursor = (data || []).length === limit
        ? (data as any[])[(data as any[]).length - 1].created_at
        : null;

      return { posts: enriched, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useSavedInterestPosts(userId: string | undefined, limit = 10) {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: ['saved-interest-posts', userId],
    queryFn: async ({ pageParam }): Promise<{ posts: InterestPost[]; nextCursor: string | null }> => {
      if (!userId) return { posts: [], nextCursor: null };

      let saveQuery = (supabase as any)
        .from('interest_post_saves')
        .select('post_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (pageParam) {
        saveQuery = saveQuery.lt('created_at', pageParam);
      }

      const { data: saves, error } = await saveQuery;
      if (error) throw error;

      const postIds = (saves || []).map((s: any) => s.post_id);
      if (postIds.length === 0) return { posts: [], nextCursor: null };

      const { data: rawPosts, error: postsError } = await (supabase as any)
        .from('interest_posts')
        .select(`
          *,
          interest_categories (
            id,
            name,
            icon,
            color
          )
        `)
        .in('id', postIds)
        .eq('hidden', false);

      if (postsError) throw postsError;

      const orderMap = new Map(postIds.map((id: string, i: number) => [id, i]));
      const orderedPosts = (rawPosts || [])
        .slice()
        .sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

      const enriched = await enrichInterestPosts(orderedPosts, user?.id);
      const nextCursor = (saves || []).length === limit
        ? (saves as any[])[(saves as any[]).length - 1].created_at
        : null;

      return { posts: enriched, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
  });
}

async function enrichInterestPosts(posts: any[], userId?: string): Promise<InterestPost[]> {
  let result = posts;

  // Fetch profiles separately (interest_posts has no FK to profiles,
  // so PostgREST cannot embed it in the same select).
  const profileIds = [...new Set(posts.map((p: any) => p.user_id))];
  if (profileIds.length > 0) {
    const { data: profiles } = await (supabase as any)
      .from('profiles')
      .select('user_id, username, display_name, avatar_url, is_verified')
      .in('user_id', profileIds);
    const profilesMap = new Map((profiles || []).map((pr: any) => [pr.user_id, pr]));
    result = posts.map((post: any) => ({
      ...post,
      profiles: profilesMap.get(post.user_id),
    }));
  }

  // Check if current user has liked / saved each post
  if (userId && result.length > 0) {
    const postIds = result.map((p: any) => p.id);
    const [{ data: likes }, { data: saves }] = await Promise.all([
      (supabase as any)
        .from('interest_post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds),
      (supabase as any)
        .from('interest_post_saves')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds),
    ]);

    const likedPostIds = new Set(likes?.map((l: any) => l.post_id) || []);
    const savedPostIds = new Set(saves?.map((s: any) => s.post_id) || []);

    result = result.map((post: any) => ({
      ...post,
      user_has_liked: likedPostIds.has(post.id),
      user_has_saved: savedPostIds.has(post.id),
    }));
  }

  return result as InterestPost[];
}

export function useInterestPostActions() {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createPost = useMutation({
    mutationFn: async ({ 
      content, 
      categoryId, 
      mediaUrl, 
      mediaType 
    }: { 
      content: string; 
      categoryId: string; 
      mediaUrl?: string; 
      mediaType?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      if (!isEnabled('interest_posting_enabled')) throw new Error('Interest posting is currently disabled by the admin.');

      const { data, error } = await (supabase as any)
        .from('interest_posts')
        .insert({
          user_id: user.id,
          category_id: categoryId,
          content,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
      toast({
        title: 'Posted!',
        description: 'Your interest post is now live.',
      });
    },
    onError: (error: any) => {
      const message = error?.message || 'Something went wrong. Please try again.';
      toast({
        variant: 'destructive',
        title: 'Failed to post',
        description:
          message.includes('has_premium_access')
            ? 'Premium subscription required to post to interests'
            : message.includes('row-level security')
              ? 'Your account cannot post to interests right now. Please try again in a moment.'
              : message,
      });
    },
  });

  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
      toast({
        title: 'Deleted',
        description: 'Your post has been removed.',
      });
    },
  });

  const likePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_post_likes')
        .insert({
          post_id: postId,
          user_id: user.id,
        });

      if (error && !error.message?.includes('duplicate')) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
    },
  });

  const unlikePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
    },
  });

  const savePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_post_saves')
        .insert({
          post_id: postId,
          user_id: user.id,
        });

      if (error && !error.message?.includes('duplicate')) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
      queryClient.invalidateQueries({ queryKey: ['saved-interest-posts'] });
    },
  });

  const unsavePost = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_post_saves')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
      queryClient.invalidateQueries({ queryKey: ['saved-interest-posts'] });
    },
  });

  return {
    createPost,
    deletePost,
    likePost,
    unlikePost,
    savePost,
    unsavePost,
  };
}

export function useInterestPostComments(postId: string) {
  return useQuery({
    queryKey: ['interest-post-comments', postId],
    queryFn: async (): Promise<InterestPostComment[]> => {
      const { data, error } = await (supabase as any)
        .from('interest_post_comments')
        .select('*')
        .eq('post_id', postId)
        .eq('hidden', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles separately (interest_post_comments has no FK to profiles).
      const comments = data || [];
      const profileIds = [...new Set(comments.map((c: any) => c.user_id))];
      if (profileIds.length === 0) return [];

      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', profileIds);

      const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return comments.map((c: any) => ({
        ...c,
        profiles: profilesMap.get(c.user_id),
      }));
    },
    enabled: !!postId,
  });
}

export function useInterestCommentActions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addComment = useMutation({
    mutationFn: async ({ 
      postId, 
      content, 
      parentId 
    }: { 
      postId: string; 
      content: string; 
      parentId?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .from('interest_post_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_id: parentId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['interest-post-comments', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('interest_post_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['interest-post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['interest-posts'] });
    },
  });

  const updateComment = useMutation({
    mutationFn: async ({ commentId, postId, content }: { commentId: string; postId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase as any)
        .from('interest_post_comments')
        .update({ content })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;
      return { data, postId };
    },
    onSuccess: ({ postId }) => {
      queryClient.invalidateQueries({ queryKey: ['interest-post-comments', postId] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update comment',
        description: error?.message || 'Something went wrong. Please try again.',
      });
    },
  });

  return {
    addComment,
    deleteComment,
    updateComment,
  };
}
