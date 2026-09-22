import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import { ShimmerBar, ShimmerGrid } from './StreakLoading';

interface DayActivity {
  date: string;
  minutes: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

function getReadingIntensity(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes === 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 45) return 2;
  return 3;
}

export default function ReadingActivity({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['reading-activity', targetUserId, format(today, 'yyyy-MM')],
    queryFn: async () => {
      if (!targetUserId) return [];
      const monthStartStr = format(monthStart, 'yyyy-MM-DD');
      const monthEndStr = format(monthEnd, 'yyyy-MM-DD');
      const { data, error } = await supabase
        .from('reading_logs')
        .select('read_date, minutes_read')
        .eq('user_id', targetUserId)
        .gte('read_date', monthStartStr)
        .lte('read_date', monthEndStr);
      if (error) throw error;
      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.read_date] = (acc[row.read_date] || 0) + row.minutes_read;
        return acc;
      }, {});
    },
    enabled: !!targetUserId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <ShimmerBar className="h-3 w-28" delay={0} />
        <ShimmerGrid columns={7} rows={5} cellClass="aspect-square" delay={0.1} />
      </div>
    );
  }

  const minutesMap = logs || {};

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {format(monthStart, 'MMMM yyyy')}
        </p>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((level) => (
            <div
              key={level}
              className={cn(
                'h-3 w-3 rounded-sm',
                level === 0 ? 'bg-muted/20' : level === 1 ? 'bg-primary/20' : level === 2 ? 'bg-primary/45' : 'bg-primary/70'
              )}
              title={`${level === 0 ? 'No reading' : level === 1 ? 'Light' : level === 2 ? 'Moderate' : 'Heavy'}`}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const minutes = minutesMap[dateStr] || 0;
          const intensity = getReadingIntensity(minutes);
          const currentMonth = isSameMonth(day, monthStart);

          return (
            <div
              key={dateStr}
              className="group relative flex aspect-square items-center justify-center"
              title={`${format(day, 'EEEE, MMMM d')}${minutes > 0 ? ` — ${minutes} min read` : ' — No reading'}`}
            >
              <div
                className={cn(
                  'h-[90%] w-[90%] rounded-sm transition-colors',
                  !currentMonth && 'bg-muted/5',
                  currentMonth && intensity === 0 && 'bg-muted/15',
                  currentMonth && intensity === 1 && 'bg-primary/20',
                  currentMonth && intensity === 2 && 'bg-primary/45',
                  currentMonth && intensity === 3 && 'bg-primary/75',
                  isToday(day) && 'ring-2 ring-primary ring-offset-1 ring-offset-card'
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
