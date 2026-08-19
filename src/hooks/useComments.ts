import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';

export interface CommentProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  upvote_count: number;
  downvote_count: number;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  profiles: CommentProfile;
  user_vote?: 'up' | 'down' | null;
  replies?: Comment[];
}

export function useComments(postId: string) {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all comments for the post
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .eq('hidden', false)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;

      // Fetch user's votes if logged in
      let userVotes: Record<string, 'up' | 'down'> = {};
      if (user) {
        const { data: votesData } = await supabase
          .from('comment_votes')
          .select('comment_id, vote_type')
          .eq('user_id', user.id);

        if (votesData) {
          userVotes = votesData.reduce((acc, vote) => {
            acc[vote.comment_id] = vote.vote_type as 'up' | 'down';
            return acc;
          }, {} as Record<string, 'up' | 'down'>);
        }
      }

      // Fetch profiles for comment authors
      const userIds = [...new Set(commentsData?.map((c: any) => c.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', userIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Build threaded structure
      const commentMap = new Map<string, Comment>();
      const rootComments: Comment[] = [];

      commentsData?.forEach((comment: any) => {
        const profile = profilesMap.get(comment.user_id);
        const formattedComment: Comment = {
          ...comment,
          profiles: profile || {
            username: 'unknown',
            display_name: 'Unknown User',
            avatar_url: null,
            is_verified: false,
          },
          user_vote: userVotes[comment.id] || null,
          replies: [],
        };
        commentMap.set(comment.id, formattedComment);
      });

      commentsData?.forEach((comment: any) => {
        const formattedComment = commentMap.get(comment.id)!;
        if (comment.parent_id && commentMap.has(comment.parent_id)) {
          commentMap.get(comment.parent_id)!.replies!.push(formattedComment);
        } else if (!comment.parent_id) {
          rootComments.push(formattedComment);
        }
      });

      setComments(rootComments);
    } catch (error: any) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    fetchComments();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, fetchComments]);

  const addComment = async (content: string, parentId?: string) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to comment.',
      });
      return null;
    }

    if (!isEnabled('comments_enabled')) {
      toast({
        variant: 'destructive',
        title: 'Comments are disabled',
        description: 'Commenting is currently disabled by the admin.',
      });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          parent_id: parentId || null,
          content,
        })
        .select('*')
        .single();

      if (error) throw error;

      return data;
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add comment. Please try again.',
      });
      return null;
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Comment deleted',
        description: 'Your comment has been removed.',
      });
      return true;
    } catch (error: unknown) {
      console.error('Error deleting comment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete comment. Please try again.',
      });
      return false;
    }
  };

  const editComment = async (commentId: string, content: string) => {
    if (!user) return false;

    const trimmed = content.trim();
    if (!trimmed) return false;

    try {
      const { error } = await supabase
        .from('comments')
        .update({
          content: trimmed,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Comment updated',
        description: 'Your comment has been edited.',
      });
      await fetchComments();
      return true;
    } catch (error: unknown) {
      console.error('Error editing comment:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to edit comment. Please try again.',
      });
      return false;
    }
  };

  const vote = async (commentId: string, voteType: 'up' | 'down') => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to vote.',
      });
      return;
    }

    try {
      // Check existing vote
      const { data: existingVote } = await supabase
        .from('comment_votes')
        .select('id, vote_type')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          // Remove vote
          await supabase
            .from('comment_votes')
            .delete()
            .eq('id', existingVote.id);
        } else {
          // Change vote
          await supabase
            .from('comment_votes')
            .update({ vote_type: voteType })
            .eq('id', existingVote.id);
        }
      } else {
        // Add new vote
        await supabase
          .from('comment_votes')
          .insert({
            comment_id: commentId,
            user_id: user.id,
            vote_type: voteType,
          });
      }

      fetchComments();
    } catch (error: any) {
      console.error('Error voting:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to vote. Please try again.',
      });
    }
  };

  return {
    comments,
    isLoading,
    addComment,
    deleteComment,
    editComment,
    vote,
    refetch: fetchComments,
  };
}
