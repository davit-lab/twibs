import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export function useMessageReactions(conversationId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Map<string, MessageReaction[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Fetch all reactions for messages in this conversation
  const fetchReactions = useCallback(async () => {
    if (!conversationId || !user) {
      setReactions(new Map());
      setLoading(false);
      return;
    }

    try {
      // First get all message IDs in this conversation
      const { data: messages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId);

      if (!messages?.length) {
        setReactions(new Map());
        setLoading(false);
        return;
      }

      const messageIds = messages.map(m => m.id);

      // Now get reactions for these messages
      const { data: reactionsData, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw error;

      // Group reactions by message_id
      const reactionsMap = new Map<string, MessageReaction[]>();
      (reactionsData || []).forEach((reaction) => {
        const existing = reactionsMap.get(reaction.message_id) || [];
        existing.push(reaction);
        reactionsMap.set(reaction.message_id, existing);
      });

      setReactions(reactionsMap);
    } catch (error) {
      console.error('Error fetching reactions:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Subscribe to reaction changes
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as MessageReaction;
            setReactions(prev => {
              const updated = new Map(prev);
              const existing = updated.get(newReaction.message_id) || [];
              if (!existing.find(r => r.id === newReaction.id)) {
                updated.set(newReaction.message_id, [...existing, newReaction]);
              }
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldReaction = payload.old as MessageReaction;
            setReactions(prev => {
              const updated = new Map(prev);
              const existing = updated.get(oldReaction.message_id) || [];
              updated.set(
                oldReaction.message_id,
                existing.filter(r => r.id !== oldReaction.id)
              );
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const addReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });

      if (error) {
        // If already exists, remove it (toggle behavior)
        if (error.code === '23505') {
          await removeReaction(messageId, emoji);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const removeReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  const getReactionsForMessage = (messageId: string): ReactionGroup[] => {
    const messageReactions = reactions.get(messageId) || [];
    const groups = new Map<string, { count: number; users: string[]; hasReacted: boolean }>();

    messageReactions.forEach((reaction) => {
      const existing = groups.get(reaction.emoji) || { count: 0, users: [], hasReacted: false };
      existing.count++;
      existing.users.push(reaction.user_id);
      if (reaction.user_id === user?.id) {
        existing.hasReacted = true;
      }
      groups.set(reaction.emoji, existing);
    });

    return Array.from(groups.entries()).map(([emoji, data]) => ({
      emoji,
      ...data,
    }));
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const messageReactions = reactions.get(messageId) || [];
    const existingReaction = messageReactions.find(
      r => r.emoji === emoji && r.user_id === user?.id
    );

    if (existingReaction) {
      await removeReaction(messageId, emoji);
    } else {
      await addReaction(messageId, emoji);
    }
  };

  return {
    reactions,
    loading,
    addReaction,
    removeReaction,
    toggleReaction,
    getReactionsForMessage,
  };
}
