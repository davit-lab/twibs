import { Users } from 'lucide-react';

export interface FriendReadingActivity {
  displayName: string;
  username?: string;
  avatarUrl?: string;
  action: 'reading' | 'finished' | 'started' | 'added' | 'liked' | 'recommended';
  bookId: string;
  bookTitle: string;
  coverUrl?: string;
  progressLabel?: string;
  at: string;
}

interface FriendsReadingSectionProps {
  activities: FriendReadingActivity[];
}

function activityLabel(action: FriendReadingActivity['action']) {
  switch (action) {
    case 'reading':
      return 'is reading';
    case 'finished':
      return 'finished';
    case 'started':
      return 'started reading';
    case 'added':
      return 'added to library';
    case 'liked':
      return 'liked';
    case 'recommended':
      return 'recommended';
  }
}

export default function FriendsReadingSection({ activities }: FriendsReadingSectionProps) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Social
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Friends are reading</h2>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border/60 bg-card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-muted/30 text-muted-foreground">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">No friend activity yet</h3>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              When people you follow read, finish, or recommend books, their activity will appear
              here.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
          {activities.map((activity) => (
            <div key={`${activity.username ?? activity.displayName}-${activity.bookId}-${activity.at}`} className="flex items-center gap-3 p-4">
              <span className="h-9 w-9 rounded-full bg-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="font-semibold">{activity.displayName}</span>{' '}
                  <span className="text-muted-foreground">{activityLabel(activity.action)}</span>{' '}
                  <span className="font-medium text-foreground">{activity.bookTitle}</span>
                </p>
                {activity.progressLabel && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{activity.progressLabel}</p>
                )}
              </div>
              <span className="shrink-0 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                {activity.at}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}