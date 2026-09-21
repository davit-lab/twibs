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

export interface TodayReading {
  date: string;
  minutes: number;
  chapters: number;
  hasRead: boolean;
}

export const BADGE_INFO: Record<string, { icon: string; color: string; milestone: number }> = {
  'streak_3': { icon: 'sprout', color: 'bg-green-500', milestone: 3 },
  'streak_7': { icon: 'flame', color: 'bg-orange-500', milestone: 7 },
  'streak_14': { icon: 'star', color: 'bg-yellow-500', milestone: 14 },
  'streak_30': { icon: 'trophy', color: 'bg-amber-500', milestone: 30 },
  'streak_60': { icon: 'gem', color: 'bg-blue-500', milestone: 60 },
  'streak_100': { icon: 'crown', color: 'bg-purple-500', milestone: 100 },
  'streak_365': { icon: 'star', color: 'bg-gradient-to-r from-amber-400 to-purple-500', milestone: 365 },
};

export const BADGE_DISPLAY_NAMES: Record<string, string> = {
  'streak_3': 'First Chapter',
  'streak_7': 'One Week',
  'streak_14': 'Fortnight',
  'streak_30': 'One Month',
  'streak_60': 'Deep Reader',
  'streak_100': 'Century',
  'streak_365': 'Year Reader',
};

export const BADGE_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

export const MIN_READING_MINUTES = 5;

function getLocalDateString(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function useReadingStreak(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const todayStr = getLocalDateString();

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

  const { data: todayLog, isLoading: todayLogLoading } = useQuery({
    queryKey: ['today-reading', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('reading_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('read_date', todayStr)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        date: data.read_date,
        minutes: data.minutes_read,
        chapters: data.chapters_read,
        hasRead: true,
      } as TodayReading;
    },
    enabled: !!targetUserId,
  });

  return {
    streak,
    badges: badges || [],
    todayReading: todayLog,
    loading: streakLoading || badgesLoading || todayLogLoading,
  };
}

export function useLogReading() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ minutesRead = 1, chaptersRead = 0 }: { minutesRead?: number; chaptersRead?: number }) => {
      if (!user) throw new Error('Not authenticated');

      const todayStr = new Date().toLocaleDateString('en-CA');

      const todayReading = await getTodayReading(user.id, todayStr);

      if (todayReading) {
        const updatedMinutes = todayReading.minutes_read + minutesRead;
        const updatedChapters = todayReading.chapters_read + chaptersRead;

        const { data, error } = await supabase
          .from('reading_logs')
          .update({
            minutes_read: updatedMinutes,
            chapters_read: updatedChapters,
          })
          .eq('user_id', user.id)
          .eq('read_date', todayStr)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('reading_logs')
        .insert({
          user_id: user.id,
          read_date: todayStr,
          minutes_read: minutesRead,
          chapters_read: chaptersRead,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: updateData, error: updateError } = await supabase
            .from('reading_logs')
            .update({
              minutes_read: minutesRead,
              chapters_read: chaptersRead,
            })
            .eq('user_id', user.id)
            .eq('read_date', todayStr)
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
      queryClient.invalidateQueries({ queryKey: ['today-reading'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
    },
  });
}

async function getTodayReading(userId: string, dateStr: string) {
  const { data } = await supabase
    .from('reading_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('read_date', dateStr)
    .maybeSingle();

  return data || null;
}
