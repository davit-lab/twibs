import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { levelFromXp, xpFromMinutes } from '@/lib/library-content';

export interface ReadingLogRow {
  id: string;
  user_id: string;
  read_date: string;
  minutes_read: number;
  chapters_read: number;
}

export interface WeekActivity {
  date: string;
  label: string;
  minutes: number;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_minutes: number;
  reading_days: number;
}

export interface ReadingStats {
  logs: ReadingLogRow[];
  totalMinutes: number;
  totalSessions: number;
  totalChapters: number;
  xp: number;
  level: ReturnType<typeof levelFromXp>;
  week: WeekActivity[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function useReadingStats(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['reading-stats', targetUserId],
    queryFn: async (): Promise<ReadingStats | null> => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('reading_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .order('read_date', { ascending: false })
        .limit(120);

      if (error) throw error;
      const logs = (data || []) as ReadingLogRow[];

      const totalMinutes = logs.reduce((sum, l) => sum + (l.minutes_read || 0), 0);
      const totalSessions = logs.length;
      const totalChapters = logs.reduce((sum, l) => sum + (l.chapters_read || 0), 0);

      const minutesByDate = new Map<string, number>();
      logs.forEach((l) => {
        minutesByDate.set(l.read_date, (minutesByDate.get(l.read_date) || 0) + (l.minutes_read || 0));
      });

      const week: WeekActivity[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        week.push({
          date: dateStr,
          label: DAY_LABELS[d.getDay()],
          minutes: minutesByDate.get(dateStr) || 0,
        });
      }

      return {
        logs,
        totalMinutes,
        totalSessions,
        totalChapters,
        xp: xpFromMinutes(totalMinutes),
        level: levelFromXp(xpFromMinutes(totalMinutes)),
        week,
      };
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['reading-leaderboard'],
    queryFn: async (): Promise<LeaderboardEntry[] | null> => {
      try {
        const { data, error } = await (supabase.rpc as (fn: string, args: { row_limit: number }) => Promise<{ user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; total_minutes: number; reading_days: number }[]>)('get_reading_leaderboard', { row_limit: 10 });
        if (error) throw error;
        return (data || []) as unknown as LeaderboardEntry[];
      } catch (err) {
        console.warn('Leaderboard RPC unavailable:', err);
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}
