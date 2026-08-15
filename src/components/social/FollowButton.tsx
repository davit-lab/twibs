import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, UserCheck, UserMinus, Clock, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type FollowStatus = 'none' | 'pending' | 'following';

interface FollowButtonProps {
  targetUserId: string;
  targetUsername: string;
  isPrivateAccount?: boolean;
  className?: string;
  onFollowChange?: () => void;
  onFollowCreated?: () => void;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export default function FollowButton({
  targetUserId,
  targetUsername,
  isPrivateAccount = false,
  className,
  onFollowChange,
  onFollowCreated,
  size = 'default',
}: FollowButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<FollowStatus>('none');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const checkFollowStatus = async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('status')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

      if (error) {
        console.error('Error checking follow status:', error);
      } else if (data) {
        setStatus(data.status === 'pending' ? 'pending' : 'following');
      } else {
        setStatus('none');
      }
      setLoading(false);
    };

    checkFollowStatus();
  }, [user, targetUserId]);

  const handleFollow = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to follow users.',
      });
      return;
    }

    setActionLoading(true);

    try {
      // For private accounts, set status to pending; otherwise accepted
      const newStatus = isPrivateAccount ? 'pending' : 'accepted';

      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: user.id,
          following_id: targetUserId,
          status: newStatus,
        });

      if (error) {
        const e = error as { code?: string; message?: string };
        if (e.code === '23505') {
          // Already following
          toast({
            title: 'Already following',
            description: `You're already following @${targetUsername}`,
          });
        } else {
          throw error;
        }
      } else {
        setStatus(isPrivateAccount ? 'pending' : 'following');
        toast({
          title: isPrivateAccount ? 'Follow request sent' : 'Following!',
          description: isPrivateAccount
            ? `Your request to follow @${targetUsername} has been sent.`
            : `You are now following @${targetUsername}`,
        });
        onFollowChange?.();
        onFollowCreated?.();
      }
    } catch (error: unknown) {
      console.error('Follow error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to follow user. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!user) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);

      if (error) throw error;

      setStatus('none');
      toast({
        title: status === 'pending' ? 'Request cancelled' : 'Unfollowed',
        description: status === 'pending'
          ? `Your follow request to @${targetUsername} was cancelled.`
          : `You unfollowed @${targetUsername}`,
      });
      onFollowChange?.();
    } catch (error: unknown) {
      console.error('Unfollow error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to unfollow user. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const pill = 'rounded-full font-semibold';

  if (loading) {
    return (
      <Button variant="outline" size={size} disabled className={cn(pill, className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Don't show follow button for own profile
  if (!user || user.id === targetUserId) {
    return null;
  }

  if (status === 'following') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleUnfollow}
        disabled={actionLoading}
        className={cn(
          pill,
          'group border-2 border-border/80 bg-transparent text-muted-foreground hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive',
          className
        )}
      >
        {actionLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserCheck className="h-4 w-4 group-hover:hidden" />
        )}
        <UserMinus className="h-4 w-4 hidden group-hover:inline" />
        <span className="group-hover:hidden">Following</span>
        <span className="hidden group-hover:inline">Unfollow</span>
      </Button>
    );
  }

  if (status === 'pending') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleUnfollow}
        disabled={actionLoading}
        className={cn(
          pill,
          'group border-2 border-border/80 bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground',
          className
        )}
      >
        {actionLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Clock className="h-4 w-4 group-hover:hidden" />
        )}
        <X className="h-4 w-4 hidden group-hover:inline" />
        <span className="group-hover:hidden">Pending</span>
        <span className="hidden group-hover:inline">Cancel</span>
      </Button>
    );
  }

  return (
    <Button
      size={size}
      onClick={handleFollow}
      disabled={actionLoading}
      className={cn(
        pill,
        'bg-foreground text-background shadow-sm hover:bg-foreground/90 active:shadow-none',
        className
      )}
    >
      {actionLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      Follow
    </Button>
  );
}
