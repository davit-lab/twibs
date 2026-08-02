import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import FollowButton from './FollowButton';
import { BadgeCheck } from 'lucide-react';

interface UserItem {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  privacy: 'public' | 'private';
}

interface FollowersFollowingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  type: 'followers' | 'following';
  username: string;
}

export default function FollowersFollowingModal({
  open,
  onOpenChange,
  userId,
  type,
  username,
}: FollowersFollowingModalProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;

    const fetchUsers = async () => {
      setLoading(true);
      
      try {
        let userIds: string[] = [];
        
        if (type === 'followers') {
          // Get users who follow this profile
          const { data: followsData, error: followsError } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('following_id', userId)
            .eq('status', 'accepted');

          if (followsError) throw followsError;
          userIds = (followsData || []).map(f => f.follower_id);
        } else {
          // Get users this profile follows
          const { data: followsData, error: followsError } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', userId)
            .eq('status', 'accepted');

          if (followsError) throw followsError;
          userIds = (followsData || []).map(f => f.following_id);
        }

        if (userIds.length === 0) {
          setUsers([]);
          setLoading(false);
          return;
        }

        // Fetch profiles for these users
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified, privacy')
          .in('user_id', userIds);

        if (profilesError) throw profilesError;

        const userList: UserItem[] = (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          is_verified: p.is_verified || false,
          privacy: p.privacy || 'public',
        }));

        setUsers(userList);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [open, userId, type]);

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {type === 'followers' ? 'Followers' : 'Following'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] -mx-6 px-6">
          {loading ? (
            <div className="space-y-4 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-24 rounded-md" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {type === 'followers' 
                ? `@${username} has no followers yet`
                : `@${username} isn't following anyone yet`
              }
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {users.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <Link 
                    to={`/profile/${u.username}`}
                    onClick={() => onOpenChange(false)}
                    className="shrink-0"
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={u.avatar_url || undefined} alt={u.display_name} />
                      <AvatarFallback className="bg-muted text-foreground">
                        {getInitials(u.display_name)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  
                  <Link 
                    to={`/profile/${u.username}`}
                    onClick={() => onOpenChange(false)}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-semibold truncate">{u.display_name}</span>
                      {u.is_verified && (
                        <div className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary shrink-0">
                          <BadgeCheck className="h-2.5 w-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">@{u.username}</p>
                  </Link>

                  {user && user.id !== u.user_id && (
                    <FollowButton
                      targetUserId={u.user_id}
                      targetUsername={u.username}
                      isPrivateAccount={u.privacy === 'private'}
                      size="sm"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
