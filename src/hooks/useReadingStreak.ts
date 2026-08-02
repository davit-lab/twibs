import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReadingStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_read_date: string | null;
}

export interface ReadingBadge {
  id: string;
  user_id: string;
  badge_type: string;
  badge_name: string;
  earned_at: string;
}

export interface ReadingLog {
  id: string;
  user_id: string;
  read_date: string;
  minutes_read: number;
  chapters_read: number;
}

export const BADGE_INFO: Record<string, { icon: string; color: string; milestone: number }> = {
  'streak_3': { icon: '🌱', color: 'bg-green-500', milestone: 3 },
  'streak_7': { icon: '🔥', color: 'bg-orange-500', milestone: 7 },
  'streak_14': { icon: '⭐', color: 'bg-yellow-500', milestone: 14 },
  'streak_30': { icon: '🏆', color: 'bg-amber-500', milestone: 30 },
  'streak_60': { icon: '💎', color: 'bg-blue-500', milestone: 60 },
  'streak_100': { icon: '👑', color: 'bg-purple-500', milestone: 100 },
  'streak_365': { icon: '🌟', color: 'bg-gradient-to-r from-amber-400 to-purple-500', milestone: 365 },
};

export function useReadingStreak(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  const { data: streak, isLoading: streakLoading } = useQuery({
    queryKey: ['reading-streak', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;
      
      const { data, error } = await supabase
        .from('reading_streaks')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();
      
      if (error) throw error;
      return data as ReadingStreak | null;
    },
    enabled: !!targetUserId,
  });

  const { data: badges, isLoading: badgesLoading } = useQuery({
    queryKey: ['reading-badges', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      
      const { data, error } = await supabase
        .from('reading_badges')
        .select('*')
        .eq('user_id', targetUserId)
        .order('earned_at', { ascending: false });
      
      if (error) throw error;
      return data as ReadingBadge[];
    },
    enabled: !!targetUserId,
  });

  return {
    streak,
    badges: badges || [],
    loading: streakLoading || badgesLoading,
  };
}

export function useLogReading() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ minutesRead = 1, chaptersRead = 0 }: { minutesRead?: number; chaptersRead?: number }) => {
      if (!user) throw new Error('Not authenticated');

      const today = new Date().toISOString().split('T')[0];

      // Try to upsert the reading log for today
      const { data, error } = await supabase
        .from('reading_logs')
        .upsert(
          {
            user_id: user.id,
            read_date: today,
            minutes_read: minutesRead,
            chapters_read: chaptersRead,
          },
          {
            onConflict: 'user_id,read_date',
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) {
        // If conflict, update instead
        if (error.code === '23505') {
          const { data: updateData, error: updateError } = await supabase
            .from('reading_logs')
            .update({
              minutes_read: minutesRead,
              chapters_read: chaptersRead,
            })
            .eq('user_id', user.id)
            .eq('read_date', today)
            .select()
            .single();
          
          if (updateError) throw updateError;
          return updateData;
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-streak'] });
      queryClient.invalidateQueries({ queryKey: ['reading-badges'] });
    },
  });
}
