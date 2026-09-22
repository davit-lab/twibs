import { Link } from 'react-router-dom';
import { TrendingUp, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useReadingStats';
import { displayInitials } from '@/lib/library-content';
import { cn } from '@/lib/utils';
import { formatMinutes } from './utils';

interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_minutes: number;
  reading_days: number;
}

export default function LeaderboardCard() {
  const { data, isLoading } = useLeaderboard();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <div>
          <h3 className="text-sm font-bold leading-tight">Reading leaderboard</h3>
          <p className="text-[11px] text-muted-foreground">Top readers this month</p>
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
        <div className="space-y-1">
          {data.map((entry: LeaderboardEntry, index: number) => (
            <Link
              key={entry.user_id}
              to={entry.username ? `/profile/${entry.username}` : '#'}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40',
                index === 0 && 'bg-muted/30'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold',
                  index === 0
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
              <Avatar className="h-7 w-7 border border-border/60">
                <AvatarImage src={entry.avatar_url || undefined} />
                <AvatarFallback className="text-[9px] font-bold">
                  {displayInitials(entry.display_name || entry.username || 'R')}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {entry.display_name || entry.username || 'Reader'}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{formatMinutes(entry.total_minutes)}</span>
                {' '}&middot; {entry.reading_days}d
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
