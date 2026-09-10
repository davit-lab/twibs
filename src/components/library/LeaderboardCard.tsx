import { Link } from 'react-router-dom';
import { Trophy, TrendingUp, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useReadingStats';
import { displayInitials } from '@/lib/library-content';
import { cn } from '@/lib/utils';

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function LeaderboardCard() {
  const { data, isLoading } = useLeaderboard();

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <TrendingUp className="h-4 w-4 text-primary" />
        </span>
        <div>
          <h3 className="font-bold leading-tight">Reading leaderboard</h3>
          <p className="text-xs text-muted-foreground">Top readers this month</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-8 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Leaderboard unavailable</p>
          <p className="mx-auto mt-1 max-w-[240px] text-xs text-muted-foreground/70">
            Rankings compute server-side and need to be enabled. Reading still counts — your own progress is always tracked.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((entry, index) => (
            <Link
              key={entry.user_id}
              to={entry.username ? `/profile/${entry.username}` : '#'}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40',
                index === 0 && 'border-primary/40 bg-primary/5'
              )}
            >
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                index === 0
                  ? 'bg-primary text-primary-foreground'
                  : index < 3
                  ? 'bg-muted text-muted-foreground'
                  : 'text-muted-foreground'
              )}>
                {index === 0 ? <Trophy className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <Avatar className="h-8 w-8 border border-border/60">
                <AvatarImage src={entry.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] font-bold">
                  {displayInitials(entry.display_name || entry.username || 'R')}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {entry.display_name || entry.username || 'Reader'}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{formatMinutes(entry.total_minutes)}</span>{' '}
                · {entry.reading_days}d
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}