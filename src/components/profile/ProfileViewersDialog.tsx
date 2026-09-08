import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeCheck, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ViewerRow {
  id: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

export default function ProfileViewersDialog({
  open,
  onOpenChange,
  targetUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
}) {
  const [viewers, setViewers] = useState<ViewerRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setViewers(null);
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('profile_views')
        .select('id, created_at, profiles:viewer_id(username, display_name, avatar_url, is_verified)')
        .eq('target_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('Profile viewers error:', error);
      } else {
        setViewers(
          (data || []).map((row: any) => ({
            id: row.id,
            created_at: row.created_at,
            profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
          }))
        );
      }
      setLoading(false);
    })();
  }, [open, targetUserId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-primary" />
            Profile viewers
          </DialogTitle>
          <DialogDescription>
            People who visited your profile. Visitors using Ghost Mode don't appear here.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading viewers…</p>
          ) : !viewers || viewers.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Eye className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No viewers yet</p>
              <p className="text-xs text-muted-foreground mt-1">When people visit your profile, they'll show up here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {viewers.map((viewer) => (
                <Link
                  key={viewer.id}
                  to={`/profile/${viewer.profiles.username}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                  onClick={() => onOpenChange(false)}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={viewer.profiles.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-xs font-semibold">
                      {viewer.profiles.display_name?.slice(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1 truncate">
                      {viewer.profiles.display_name}
                      {viewer.profiles.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">@{viewer.profiles.username}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(viewer.created_at), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}