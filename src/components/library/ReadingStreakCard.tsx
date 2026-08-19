import { Flame, Trophy, Calendar, Zap, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReadingStreak, BADGE_INFO } from '@/hooks/useReadingStreak';
import { format, differenceInDays, parseISO, subDays } from 'date-fns';

interface ReadingStreakCardProps {
  userId?: string;
  compact?: boolean;
}

export default function ReadingStreakCard({ userId, compact = false }: ReadingStreakCardProps) {
  const { streak, badges, loading } = useReadingStreak(userId);

  if (loading) {
    return (
      <Card className={compact ? 'border-0 shadow-none bg-transparent' : 'border-border/60'}>
        <CardContent className={compact ? 'p-0' : 'p-6'}>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;
  const lastReadDate = streak?.last_read_date;

  const isStreakActive = lastReadDate
    ? differenceInDays(new Date(), parseISO(lastReadDate)) <= 1
    : false;

  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const nextMilestone = milestones.find(m => m > currentStreak) || 365;
  const progressToNext = currentStreak > 0 ? (currentStreak / nextMilestone) * 100 : 0;

  // Generate 7-day mini calendar for last week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isActive = lastReadDate && dateStr <= lastReadDate &&
      differenceInDays(parseISO(lastReadDate), date) <= 1 &&
      differenceInDays(date, parseISO(lastReadDate)) <= 1;
    return { date, dateStr, dayName: format(date, 'EEE'), dayNum: format(date, 'd'), isActive };
  });

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl font-semibold text-sm ${isStreakActive ? 'bg-gradient-to-r from-orange-500/15 to-amber-500/10 text-orange-500 border border-orange-500/20' : 'bg-muted text-muted-foreground border border-border/60'}`}>
            <Flame className={`h-4 w-4 ${isStreakActive ? 'animate-pulse' : ''}`} />
            <span className="font-bold">{currentStreak}</span>
            <span className="text-xs">day streak</span>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-muted text-muted-foreground font-semibold text-sm border border-border/60">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="font-bold">{longestStreak}</span>
            <span className="text-xs">best</span>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 5).map((badge) => {
              const info = BADGE_INFO[badge.badge_type];
              return (
                <Badge
                  key={badge.id}
                  variant="secondary"
                  className="text-xs font-semibold rounded-xl"
                  title={`${badge.badge_name} - Earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
                >
                  {info?.icon || <Trophy className="h-3 w-3" />} {badge.badge_name}
                </Badge>
              );
            })}
            {badges.length > 5 && (
              <Badge variant="outline" className="text-xs font-bold rounded-xl">
                +{badges.length - 5} more
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Streak Section */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br from-orange-500/10 to-amber-500/5 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-gradient-to-tr from-red-500/8 to-orange-500/5 blur-3xl" />

        <div className="relative p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Reading Streak</h2>
              <p className="text-sm text-muted-foreground">Keep the flame alive</p>
            </div>
          </div>

          <div className="flex items-end gap-8 mb-6">
            <div>
              <p className={`text-6xl font-black tracking-tighter ${isStreakActive ? 'bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent' : 'text-muted-foreground'}`}>
                {currentStreak}
              </p>
              <p className="text-sm font-semibold text-muted-foreground mt-1">
                {isStreakActive ? 'days in a row' : 'day streak'}
              </p>
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="font-semibold">{longestStreak}</span>
                <span>best</span>
              </div>
            </div>
          </div>

          {/* 7-day mini calendar */}
          <div className="flex gap-1.5">
            {weekDays.map(({ date, dayName, dayNum, isActive }) => (
              <div key={date.toISOString()} className="flex-1 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">{dayName}</p>
                <div className={`aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-muted/50 text-muted-foreground'
                }`}>
                  {dayNum}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Progress to next milestone */}
      {currentStreak > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Next milestone</p>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{currentStreak} / {nextMilestone} days</span>
            <span className="text-xs font-bold text-primary">{Math.round(progressToNext)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-700 rounded-full"
              style={{ width: `${Math.min(progressToNext, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {nextMilestone - currentStreak} more days to earn the {nextMilestone}-day badge
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mx-auto mb-2">
            <Zap className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-2xl font-bold">{currentStreak}</p>
          <p className="text-xs text-muted-foreground font-medium">Current</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold">{longestStreak}</p>
          <p className="text-xs text-muted-foreground font-medium">Best</p>
        </div>
      </div>

      {/* Last read */}
      {lastReadDate && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">Last read: {format(parseISO(lastReadDate), 'MMM d, yyyy')}</span>
        </div>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <p className="text-sm font-semibold mb-3">Earned Badges</p>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => {
              const info = BADGE_INFO[badge.badge_type];
              return (
                <div
                  key={badge.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/50 border border-border/60 text-sm font-semibold"
                  title={`Earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
                >
                  <span>{info?.icon || '🏆'}</span>
                  <span>{badge.badge_name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No streak message */}
      {currentStreak === 0 && !lastReadDate && (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-8 py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
            <Flame className="h-8 w-8 text-orange-500/40" />
          </div>
          <h3 className="text-lg font-bold mb-1">Start your streak</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Read every day to build your streak and earn badges
          </p>
        </div>
      )}
    </div>
  );
}
