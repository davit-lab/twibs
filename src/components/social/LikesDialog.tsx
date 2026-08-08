import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BadgeCheck, Loader2, Users } from 'lucide-react';

type LikeSource = 'stars' | 'interest_post_likes';

interface LikedByUser {
  user_id: string;
  created_at: string;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

interface LikesDialogProps {
  postId: string;
  source: LikeSource;
  title: string;
  emptyLabel: string;
  signInLabel?: string;
  trigger: React.ReactNode;
}

export default function LikesDialog({
  postId,
  source,
  title,
  emptyLabel,
  signInLabel,
  trigger,
}: LikesDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['likers', source, postId],
    queryFn: async (): Promise<LikedByUser[]> => {
      const { data: likes, error } = await (supabase as any)
        .from(source)
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const ids: string[] = (likes || []).map((l: any) => l.user_id);
      if (ids.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', ids);

      if (profileError) throw profileError;

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      return (likes || []).map((l: any) => ({
        user_id: l.user_id,
        created_at: l.created_at,
        profile: profileMap.get(l.user_id) || null,
      }));
    },
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            People who liked this post
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 px-6 max-h-[420px] overflow-y-auto space-y-0.5">
          {!user && signInLabel ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{signInLabel}</p>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Couldn't load the list. Please try again.
            </p>
          ) : data.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            data.map(({ user_id, profile }) => (
              <Link
                key={user_id}
                to={`/profile/${profile?.username || user_id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition-colors"
              >
                <UserAvatar
                  userId={user_id}
                  avatarUrl={profile?.avatar_url}
                  displayName={profile?.display_name || 'User'}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">
                      {profile?.display_name || 'Unknown'}
                    </span>
                    {profile?.is_verified && (
                      <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    @{profile?.username || 'unknown'}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
