import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  type: 'image' | 'audio' | 'file';
  url: string;
  name: string | null;
  size: number | null;
  mime_type: string | null;
  duration: number | null;
  created_at: string;
}

export interface NewAttachment {
  type: 'image' | 'audio' | 'file';
  url: string;
  name?: string | null;
  size?: number | null;
  mime_type?: string | null;
  duration?: number | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_edited: boolean;
  attachments?: MessageAttachment[];
  profiles?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface TypingUser {
  user_id: string;
  display_name: string;
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          is_edited
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const messageIds = (data || []).map(m => m.id);

      let attachments: MessageAttachment[] = [];
      if (messageIds.length > 0) {
        const { data: attData, error: attError } = await supabase
          .from('message_attachments')
          .select('*')
          .in('message_id', messageIds);
        if (attError) throw attError;
        attachments = (attData || []) as MessageAttachment[];
      }

      // Fetch profiles for senders
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', senderIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      const messagesWithProfiles = (data || []).map(m => ({
        ...m,
        attachments: attachments.filter(a => a.message_id === m.id),
        profiles: profileMap.get(m.sender_id),
      }));

      setMessages(messagesWithProfiles);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url')
            .eq('user_id', newMessage.sender_id)
            .single();

          // Fetch attachments (may be empty if still being inserted)
          const { data: attachments } = await supabase
            .from('message_attachments')
            .select('*')
            .eq('message_id', newMessage.id);

          setMessages(prev => [...prev, { ...newMessage, attachments: (attachments || []) as MessageAttachment[], profiles: profile || undefined }]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_attachments',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const attachment = payload.new as MessageAttachment;
          setMessages(prev =>
            prev.map(m =>
              m.id === attachment.message_id
                ? { ...m, attachments: [...(m.attachments || []), attachment] }
                : m
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`typing-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const updated = payload.new as any;
          if (updated.user_id === user.id) return;

          if (updated.is_typing) {
            // Fetch user profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('user_id', updated.user_id)
              .single();

            setTypingUsers(prev => {
              if (prev.find(u => u.user_id === updated.user_id)) return prev;
              return [...prev, { user_id: updated.user_id, display_name: profile?.display_name || 'User' }];
            });
          } else {
            setTypingUsers(prev => prev.filter(u => u.user_id !== updated.user_id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const sendMessage = async (content: string, attachments: NewAttachment[] = []) => {
    if (!conversationId || !user) return;
    if (!content.trim() && attachments.length === 0) return;

    try {
      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      if (attachments.length > 0) {
        const { error: attError } = await supabase
          .from('message_attachments')
          .insert(
            attachments.map(a => ({
              message_id: inserted.id,
              conversation_id: conversationId,
              type: a.type,
              url: a.url,
              name: a.name ?? null,
              size: a.size ?? null,
              mime_type: a.mime_type ?? null,
              duration: a.duration ?? null,
            }))
          );
        if (attError) throw attError;
      }

      // Clear typing indicator
      await setTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const setTyping = async (isTyping: boolean) => {
    if (!conversationId || !user) return;

    try {
      await supabase
        .from('conversation_participants')
        .update({ is_typing: isTyping, typing_updated_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  };

  const handleTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setTyping(true);

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  };

  const markAsRead = async () => {
    if (!conversationId || !user) return;

    try {
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  return {
    messages,
    loading,
    typingUsers,
    sendMessage,
    handleTyping,
    markAsRead,
  };
}
