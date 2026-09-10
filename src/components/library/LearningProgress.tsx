import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Zap, Timer, BookMarked, Flame } from 'lucide-react';
import { useReadingStats } from '@/hooks/useReadingStats';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { cn } from '@/lib/utils';

export default function LearningProgress({ userId }: { userId?: string }) {
  const { data: stats, isLoading } = useReadingStats(userId);
  const { streak } = useReadingStreak(userId);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-2 w-full rounded-full mb-5" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-14 flex-1 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
        Reading time accumulates as you read. Check back after your first session.
      </div>
    );
  }

  const { level, intoLevel, percent } = stats.level;
  const maxMinutes = Math.max(...stats.week.map((d) => d.minutes), 1);
  const hours = Math.floor(stats.totalMinutes / 60);
  const mins = stats.totalMinutes % 60;

  const metrics = [
    {
      icon: Timer,
      label: 'Total time',
      value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
      accent: 'bg-primary/10 text-primary',
    },
    {
      icon: BookMarked,
      label: 'Sessions',
      value: stats.totalSessions,
      accent: 'bg-amber-500/10 text-amber-500',
    },
    {
      icon: Flame,
      label: 'Streak',
      value: `${streak?.current_streak || 0} days`,
      accent: 'bg-orange-500/10 text-orange-500',
    },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Zap className="h-4 w-4 text-primary" />
        </span>
        <div>
          <h3 className="font-bold leading-tight">Learning progress</h3>
          <p className="text-xs text-muted-foreground">Level {level} · {stats.xp} XP lifetime</p>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{intoLevel} XP into level {level}</span>
        <span className="font-semibold text-primary">{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5 bg-muted/60" />

      <div className="my-4 grid grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
            <span className={cn('mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg', m.accent)}>
              <m.icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold leading-tight">{m.value}</p>
            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      <p className="mb-2 text-xs font-semibold text-muted-foreground">This week</p>
      <div className="flex gap-1.5">
        {stats.week.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1" title={`${day.label} · ${day.minutes} min`}>
            <div className="flex h-14 w-full items-end rounded-lg bg-muted/40">
              <div
                className={cn(
                  'w-full rounded-lg transition-all duration-500',
                  day.minutes > 0 ? 'bg-primary' : 'bg-transparent'
                )}
                style={{ height: day.minutes > 0 ? `${Math.max(18, (day.minutes / maxMinutes) * 100)}%` : '2px' }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}