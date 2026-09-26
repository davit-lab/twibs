import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserLibrary } from '@/hooks/useBooks';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useReadingStats } from '@/hooks/useReadingStats';
import { useFollowingReadingFeed } from '@/hooks/useSocialReading';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, subWeeks, startOfWeek, addDays } from 'date-fns';
import { Book, BookOpen, CheckCircle2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DayLog {
  date: string;
  minutes: number;
}

interface CalendarCell {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  isInFuture: boolean;
}

function intensity(minutes: number): CalendarCell['level'] {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

function dayGroupLabel(date: Date) {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE');
}

function formatMinutes(total: number) {
  if (!total) return '0m';
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const rem = total % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function ReadingHistoryPage() {
  const { user } = useAuth();
  const { streak, todayReading, loading: streakLoading } = useReadingStreak(user?.id);
  const { data: stats, isLoading: statsLoading } = useReadingStats(user?.id);
  const { books: libraryBooks, isLoading: loadingLibrary } = useUserLibrary();
  const { events: friendEvents, loading: loadingFeed } = useFollowingReadingFeed();
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const weeks = 14;
  const calendarStart = startOfWeek(subWeeks(new Date(), weeks - 1));

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const from = format(calendarStart, 'yyyy-MM-dd');
    const to = format(new Date(), 'yyyy-MM-dd');
    supabase
      .from('reading_logs')
      .select('read_date, minutes_read')
      .eq('user_id', user.id)
      .gte('read_date', from)
      .lte('read_date', to)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLogs([]);
        } else {
          const byDay = new Map<string, number>();
          (data || []).forEach((row) => {
            byDay.set(row.read_date, (byDay.get(row.read_date) || 0) + row.minutes_read);
          });
          setLogs(Array.from(byDay.entries()).map(([date, minutes]) => ({ date, minutes })));
        }
        setLoadingLogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, calendarStart]);

  const logMap = useMemo(() => new Map(logs.map((l) => [l.date, l.minutes])), [logs]);

  const weeksGrid: CalendarCell[][] = useMemo(() => {
    const grid: CalendarCell[][] = [];
    const today = format(new Date(), 'yyyy-MM-dd');
    for (let w = 0; w < weeks; w++) {
      const week: CalendarCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(calendarStart, w * 7 + d);
        const key = format(date, 'yyyy-MM-dd');
        const minutes = logMap.get(key) || 0;
        week.push({
          date: key,
          minutes,
          level: intensity(minutes),
          isInFuture: key > today,
        });
      }
      grid.push(week);
    }
    return grid;
  }, [logMap, calendarStart, weeks]);

  const history = useMemo(() => {
    return libraryBooks
      .filter((b) => b.progress?.last_read_at)
      .sort((a, b) => String(b.progress!.last_read_at!).localeCompare(String(a.progress!.last_read_at!)))
      .slice(0, 12)
      .map((b) => {
        const completed = b.total_chapters > 0 && b.completed_count === b.total_chapters;
        const lastRead = new Date(b.progress!.last_read_at!);
        const key = format(lastRead, 'yyyy-MM-dd');
        const minutesToday = key === format(new Date(), 'yyyy-MM-dd') ? todayReading?.minutes : undefined;
        return {
          book: b,
          at: lastRead,
          group: dayGroupLabel(lastRead),
          key,
          minutesToday,
          state: completed
            ? 'Finished'
            : b.progress?.current_chapter_id
              ? `Reading · ${Math.round((b.completed_count / b.total_chapters) * 100)}%`
              : 'Started',
        };
      });
  }, [libraryBooks, todayReading]);

  const finishedBooks = libraryBooks.filter(
    (b) => b.total_chapters > 0 && b.completed_count === b.total_chapters
  ).length;
  const chaptersRead = libraryBooks.reduce((sum, b) => sum + (b.completed_count || 0), 0);

  const statsRows = [
    { label: 'Books finished', value: finishedBooks },
    { label: 'Chapters read', value: chaptersRead },
    { label: 'Reading days', value: stats?.totalSessions ?? 0 },
    { label: 'Reading time', value: formatMinutes(stats?.totalMinutes ?? 0) },
  ].filter((row) => row.value !== 0 && row.value !== '0m');

  const loading = streakLoading || statsLoading || loadingLibrary || loadingLogs;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Reading activity
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Your reading history</h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          When and how you have been reading — logs, time, and the books you finished.
        </p>
      </div>

      {/* Streak data, as plain text */}
      {user && (
        <p className="text-sm text-muted-foreground">
          {streak && streak.current_streak > 0 ? (
            <>
              Current streak{' '}
              <span className="font-semibold text-foreground">
                {streak.current_streak} {streak.current_streak === 1 ? 'day' : 'days'}
              </span>
              {streak.longest_streak > streak.current_streak && (
                <>
                  {' '}
                  · best <span className="font-semibold text-foreground">{streak.longest_streak} days</span>
                </>
              )}
            </>
          ) : (
            'No active streak — read today to start one.'
          )}
          {todayReading?.hasRead && (
            <>
              {' '}
              · read today{' '}
              <span className="font-semibold text-foreground">
                {todayReading.minutes} min · {todayReading.chapters} chapters
              </span>
            </>
          )}
        </p>
      )}

      {/* Activity calendar */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Activity</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Minutes read per day over the last {weeks} weeks
        </p>
        <div className="mt-4 overflow-x-auto">
          <div className="inline-flex flex-col gap-1.5">
            <div className="flex items-center gap-4">
              <div className="w-8" />
              <div className="ml-14 flex gap-1">
                {['Mon', 'Wed', 'Fri', 'Sun'].map((day) => (
                  <span key={day} className="w-4 text-center text-[10px] text-muted-foreground">
                    {day}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="flex w-8 flex-col items-end gap-1 pr-1">
                {weeksGrid.slice(0, 4).map((week, i) => {
                  const month = format(new Date(week[0].date + 'T00:00:00'), 'MMM');
                  return (
                    <span key={i} className="text-[10px] leading-4 text-muted-foreground">
                      {month}
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                {weeksGrid.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-1">
                    {week.map((cell) => (
                      <span
                        key={cell.date}
                        title={`${cell.date === format(new Date(), 'yyyy-MM-dd') ? 'Today' : cell.date} — ${cell.minutes} min`}
                        className={cn(
                          'h-4 w-4 rounded-[3px]',
                          cell.isInFuture
                            ? 'bg-border/30'
                            : levelClass(cell.level)
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 pl-9 text-[10px] text-muted-foreground">
              Less
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className={cn('h-3 w-3 rounded-[3px]', levelClass(l as never))} />
              ))}
              More
            </div>
          </div>
        </div>
      </div>

      {/* Reading statistics */}
      {statsRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Statistics</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2.5 md:grid-cols-4">
            {statsRows.map((row) => (
              <div key={row.label} className="border-l-2 border-border pl-3">
                <p className="text-[11px] font-medium text-muted-foreground">{row.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reading history */}
      <div>
        <h3 className="text-sm font-semibold tracking-tight">History</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Your most recent reading sessions, in order.
        </p>
        {history.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card p-4">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing read yet. Open a book from your library and start.
            </p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border/60">
            {history.map((h) => (
              <Link
                key={h.book.id}
                to={`/library/book/${h.book.id}`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/30"
              >
                <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {h.group}
                </span>
                <span className="h-[54px] w-9 flex-shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
                  {h.book.cover_url ? (
                    <img src={h.book.cover_url} alt={h.book.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Book className="h-4 w-4 text-muted-foreground/30" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.book.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {h.state}
                    {h.minutesToday ? ` · ${h.minutesToday} min` : ''}
                  </span>
                </span>
                {h.state === 'Finished' && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {format(h.at, 'MMM d')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Friends' reading activity — real data only */}
      {!loadingFeed && (
        <div>
          <h3 className="text-sm font-semibold tracking-tight">People you follow</h3>
          {friendEvents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Reading activity from people you follow appears here.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border/60">
              {friendEvents.slice(0, 6).map((e) => {
                const label =
                  e.action === 'finished'
                    ? 'finished'
                    : e.action === 'reading'
                      ? 'is reading'
                      : 'started reading';
                return (
                  <div key={e.key} className="flex items-center gap-3 py-3">
                    <Link
                      to={e.username ? `/profile/${e.username}` : '#'}
                      className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted"
                    >
                      {e.avatarUrl ? (
                        <img src={e.avatarUrl} alt=""
                          className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">
                          {e.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                      <span className="font-semibold">{e.displayName}</span>{' '}
                      <span className="text-muted-foreground">{label}</span>{' '}
                      <Link
                        to={`/library/book/${e.bookId}`}
                        className="font-medium hover:underline"
                      >
                        {e.bookTitle}
                      </Link>
                    </p>
                    <Users className="hidden h-4 w-4 shrink-0 text-muted-foreground/60" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!user && (
        <p className="text-sm text-muted-foreground">Sign in to track your reading.</p>
      )}
    </div>
  );
}

function levelClass(level: number): string {
  const palette: Record<number, string> = {
    0: 'bg-border/30',
    1: 'bg-primary/20',
    2: 'bg-primary/40',
    3: 'bg-primary/65',
    4: 'bg-primary',
  };
  return palette[level] ?? palette[0];
}