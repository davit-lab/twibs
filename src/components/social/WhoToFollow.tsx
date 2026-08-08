import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, RefreshCw, BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import FollowButton from '@/components/social/FollowButton';
import { useSuggestedUsers } from '@/hooks/useDiscover';

export default function WhoToFollow() {
  const { data: users = [], isLoading } = useSuggestedUsers(4);
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Suggested for you
        </h3>
        {users.length > 0 && (
          <button
            onClick={refresh}
            className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-surface-2 transition-colors"
            aria-label="Refresh suggestions"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          ))
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6 text-center">
            You're all caught up — you follow everyone!
          </p>
        ) : (
          users.map((user) => (
            <div key={user.user_id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/profile/${user.username}`} className="flex-shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-sm">
                    {user.display_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/profile/${user.username}`}
                  className="flex items-center gap-1 font-semibold text-sm hover:text-primary transition-colors min-w-0"
                >
                  <span className="truncate">{user.display_name}</span>
                  {user.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  {user.username}
                  {user.follower_count > 0 && (
                    <> · {user.follower_count.toLocaleString()} followers</>
                  )}
                </p>
              </div>
              <FollowButton
                targetUserId={user.user_id}
                targetUsername={user.username}
                size="sm"
                onFollowChange={refresh}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
