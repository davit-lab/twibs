import { Flame, Trophy, Calendar, Sprout, Award, Gem, Crown, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { format, differenceInDays, parseISO, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface ReadingStreakCardProps {
  userId?: string;
  compact?: boolean;
}

const MILESTONE_ICONS: Record<string, typeof Flame> = {
  streak_3: Sprout,
  streak_7: Flame,
  streak_14: Award,
  streak_30: Trophy,
  streak_60: Gem,
  streak_100: Crown,
  streak_365: Star,
};

export default function ReadingStreakCard({ userId, compact = false }: ReadingStreakCardProps) {
  const { streak, badges, loading } = useReadingStreak(userId);

  if (loading) {
    return (
      <div className={compact ? '' : 'rounded-2xl border border-border/60 bg-card p-5'}>
        <Skeleton className={compact ? 'h-10 w-full rounded-xl' : 'h-32 w-full rounded-xl'} />
      </div>
    );
  }

  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;
  const lastReadDate = streak?.last_read_date;

  const isStreakActive =
    !!lastReadDate && differenceInDays(new Date(), parseISO(lastReadDate)) <= 1;

  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const nextMilestone = milestones.find((m) => m > currentStreak) || 365;
  const progressToNext = currentStreak > 0 ? Math.min((currentStreak / nextMilestone) * 100, 100) : 0;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isActive =
      !!lastReadDate &&
      dateStr <= lastReadDate &&
      differenceInDays(parseISO(lastReadDate), date) <= currentStreak &&
      date <= new Date();
    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
    return { date, dayName: format(date, 'EEE'), dayNum: format(date, 'd'), isActive, isToday };
  });

  const badgeIcon = (type: string) => MILESTONE_ICONS[type] || Trophy;

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <Flame className="h-4 w-4 self-center text-orange-500" />
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">{currentStreak}</span>
            <span className="text-xs font-semibold text-muted-foreground">
              {currentStreak === 1 ? 'day' : 'days'} streak
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Best <span className="font-bold tabular-nums">{longestStreak}</span>
          </span>
        </div>

        <div className="flex gap-1">
          {weekDays.map(({ date, dayNum, isActive, isToday }) => (
            <div
              key={date.toISOString()}
              title={format(date, 'EEEE, MMM d')}
              className={cn(
                'flex h-9 flex-1 items-center justify-center rounded-md border text-[11px] font-bold tabular-nums transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isToday
                    ? 'border-primary/50 bg-muted/40 text-foreground'
                    : 'border-border/60 bg-muted/30 text-muted-foreground'
              )}
            >
              {dayNum}
            </div>
          ))}
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 6).map((badge) => {
              const Icon = badgeIcon(badge.badge_type);
              return (
                <span
                  key={badge.id}
                  title={`${badge.badge_name} · Earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {badge.badge_name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="px-6 py-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Reading streak
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-6xl font-extrabold tabular-nums tracking-tighter',
                    currentStreak > 0 ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {currentStreak}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  {currentStreak === 1 ? 'day' : 'days'} in a row
                </span>
              </div>
            </div>
            <span
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
                isStreakActive
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-border/60 bg-muted/30 text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isStreakActive ? 'bg-primary' : 'bg-muted-foreground/60'
                )}
              />
              {isStreakActive ? 'Active' : 'Idle'}
            </span>
          </div>
        </div>

        {/* Last 7 days */}
        <div className="border-t border-border/60 px-6 py-5 sm:px-8">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">Last 7 days</p>
          <div className="flex gap-1.5">
            {weekDays.map(({ date, dayName, dayNum, isActive, isToday }) => (
              <div key={date.toISOString()} className="flex-1 text-center">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {dayName}
                </p>
                <div
                  title={format(date, 'EEEE, MMM d')}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-colors',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isToday
                        ? 'border-primary/50 bg-muted/40 text-foreground'
                        : 'border-border/60 bg-muted/30 text-muted-foreground'
                  )}
                >
                  {dayNum}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Progress to next milestone */}
      {currentStreak > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">Next milestone</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold tabular-nums text-foreground">{currentStreak}</span> / {nextMilestone} days
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 motion-reduce:transition-none"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {nextMilestone - currentStreak} more {nextMilestone - currentStreak === 1 ? 'day' : 'days'} to unlock the {nextMilestone}-day badge
          </p>
        </section>
      )}

      {/* Stats */}
      <section
        className={cn(
          'grid gap-3',
          lastReadDate ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
          <p className="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight">{currentStreak}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {currentStreak === 1 ? 'day' : 'days'}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best</p>
          <p className="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight">{longestStreak}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {longestStreak === 1 ? 'day' : 'days'}
          </p>
        </div>
        {lastReadDate && (
          <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border/60 bg-muted/30 p-4 text-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last read</p>
            <p className="text-sm font-bold">{format(parseISO(lastReadDate), 'MMM d, yyyy')}</p>
          </div>
        )}
      </section>

      {/* Badges */}
      {badges.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Badges</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
              {badges.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => {
              const Icon = badgeIcon(badge.badge_type);
              return (
                <span
                  key={badge.id}
                  title={`Earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-sm font-semibold"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {badge.badge_name}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* No streak */}
      {currentStreak === 0 && !lastReadDate && (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center">
          <Flame className="mx-auto mb-3 h-6 w-6 text-muted-foreground/40" />
          <h3 className="font-bold">Start your streak</h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Read a little every day to keep the streak going and earn milestone badges.
          </p>
        </div>
      )}
    </div>
  );
}