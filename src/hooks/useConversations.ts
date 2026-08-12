import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ConversationType = 'dm' | 'group' | 'community';
export type ParticipantRole = 'owner' | 'admin' | 'member';

export interface Participant {
  user_id: string;
  last_read_at: string | null;
  is_typing: boolean;
  role: string;
  muted: boolean;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
    last_seen_at: string | null;
  } | null;
}

interface LastMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  type: ConversationType;
  join_code: string | null;
  owner_id: string | null;
  updated_at: string;
  chat_wallpaper: string | null;
  participants: Participant[];
  participant_count: number;
  muted: boolean;
  my_role: ParticipantRole;
  last_message: LastMessage | null;
  unread_count: number;
}

interface RawConversation {
  id: string;
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  type: string;
  join_code: string | null;
  owner_id: string | null;
  updated_at: string;
  chat_wallpaper: string | null;
  conversation_participants?: RawParticipant[];
}

interface RawParticipant {
  user_id: string;
  last_read_at: string | null;
  is_typing: boolean;
  role: string;
  muted: boolean;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
    last_seen_at: string | null;
  } | { username: string; display_name: string; avatar_url: string | null; is_verified: boolean; last_seen_at: string | null }[] | null;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!user) return;

    try {
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (participantError) throw participantError;

      const conversationIds = participantData?.map(p => p.conversation_id) || [];

      if (conversationIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          name,
          avatar_url,
          description,
          type,
          join_code,
          owner_id,
          updated_at,
          chat_wallpaper,
          conversation_participants (
            user_id,
            last_read_at,
            is_typing,
            role,
            muted,
            profiles (
              username,
              display_name,
              avatar_url,
              is_verified,
              last_seen_at
            )
          )
        `)
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      if (convError) throw convError;

      const { data: lastMessages } = await supabase
        .from('messages')
        .select('id, content, sender_id, created_at, conversation_id')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });

      const lastMessageMap = new Map<string, LastMessage>();
      (lastMessages || []).forEach(msg => {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, {
            id: msg.id,
            content: msg.content,
            sender_id: msg.sender_id,
            created_at: msg.created_at,
          });
        }
      });

      const unreadCounts = new Map<string, number>();
      for (const conv of (convData || []) as RawConversation[]) {
        const myParticipant = conv.conversation_participants?.find(
          (p) => p.user_id === user.id
        );
        if (myParticipant?.last_read_at) {
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .neq('sender_id', user.id)
            .gt('created_at', myParticipant.last_read_at);
          unreadCounts.set(conv.id, count || 0);
        }
      }

      const conversationsWithMessages = (convData || [] as RawConversation[]).map((conv: RawConversation) => {
        const rawParticipants = (conv.conversation_participants || []) as RawParticipant[];
        const myParticipant = rawParticipants.find((p) => p.user_id === user.id);
        const normalized = rawParticipants.map((p) => ({
          ...p,
          profiles: Array.isArray(p.profiles) ? (p.profiles[0] || null) : p.profiles,
        }));

        return {
          id: conv.id,
          name: conv.name,
          avatar_url: conv.avatar_url,
          description: conv.description,
          type: conv.type as ConversationType,
          join_code: conv.join_code,
          owner_id: conv.owner_id,
          updated_at: conv.updated_at,
          chat_wallpaper: conv.chat_wallpaper ?? null,
          participants: normalized.filter((p) => p.user_id !== user.id),
          participant_count: normalized.length,
          muted: !!myParticipant?.muted,
          my_role: (myParticipant?.role || 'member') as ParticipantRole,
          last_message: lastMessageMap.get(conv.id) || null,
          unread_count: unreadCounts.get(conv.id) || 0,
        };
      });

      setConversations(conversationsWithMessages);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Targeted refresh of a single conversation (last message + unread count)
  const refreshConversation = useCallback(async (convId: string) => {
    if (!user) return;

    try {
      const [{ data: lastMessages }, myParticipant] = await Promise.all([
        supabase
          .from('messages')
          .select('id, content, sender_id, created_at, conversation_id')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('conversation_participants')
          .select('last_read_at')
          .eq('conversation_id', convId)
          .eq('user_id', user.id)
          .single(),
      ]);

      let unread = 0;
      if (myParticipant.data?.last_read_at) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', convId)
          .neq('sender_id', user.id)
          .gt('created_at', myParticipant.data.last_read_at);
        unread = count || 0;
      }

      const firstMessage = (lastMessages || [])[0];
      const lastMessage: LastMessage | null = firstMessage
        ? {
            id: firstMessage.id,
            content: firstMessage.content,
            sender_id: firstMessage.sender_id,
            created_at: firstMessage.created_at,
          }
        : null;

      setConversations(prev => {
        const next = prev.map(c =>
          c.id === convId
            ? { ...c, last_message: lastMessage, unread_count: unread, updated_at: lastMessage?.created_at || c.updated_at }
            : c
        );
        return next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      });
    } catch (error) {
      console.error('Error refreshing conversation:', error);
      fetchConversations();
    }
  }, [user, fetchConversations]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('conversations-list')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new as { conversation_id: string };
          if (msg.conversation_id) {
            refreshConversation(msg.conversation_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const old = payload.old as { conversation_id?: string };
          if (old.conversation_id) {
            refreshConversation(old.conversation_id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations, refreshConversation]);

  const startConversation = async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
        other_user_id: otherUserId,
      });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error starting conversation:', error);
      return null;
    }
  };

  const createGroup = async (name: string, memberIds: string[], avatarUrl?: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('create_group_conversation', {
        group_name: name,
        member_ids: memberIds,
        group_avatar_url: avatarUrl || null,
      });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error creating group:', error);
      return null;
    }
  };

  const createCommunity = async (
    name: string,
    description?: string,
    avatarUrl?: string
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('create_community', {
        community_name: name,
        community_description: description || null,
        community_avatar_url: avatarUrl || null,
      });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error creating community:', error);
      return null;
    }
  };

  const joinByCode = async (code: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('join_conversation_by_code', { code });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error joining conversation by code:', error);
      return null;
    }
  };

  const toggleMute = async (conversationId: string, muted: boolean): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ muted })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setConversations(prev =>
        prev.map(c => (c.id === conversationId ? { ...c, muted } : c))
      );
      return true;
    } catch (error) {
      console.error('Error toggling mute:', error);
      return false;
    }
  };

  const addMembers = async (conversationId: string, memberIds: string[]): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.rpc('add_conversation_members', {
        conv_id: conversationId,
        member_ids: memberIds,
      });

      if (error) throw error;

      await fetchConversations();
      return true;
    } catch (error) {
      console.error('Error adding members:', error);
      return false;
    }
  };

  const leaveConversation = async (conversationId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.rpc('leave_conversation', { conv_id: conversationId });

      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      return true;
    } catch (error) {
      console.error('Error leaving conversation:', error);
      return false;
    }
  };

  const deleteConversation = async (conversationId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.rpc('delete_conversation', { conv_id: conversationId });

      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  };

  return {
    conversations,
    loading,
    fetchConversations,
    startConversation,
    createGroup,
    createCommunity,
    joinByCode,
    toggleMute,
    addMembers,
    leaveConversation,
    deleteConversation,
  };
}
