import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CallHistoryItem {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  // Direction relative to current user
  direction: 'incoming' | 'outgoing';
  // Duration in seconds
  duration: number | null;
  // Other user's profile
  otherUser: {
    user_id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
}

export function useCallHistory() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCallHistory = useCallback(async () => {
    if (!user) {
      setCalls([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch calls where user is either caller or receiver
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get unique other user IDs
      const otherUserIds = [...new Set((data || []).map(call => 
        call.caller_id === user.id ? call.receiver_id : call.caller_id
      ))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', otherUserIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      // Transform data
      const callsWithDetails: CallHistoryItem[] = (data || []).map(call => {
        const isOutgoing = call.caller_id === user.id;
        const otherUserId = isOutgoing ? call.receiver_id : call.caller_id;
        
        // Calculate duration
        let duration: number | null = null;
        if (call.started_at && call.ended_at) {
          duration = Math.round(
            (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000
          );
        }

        return {
          ...call,
          direction: isOutgoing ? 'outgoing' : 'incoming',
          duration,
          otherUser: profileMap.get(otherUserId) || null,
        } as CallHistoryItem;
      });

      setCalls(callsWithDetails);
    } catch (error) {
      console.error('Error fetching call history:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCallHistory();
  }, [fetchCallHistory]);

  // Subscribe to new calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('call-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_sessions',
        },
        () => {
          // Refetch on any change
          fetchCallHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchCallHistory]);

  const deleteCall = async (callId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('call_sessions')
        .delete()
        .eq('id', callId)
        .eq('caller_id', user.id); // Only caller can delete

      if (error) throw error;
      
      setCalls(prev => prev.filter(c => c.id !== callId));
    } catch (error) {
      console.error('Error deleting call:', error);
    }
  };

  return {
    calls,
    loading,
    fetchCallHistory,
    deleteCall,
  };
}
