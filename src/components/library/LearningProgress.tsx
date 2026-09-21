import { Progress } from '@/components/ui/progress';
import { Timer, BookMarked } from 'lucide-react';
import { useReadingStats } from '@/hooks/useReadingStats';
import { cn } from '@/lib/utils';
import { ShimmerBar, ShimmerGrid } from '@/components/streak/StreakLoading';

export default function LearningProgress({ userId }: { userId?: string }) {
  const { data: stats, isLoading } = useReadingStats(userId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="mb-4 space-y-2">
          <ShimmerBar className="h-4 w-32" />
          <ShimmerBar className="h-2 w-full" />
        </div>
        <ShimmerGrid columns={7} cellClass="h-14" delay={0.1} />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const hours = Math.floor(stats.totalMinutes / 60);
  const mins = stats.totalMinutes % 60;
  const maxMinutes = Math.max(...stats.week.map((d) => d.minutes), 1);

  const metrics = [
    {
      icon: Timer,
      label: 'Total time',
      value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    },
    {
      icon: BookMarked,
      label: 'Chapters',
      value: stats.totalChapters,
    },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
          <BookMarked className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <h3 className="text-sm font-bold leading-tight">Reading stats</h3>
          <p className="text-[11px] text-muted-foreground">
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} &middot; {stats.totalSessions} sessions
          </p>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Level {stats.level.level} &middot; {stats.level.xp} XP
        </span>
        <span className="font-semibold text-primary">{stats.level.percent}%</span>
      </div>
      <Progress value={stats.level.percent} className="h-1 bg-muted/60" />

      <div className="my-4 grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
            <p className="text-lg font-bold leading-tight">{m.value}</p>
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">This week</p>
      <div className="flex items-end gap-1">
        {stats.week.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-12 w-full items-end rounded-sm bg-muted/40">
              <div
                className={cn(
                  'w-full rounded-sm transition-all duration-500',
                  day.minutes > 0 ? 'bg-primary/70' : 'bg-transparent'
                )}
                style={{ height: day.minutes > 0 ? `${Math.max(12, (day.minutes / maxMinutes) * 100)}%` : '1px' }}
              />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
