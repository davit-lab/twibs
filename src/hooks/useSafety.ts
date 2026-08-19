import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type ReportTargetType =
  | 'post'
  | 'profile'
  | 'group'
  | 'reel'
  | 'interest_post'
  | 'comment'
  | 'group_post'
  | 'interest_post_comment'
  | 'group_post_comment';

function useIdList(key: string, table: string, column: string, ownerColumn = 'user_id') {
  const { user } = useAuth();
  return useQuery({
    queryKey: [key],
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from(table)
        .select(column)
        .eq(ownerColumn, user.id);
      if (error) throw error;
      return (data || []).map((row: any) => row[column] as string);
    },
    enabled: !!user,
  });
}

export function useBlockedUsers() {
  return useIdList('blocked-users', 'blocks', 'blocked_id', 'blocker_id');
}

export function useMutedUsers() {
  return useIdList('muted-users', 'mutes', 'muted_id', 'muter_id');
}

export function useSavedPosts() {
  return useIdList('saved-posts', 'saves', 'post_id');
}

export function useRepostedPosts() {
  return useIdList('reposted-posts', 'reposts', 'post_id');
}

interface SafetyActions {
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  muteUser: (userId: string) => Promise<boolean>;
  unmuteUser: (userId: string) => Promise<boolean>;
  savePost: (postId: string) => Promise<boolean>;
  unsavePost: (postId: string) => Promise<boolean>;
  repostPost: (postId: string) => Promise<boolean>;
  unrepostPost: (postId: string) => Promise<boolean>;
  reportContent: (targetType: ReportTargetType, targetId: string, reason: string, details?: string) => Promise<boolean>;
}

export function useSafetyActions(): SafetyActions {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    queryClient.invalidateQueries({ queryKey: ['muted-users'] });
    queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
    queryClient.invalidateQueries({ queryKey: ['reposted-posts'] });
  };

  const run = async (
    fn: () => Promise<unknown>,
    success: { title: string; description?: string },
    failure: { title: string; description?: string }
  ): Promise<boolean> => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to continue.' });
      return false;
    }
    try {
      await fn();
      toast(success);
      invalidateAll();
      return true;
    } catch (error: unknown) {
      console.error(failure.title, error);
      toast({
        variant: 'destructive',
        title: failure.title,
        description: failure.description ?? (error instanceof Error ? error.message : 'Something went wrong. Please try again.'),
      });
      return false;
    }
  };

  return {
    blockUser: (userId: string) =>
      run(
        () => (supabase as any).rpc('block_user', { target_user_id: userId }),
        { title: 'User blocked', description: 'They can no longer see your posts or message you.' },
        { title: 'Failed to block user' }
      ),
    unblockUser: (userId: string) =>
      run(
        () => (supabase as any).rpc('unblock_user', { target_user_id: userId }),
        { title: 'User unblocked' },
        { title: 'Failed to unblock user' }
      ),
    muteUser: (userId: string) =>
      run(
        () => (supabase as any).rpc('mute_user', { target_user_id: userId }),
        { title: 'User muted', description: 'You will no longer see their posts or notifications.' },
        { title: 'Failed to mute user' }
      ),
    unmuteUser: (userId: string) =>
      run(
        () => (supabase as any).rpc('unmute_user', { target_user_id: userId }),
        { title: 'User unmuted' },
        { title: 'Failed to unmute user' }
      ),
    savePost: (postId: string) =>
      run(
        () => (supabase as any).from('saves').insert({ post_id: postId, user_id: user?.id }),
        { title: 'Saved', description: 'Post added to your saved items.' },
        { title: 'Failed to save post' }
      ),
    unsavePost: (postId: string) =>
      run(
        () =>
          (supabase as any)
            .from('saves')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user?.id),
        { title: 'Removed from saved' },
        { title: 'Failed to remove post' }
      ),
    repostPost: (postId: string) =>
      run(
        () => (supabase as any).rpc('repost_post', { target_post_id: postId }),
        { title: 'Reposted', description: 'Your followers can now see this post.' },
        { title: 'Failed to repost' }
      ),
    unrepostPost: (postId: string) =>
      run(
        () => (supabase as any).rpc('unrepost_post', { target_post_id: postId }),
        { title: 'Repost removed' },
        { title: 'Failed to remove repost' }
      ),
    reportContent: (targetType: ReportTargetType, targetId: string, reason: string, details?: string) =>
      run(
        () =>
          (supabase as any).rpc('report_content', {
            target_type: targetType,
            target_id: targetId,
            reason,
            details: details || null,
          }),
        { title: 'Report submitted', description: 'Thanks — our team will review this content.' },
        { title: 'Failed to submit report' }
      ),
  };
}
