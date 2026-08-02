import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to check if a specific user has premium access
 * Uses the database function has_premium_access for accurate checking
 */
export function usePremiumStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['premium-status', userId],
    queryFn: async () => {
      if (!userId) return false;

      const { data, error } = await supabase.rpc('has_premium_access', {
        _user_id: userId,
      });

      if (error) {
        console.error('Error checking premium status:', error);
        return false;
      }

      return data === true;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to batch check premium status for multiple users
 * More efficient when displaying lists of users
 */
export function useBatchPremiumStatus(userIds: string[]) {
  return useQuery({
    queryKey: ['premium-status-batch', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {};

      // Query active subscriptions for these users
      const { data, error } = await supabase
        .from('subscriptions')
        .select('user_id, status, current_period_end')
        .in('user_id', userIds)
        .eq('status', 'active');

      if (error) {
        console.error('Error checking batch premium status:', error);
        return {};
      }

      const now = new Date();
      const premiumMap: Record<string, boolean> = {};

      // Initialize all as false
      userIds.forEach(id => {
        premiumMap[id] = false;
      });

      // Mark users with active subscriptions as premium
      data?.forEach(sub => {
        if (sub.current_period_end) {
          const endDate = new Date(sub.current_period_end);
          if (endDate > now) {
            premiumMap[sub.user_id] = true;
          }
        } else {
          // No end date means active
          premiumMap[sub.user_id] = true;
        }
      });

      return premiumMap;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
