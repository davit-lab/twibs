import { BookOpen, Flame, CalendarDays, Clock } from 'lucide-react';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useReadingStats } from '@/hooks/useReadingStats';
import WeeklyRhythm from '@/components/streak/WeeklyRhythm';
import StreakMilestones from '@/components/streak/StreakMilestones';
import ReadingBadges from '@/components/streak/ReadingBadges';
import ReadingActivity from '@/components/streak/ReadingActivity';
import StreakEmptyState from '@/components/streak/StreakEmptyState';
import { StreakCardLoading } from '@/components/streak/StreakLoading';
import { format } from 'date-fns';

interface ReadingStreakCardProps {
  userId?: string;
  compact?: boolean;
}

function formatMinutes(total: number) {
  const m = total || 0;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function ReadingStreakCard({ userId, compact = false }: ReadingStreakCardProps) {
  const { streak, badges, todayReading, loading } = useReadingStreak(userId);
  const { data: stats } = useReadingStats(userId);
  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;

  if (loading) {
    return <StreakCardLoading compact={compact} />;
  }

  if (currentStreak === 0) {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-border/60 bg-card">
        <StreakEmptyState isLoggedIn={!!userId} />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <BookOpen className="h-4 w-4 self-center text-primary/60" />
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">{currentStreak}</span>
            <span className="text-xs font-semibold text-muted-foreground">
              {currentStreak === 1 ? 'day' : 'days'} streak
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Best <span className="font-bold tabular-nums">{longestStreak}</span>
          </span>
        </div>

        <WeeklyRhythm userId={userId} />

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 5).map((badge) => (
              <span
                key={badge.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                title={`${badge.badge_name} · ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
              >
                {badge.badge_name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Reading habits</p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Your reading rhythm</h2>
          <p className="text-sm text-muted-foreground">
            {todayReading?.hasRead
              ? `Read today · ${todayReading.minutes} min · ${todayReading.chapters} chapters`
              : 'Read today to continue your streak'}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Current streak</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{currentStreak}</span>
            <span className="text-xs text-muted-foreground">{currentStreak === 1 ? 'day' : 'days'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Best streak</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{longestStreak}</span>
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Reading days</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {stats?.totalSessions ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">sessions</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Time read</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatMinutes(stats?.totalMinutes ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">total</span>
          </div>
        </div>
      </div>

      {/* This week */}
      <div>
        <h3 className="mb-3 text-sm font-semibold tracking-tight">This week</h3>
        <WeeklyRhythm userId={userId} />
      </div>

      {/* Calendar + milestones/badges */}
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Reading calendar</h3>
          <p className="mt-1 text-xs text-muted-foreground">Minutes read per day this month</p>
          <div className="mt-3">
            <ReadingActivity userId={userId} />
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-tight">Milestones</h3>
            <StreakMilestones userId={userId} />
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-tight">Badges</h3>
            <ReadingBadges userId={userId} />
          </div>
        </div>
      </div>
    </div>
  );
}
