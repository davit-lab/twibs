import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FollowStats {
  followers: number;
  following: number;
}

export function useFollowStats(userId: string | undefined) {
  const [stats, setStats] = useState<FollowStats>({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      const [followersResult, followingResult] = await Promise.all([
        supabase
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', userId)
          .eq('status', 'accepted'),
        supabase
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', userId)
          .eq('status', 'accepted'),
      ]);

      setStats({
        followers: followersResult.count || 0,
        following: followingResult.count || 0,
      });
      setLoading(false);
    };

    fetchStats();

    // Subscribe to changes
    const channel = supabase
      .channel(`follow-stats-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
        },
        (payload) => {
          // Re-fetch if this user is involved
          if (
            payload.new && 
            (('follower_id' in payload.new && payload.new.follower_id === userId) ||
             ('following_id' in payload.new && payload.new.following_id === userId))
          ) {
            fetchStats();
          }
          if (
            payload.old && 
            (('follower_id' in payload.old && payload.old.follower_id === userId) ||
             ('following_id' in payload.old && payload.old.following_id === userId))
          ) {
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { stats, loading };
}