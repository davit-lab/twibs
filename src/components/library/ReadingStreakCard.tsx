import { Flame, Trophy, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReadingStreak, BADGE_INFO } from '@/hooks/useReadingStreak';
import { format, differenceInDays, parseISO } from 'date-fns';

interface ReadingStreakCardProps {
  userId?: string;
  compact?: boolean;
}

export default function ReadingStreakCard({ userId, compact = false }: ReadingStreakCardProps) {
  const { streak, badges, loading } = useReadingStreak(userId);

  if (loading) {
    return (
      <Card className={compact ? 'border-0 shadow-none bg-transparent' : 'border-border/60'}>
        <CardHeader className={compact ? 'p-0 pb-3' : 'pb-3'}>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className={compact ? 'p-0' : ''}>
          <Skeleton className="h-20 w-full rounded-2xl" />
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
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 flex items-center justify-center">
            <Flame className="h-5 w-5 text-orange-500" />
          </div>
          Reading Streak
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Streak Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-5 rounded-2xl text-center border ${isStreakActive ? 'bg-gradient-to-br from-orange-500/10 to-amber-500/5 border-orange-500/20' : 'bg-muted/50 border-border/60'}`}>
            <div className="flex items-center justify-center gap-1 mb-2">
              <Flame className={`h-7 w-7 ${isStreakActive ? 'text-orange-500 animate-pulse' : 'text-muted-foreground'}`} />
            </div>
            <p className={`text-4xl font-bold ${isStreakActive ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {currentStreak}
            </p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Current Streak</p>
          </div>
          <div className="p-5 rounded-2xl bg-muted/50 text-center border border-border/60">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Trophy className="h-7 w-7 text-amber-500" />
            </div>
            <p className="text-4xl font-bold text-amber-500">{longestStreak}</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Longest Streak</p>
          </div>
        </div>

        {/* Progress to next milestone */}
        {currentStreak > 0 && (
          <div className="space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-semibold">Progress to {nextMilestone}-day badge</span>
              <span className="font-bold text-primary">{currentStreak}/{nextMilestone} days</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-700 rounded-full"
                style={{ width: `${Math.min(progressToNext, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Last read */}
        {lastReadDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">Last read: {format(parseISO(lastReadDate), 'MMMM d, yyyy')}</span>
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Earned Badges</p>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => {
                const info = BADGE_INFO[badge.badge_type];
                return (
                  <Badge
                    key={badge.id}
                    variant="secondary"
                    className="text-sm py-1.5 rounded-xl font-semibold"
                    title={`Earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
                  >
                    <span className="mr-1">{info?.icon || <Trophy className="h-3 w-3" />}</span>
                    {badge.badge_name}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* No streak message */}
        {currentStreak === 0 && !lastReadDate && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Flame className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Start reading to build your streak
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
