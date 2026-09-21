import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useReadingStats } from '@/hooks/useReadingStats';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ShimmerBar } from './StreakLoading';

export function StreakStatus({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { todayReading, loading } = useReadingStreak(targetUserId);

  if (loading) {
    return <ShimmerBar className="h-10 w-full max-w-xs" />;
  }

  if (todayReading?.hasRead) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-sm font-medium text-foreground">Read today</span>
        <span className="text-sm text-muted-foreground">
          {todayReading.minutes} min &middot; {todayReading.chapters} chapters
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-1.5 rounded-full border border-primary" />
      <span className="text-sm font-medium text-muted-foreground">Not read today</span>
    </div>
  );
}

interface ReadingRecordsProps {
  userId?: string;
}

export function ReadingRecords({ userId }: ReadingRecordsProps) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { streak } = useReadingStreak(targetUserId);
  const { data: stats } = useReadingStats(targetUserId);

  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;

  if (currentStreak === 0 && (!stats || stats.totalMinutes === 0)) {
    return null;
  }

  const records = [
    { label: 'Current', value: `${currentStreak}`, sub: 'days', highlight: true },
    { label: 'Personal best', value: `${longestStreak}`, sub: 'days', highlight: false },
    { label: 'Total read', value: stats ? `${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m` : '0m', sub: null, highlight: false },
    { label: 'Reading days', value: `${stats?.totalSessions || 0}`, sub: null, highlight: false },
  ];

  return (
    <div className="grid grid-cols-2 gap-px rounded-xl border border-border/60 bg-border/60 md:grid-cols-4">
      {records.map((record) => (
        <div
          key={record.label}
          className="bg-card px-4 py-3 text-center"
        >
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums tracking-tight',
              record.highlight ? 'text-primary' : 'text-foreground'
            )}
          >
            {record.value}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {record.label}
          </p>
          {record.sub && (
            <p className="text-[10px] text-muted-foreground/60">{record.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
