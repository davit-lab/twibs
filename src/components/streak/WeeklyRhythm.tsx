import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, subDays } from 'date-fns';
import { ShimmerGrid } from './StreakLoading';

interface WeeklyDayInfo {
  dayName: string;
  isRead: boolean;
  isToday: boolean;
  isFuture: boolean;
  minutes?: number;
}

function useWeeklyRhythmData(lastReadDate: string | null | undefined, currentStreak: number): WeeklyDayInfo[] {
  const days: WeeklyDayInfo[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayName = format(d, 'EEE');
    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

    let isRead = false;
    if (lastReadDate && currentStreak > 0) {
      const daysSince = differenceInDays(parseISO(lastReadDate), d);
      if (daysSince >= 0 && daysSince < currentStreak) {
        isRead = true;
      }
      if (lastReadDate === dateStr) {
        isRead = true;
      }
    }

    days.push({
      dayName,
      isRead,
      isToday,
      isFuture: differenceInDays(d, new Date()) > 0,
    });
  }
  return days;
}

interface WeeklyRhythmProps {
  userId?: string;
}

export default function WeeklyRhythm({ userId }: WeeklyRhythmProps) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { streak, loading } = useReadingStreak(targetUserId);
  const currentStreak = streak?.current_streak || 0;
  const lastReadDate = streak?.last_read_date;
  const days = useWeeklyRhythmData(lastReadDate, currentStreak);

  if (loading) {
    return <ShimmerGrid columns={7} cellClass="h-10" />;
  }

  if (currentStreak === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4" />
        Your weekly rhythm appears here once you start reading.
      </div>
    );
  }

  return (
    <div role="list" aria-label="Reading activity this week">
      <div className="grid grid-cols-7 gap-1">
        {days.map(({ dayName, isRead, isToday, isFuture }) => (
          <div
            key={dayName}
            role="listitem"
            aria-label={`${dayName}${isToday ? ', today' : ''}${isRead ? ', read' : isFuture ? ', upcoming' : ', no reading'}`}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dayName}
            </span>
            {isRead ? (
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  isToday
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                    : 'bg-primary/80 text-primary-foreground'
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : isToday ? (
              <div className="h-8 w-8 rounded-md border-[1.5px] border-dashed border-primary/40" />
            ) : isFuture ? (
              <div className="h-8 w-8 rounded-md bg-muted/15" />
            ) : (
              <div className="h-8 w-8 rounded-md bg-muted/30" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
