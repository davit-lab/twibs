import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CallBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  profile?: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export function useCallBlocks() {
  const { user } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<CallBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = useCallback(async () => {
    if (!user) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('call_blocks')
        .select('*')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for blocked users
      if (data && data.length > 0) {
        const blockedIds = data.map(b => b.blocked_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username, avatar_url')
          .in('user_id', blockedIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        
        setBlockedUsers(data.map(block => ({
          ...block,
          profile: profileMap.get(block.blocked_id),
        })));
      } else {
        setBlockedUsers([]);
      }
    } catch (error) {
      console.error('Error fetching call blocks:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const blockUser = useCallback(async (userId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('call_blocks')
        .insert({
          blocker_id: user.id,
          blocked_id: userId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.info('User is already blocked from calling you');
          return true;
        }
        throw error;
      }

      toast.success('User blocked from calling you');
      await fetchBlockedUsers();
      return true;
    } catch (error) {
      console.error('Error blocking user:', error);
      toast.error('Failed to block user');
      return false;
    }
  }, [user, fetchBlockedUsers]);

  const unblockUser = useCallback(async (userId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('call_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', userId);

      if (error) throw error;

      toast.success('User unblocked');
      setBlockedUsers(prev => prev.filter(b => b.blocked_id !== userId));
      return true;
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error('Failed to unblock user');
      return false;
    }
  }, [user]);

  const isUserBlocked = useCallback((userId: string) => {
    return blockedUsers.some(b => b.blocked_id === userId);
  }, [blockedUsers]);

  // Check if a specific user has blocked the current user from calling
  const isBlockedBy = useCallback(async (userId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // We can't directly query if someone blocked us due to RLS
      // Instead, we'll check this on the server side when initiating calls
      // For now, return false and handle this in the call initiation
      return false;
    } catch (error) {
      console.error('Error checking if blocked:', error);
      return false;
    }
  }, [user]);

  return {
    blockedUsers,
    loading,
    blockUser,
    unblockUser,
    isUserBlocked,
    isBlockedBy,
    refetch: fetchBlockedUsers,
  };
}
