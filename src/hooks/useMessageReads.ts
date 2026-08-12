import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageReader {
  user_id: string;
  read_at: string;
  display_name: string;
  avatar_url: string | null;
}

export function useMessageReads(conversationId: string | null) {
  const { user } = useAuth();
  const [readsByMessage, setReadsByMessage] = useState<Record<string, MessageReader[]>>({});

  const fetchReadsForMessage = useCallback(async (messageIds: string | string[]) => {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    const realIds = ids.filter((id) => !id.startsWith('temp-'));
    if (realIds.length === 0 || !conversationId) return;

    try {
      const { data, error } = await supabase
        .from('message_reads')
        .select('message_id, user_id, read_at')
        .in('message_id', realIds);

      if (error) throw error;

      const userIds = [...new Set((data || []).map(r => r.user_id))];
      let profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);
        profileMap = new Map(
          (profiles || []).map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
        );
      }

      const next: Record<string, MessageReader[]> = {};
      for (const row of (data || [])) {
        const profile = profileMap.get(row.user_id);
        if (!next[row.message_id]) next[row.message_id] = [];
        next[row.message_id].push({
          user_id: row.user_id,
          read_at: row.read_at,
          display_name: profile?.display_name || 'User',
          avatar_url: profile?.avatar_url || null,
        });
      }
      setReadsByMessage(prev => ({ ...prev, ...next }));
    } catch (error) {
      console.error('Error fetching message reads:', error);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`message-reads-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        async (payload) => {
          const read = payload.new as { message_id: string; user_id: string; read_at: string };
          if (read.user_id === user.id) return;
          await fetchReadsForMessage([read.message_id]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user, fetchReadsForMessage]);

  return { readsByMessage, fetchReadsForMessage };
}
