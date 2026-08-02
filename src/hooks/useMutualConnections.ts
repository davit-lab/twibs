import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface MutualConnection {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

export function useMutualConnections(targetUserId: string | undefined) {
  const { user } = useAuth();
  const [mutuals, setMutuals] = useState<MutualConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !targetUserId || user.id === targetUserId) {
      setLoading(false);
      return;
    }

    const fetchMutualConnections = async () => {
      try {
        // Get users that both the current user and target user follow
        const { data: currentUserFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'accepted');

        const { data: targetUserFollowing } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', targetUserId)
          .eq('status', 'accepted');

        if (!currentUserFollowing || !targetUserFollowing) {
          setLoading(false);
          return;
        }

        const currentIds = new Set(currentUserFollowing.map(f => f.following_id));
        const mutualIds = targetUserFollowing
          .filter(f => currentIds.has(f.following_id))
          .map(f => f.following_id);

        if (mutualIds.length === 0) {
          setMutuals([]);
          setCount(0);
          setLoading(false);
          return;
        }

        // Fetch profiles for mutual connections (limit to first 3 for display)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', mutualIds.slice(0, 3));

        setMutuals(profiles || []);
        setCount(mutualIds.length);
      } catch (error) {
        console.error('Error fetching mutual connections:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMutualConnections();
  }, [user, targetUserId]);

  return { mutuals, count, loading };
}
