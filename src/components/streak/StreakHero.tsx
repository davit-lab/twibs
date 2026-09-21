import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useReadingStreak, BADGE_MILESTONES } from '@/hooks/useReadingStreak';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays, subDays } from 'date-fns';

interface WeeklyDay {
  dayName: string;
  isRead: boolean;
  isToday: boolean;
  isFuture: boolean;
}

function useWeeklyRhythm(lastReadDate: string | null | undefined, currentStreak: number): WeeklyDay[] {
  const days: WeeklyDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayName = format(d, 'EEE');
    const isToday = format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

    let isRead = false;
    if (lastReadDate) {
      if (currentStreak > 0) {
        const daysSince = differenceInDays(parseISO(lastReadDate), d);
        if (daysSince >= 0 && daysSince < currentStreak) {
          isRead = true;
        }
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

export default function StreakHero({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { streak, todayReading, loading } = useReadingStreak(targetUserId);

  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;
  const lastReadDate = streak?.last_read_date;
  const days = useWeeklyRhythm(lastReadDate, currentStreak);

  if (loading) {
    return (
      <div className="flex items-center justify-between py-4">
        <div className="h-20 w-24 rounded-lg bg-muted/40" />
        <div className="h-10 w-32 bg-muted/40" />
      </div>
    );
  }

  if (currentStreak === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center md:flex-row md:items-start md:justify-between md:text-left">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Reading streak</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            Your reading rhythm
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Read your first chapter to begin tracking your progress.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 md:mt-0">
          <BookOpen className="h-4 w-4 text-muted-foreground/50" />
          <span className="text-sm text-muted-foreground">Start reading</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Reading streak</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Your reading rhythm</h2>
        {todayReading?.hasRead ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Read today &middot; {todayReading.minutes} min &middot; {todayReading.chapters} chapters
          </p>
        ) : currentStreak > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Read today to continue your streak</p>
        ) : null}
      </div>

      <div className="flex flex-col items-center md:items-end">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary/60" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">consecutive days</span>
        </div>
        <motion.div
          key={currentStreak}
          initial={{ opacity: 0.7, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mt-1 text-7xl font-semibold tracking-[-0.04em] tabular-nums leading-none md:text-8xl"
        >
          {currentStreak}
        </motion.div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Days</span>
          {currentStreak > 0 && longestStreak > currentStreak && (
            <span className="text-xs text-muted-foreground">
              &middot; best <span className="font-semibold text-foreground">{longestStreak}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyRhythm({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { streak, loading } = useReadingStreak(targetUserId);
  const currentStreak = streak?.current_streak || 0;
  const lastReadDate = streak?.last_read_date;
  const days = useWeeklyRhythm(lastReadDate, currentStreak);

  if (loading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-12 flex-1 rounded-lg bg-muted/30" />
        ))}
      </div>
    );
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
      <div className="flex items-center justify-between">
        {days.map(({ dayName, isRead, isToday, isFuture }) => (
          <div
            key={dayName}
            role="listitem"
            aria-label={`${dayName}${isToday ? ', today' : ''}${isRead ? ', read' : isFuture ? ', upcoming' : ', no reading'}`}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dayName}
            </span>
            <div className="flex h-9 w-9 items-center justify-center">
              {isRead ? (
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold',
                    isToday
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                      : 'bg-primary/80 text-primary-foreground'
                  )}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : isToday ? (
                <div className="h-7 w-7 rounded-md border-2 border-dashed border-primary/40" />
              ) : isFuture ? (
                <div className="h-7 w-7 rounded-md bg-muted/20" />
              ) : (
                <div className="h-7 w-7 rounded-md bg-muted/30" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
