import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FollowRequest {
  id: string;
  follower_id: string;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

interface FollowRequestsProps {
  onRequestHandled?: () => void;
}

export default function FollowRequests({ onRequestHandled }: FollowRequestsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('id, follower_id, created_at')
        .eq('following_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching follow requests:', error);
      } else {
        // Fetch profiles separately (follows has no FK to profiles)
        const rows = (data || []) as { id: string; follower_id: string; created_at: string }[];
        let transformedData = rows.map(item => ({ ...item, profiles: null })) as FollowRequest[];
        const profileIds = [...new Set(rows.map(r => r.follower_id))];
        if (profileIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url, is_verified')
            .in('user_id', profileIds);
          const profilesMap = new Map((profiles || []).map(p => [p.user_id, p]));
          transformedData = rows.map(item => ({
            ...item,
            profiles: profilesMap.get(item.follower_id) || null,
          })) as FollowRequest[];
        }
        setRequests(transformedData);
      }
      setLoading(false);
    };

    fetchRequests();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('follow-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${user.id}`,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleRequest = async (requestId: string, accept: boolean) => {
    setProcessingIds(prev => new Set(prev).add(requestId));

    try {
      if (accept) {
        const { error } = await supabase
          .from('follows')
          .update({ status: 'accepted' })
          .eq('id', requestId);

        if (error) throw error;

        toast({
          title: 'Request accepted',
          description: 'The user can now see your posts.',
        });
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('id', requestId);

        if (error) throw error;

        toast({
          title: 'Request declined',
          description: 'The follow request was declined.',
        });
      }

      setRequests(prev => prev.filter(r => r.id !== requestId));
      onRequestHandled?.();
    } catch (error: any) {
      console.error('Error handling follow request:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to process request. Please try again.',
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Follow Requests</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Follow Requests</CardTitle>
        <CardDescription>{requests.length} pending request{requests.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((request) => (
          <div key={request.id} className="flex items-center gap-3">
            <Link to={`/profile/${request.profiles.username}`}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={request.profiles.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-sm">
                  {getInitials(request.profiles.display_name)}
                </AvatarFallback>
              </Avatar>
            </Link>
            
            <div className="flex-1 min-w-0">
              <Link 
                to={`/profile/${request.profiles.username}`}
                className="font-medium hover:underline block truncate"
              >
                {request.profiles.display_name}
              </Link>
              <p className="text-sm text-muted-foreground truncate">
                @{request.profiles.username}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 hover:bg-success hover:text-success-foreground hover:border-success"
                onClick={() => handleRequest(request.id, true)}
                disabled={processingIds.has(request.id)}
              >
                {processingIds.has(request.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                onClick={() => handleRequest(request.id, false)}
                disabled={processingIds.has(request.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}