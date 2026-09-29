import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import type { BusinessAccount } from '@/lib/business';
import type { BusinessParty } from './useConversations';

export type MessageEffectType = 'confetti' | 'fireworks' | 'laser' | 'fire' | 'halo';

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

export interface SendOptions {
  effect?: MessageEffectType | null;
  forwardedFromMessageId?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_edited: boolean;
  reply_to_message_id?: string | null;
  location_session_id?: string | null;
  is_pinned: boolean;
  pinned_at?: string | null;
  forwarded_from_message_id?: string | null;
  effect?: MessageEffectType | null;
  client_id?: string | null;
  attachments?: MessageAttachment[];
  profiles?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  forwarded_message?: Message | null;
  optimistic?: boolean;
  failed?: boolean;
  /** Present when the message was sent as a business identity */
  sender_business?: BusinessParty | null;
  /**
   * Business identity this message was sent as, as stored on the row. Null
   * means the sender was acting as their personal account even inside a
   * business thread.
   */
  sender_business_id?: string | null;
}

interface TypingUser {
  user_id: string;
  display_name: string;
}

export const MESSAGE_PAGE_SIZE = 50;

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map(existing.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

type RawMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_edited: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  forwarded_from_message_id: string | null;
  effect: string | null;
  client_id: string | null;
  reply_to_message_id: string | null;
  location_session_id: string | null;
  /** Business identity the message was sent as; null means personal. */
  sender_business_id: string | null;
};

/**
 * Resolve the business identity a message was actually sent as.
 *
 * The identity must come from the stored `sender_business_id`, never from the
 * conversation. Deriving it from the thread assumed every message in a business
 * thread came from the business, which relabelled the customer's own replies
 * and made a customer message indistinguishable from a real business reply.
 */
function resolveSenderBusiness(
  row: { sender_business_id?: string | null },
  conversationBusiness: BusinessParty | null
): BusinessParty | null {
  if (!row.sender_business_id || !conversationBusiness) return null;
  return conversationBusiness.id === row.sender_business_id ? conversationBusiness : null;
}

function toClientMessage(
  m: RawMessage,
  extra: { attachments?: MessageAttachment[]; profiles?: Message['profiles']; sender_business?: BusinessParty | null } = {}
): Message {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    content: m.content,
    created_at: m.created_at,
    is_edited: m.is_edited,
    is_pinned: !!m.is_pinned,
    pinned_at: m.pinned_at,
    forwarded_from_message_id: m.forwarded_from_message_id,
    effect: (m.effect as Message['effect']) ?? null,
    client_id: m.client_id,
    reply_to_message_id: m.reply_to_message_id,
    location_session_id: m.location_session_id,
    sender_business_id: m.sender_business_id ?? null,
    attachments: extra.attachments || [],
    profiles: extra.profiles,
    forwarded_message: null,
    sender_business: extra.sender_business ?? null,
  };
}

export function useMessages(conversationId: string | null, conversation?: { type: string; business_id: string | null; business?: BusinessParty | null } | null) {
  const { user } = useAuth();
  const { identity } = useActiveIdentity();
  const { isEnabled } = useAppSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Monotonic token so a stale fetch (from a previously-open conversation) can
  // never overwrite the messages of the currently-open conversation.
  const fetchTokenRef = useRef(0);

  // The conversation's business identity, used to name messages that were
  // actually sent as that business.
  const conversationBusiness = conversation?.business || null;
  const activeBusiness = identity.type === 'business' && identity.business && conversation?.business_id === identity.business.id
    ? identity.business
    : null;

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      // Bump the token so any in-flight fetch is invalidated.
      fetchTokenRef.current++;
      setMessages([]);
      setHasMore(false);
      setError(null);
      setLoading(false);
      return;
    }

    const token = ++fetchTokenRef.current;
    setMessages([]);
    setHasMore(false);
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          is_edited,
          is_pinned,
          pinned_at,
          forwarded_from_message_id,
          effect,
          client_id,
          reply_to_message_id,
          location_session_id,
          sender_business_id
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, MESSAGE_PAGE_SIZE - 1);

      if (fetchTokenRef.current !== token) return;
      if (error) throw error;

      const rows = ((data || []) as RawMessage[]).reverse();
      setHasMore((data?.length || 0) >= MESSAGE_PAGE_SIZE);

      const messageIds = rows.map(m => m.id);

      let attachments: MessageAttachment[] = [];
      if (messageIds.length > 0) {
        const { data: attData, error: attError } = await supabase
          .from('message_attachments')
          .select('*')
          .in('message_id', messageIds);
        if (fetchTokenRef.current !== token) return;
        if (attError) throw attError;
        attachments = (attData || []) as MessageAttachment[];
      }

      // Fetch profiles for senders
      const senderIds = [...new Set(rows.map(m => m.sender_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', senderIds);
      if (fetchTokenRef.current !== token) return;
      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }] as const)
      );

      // For business conversations, add business identity to messages from business members
      const messagesWithProfiles = await attachForwardedMessages(
        rows.map(m => {
          const senderProfile = profileMap.get(m.sender_id);
          const senderBusiness = resolveSenderBusiness(m, conversationBusiness);
          return toClientMessage(m, {
            attachments: attachments.filter(a => a.message_id === m.id),
            profiles: senderProfile,
            sender_business: senderBusiness,
          });
        })
      );
      if (fetchTokenRef.current !== token) return;

      setMessages(messagesWithProfiles);
    } catch (error) {
      if (fetchTokenRef.current === token) setError(error instanceof Error ? error : new Error('Could not load messages'));
      console.error('Messaging operation failed', { operation: 'load_history', conversationId });
    } finally {
      if (fetchTokenRef.current === token) setLoading(false);
    }
  }, [conversationId, user, conversationBusiness]);

  // Fetch the source message for forwarded messages
  const attachForwardedMessages = useCallback(async (rows: Message[]): Promise<Message[]> => {
    const forwardedIds = rows
      .map(m => m.forwarded_from_message_id)
      .filter((id): id is string => !!id);

    if (forwardedIds.length === 0) return rows;

    const { data: forwardedRows } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        created_at,
        is_edited,
        is_pinned,
        pinned_at,
        forwarded_from_message_id,
        effect,
          client_id,
          reply_to_message_id,
          location_session_id,
          sender_business_id
        `)
      .in('id', forwardedIds);

    const forwardedMap = new Map<string, Message>(
      (forwardedRows || [] as RawMessage[]).map(fm => [fm.id, toClientMessage(fm)])
    );

    return rows.map(m =>
      m.forwarded_from_message_id ? { ...m, forwarded_message: forwardedMap.get(m.forwarded_from_message_id) || null } : m
    );
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !user || loadingMore || messages.length === 0) return;

    const token = fetchTokenRef.current;

    setLoadingMore(true);
    try {
      const oldest = messages[0].created_at;
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          is_edited,
          is_pinned,
          pinned_at,
          forwarded_from_message_id,
          effect,
          client_id,
          reply_to_message_id,
          location_session_id,
          sender_business_id
        `)
        .eq('conversation_id', conversationId)
        // Timestamp-only cursors lose rows when multiple messages share the
        // same timestamp. Use (created_at, id) as a stable descending cursor.
        .or(`created_at.lt.${oldest},and(created_at.eq.${oldest},id.lt.${messages[0].id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, MESSAGE_PAGE_SIZE - 1);

      if (fetchTokenRef.current !== token) return;
      if (error) throw error;

      const rows = ((data || []) as RawMessage[]).reverse();
      setHasMore((data?.length || 0) >= MESSAGE_PAGE_SIZE);

      const messageIds = rows.map(m => m.id);
      let attachments: MessageAttachment[] = [];
      if (messageIds.length > 0) {
        const { data: attData, error: attError } = await supabase
          .from('message_attachments')
          .select('*')
          .in('message_id', messageIds);
        if (fetchTokenRef.current !== token) return;
        if (attError) throw attError;
        attachments = (attData || []) as MessageAttachment[];
      }

      const senderIds = [...new Set(rows.map(m => m.sender_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', senderIds);
      if (fetchTokenRef.current !== token) return;
      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }] as const)
      );

      const messagesWithProfiles = await attachForwardedMessages(
        rows.map(m => {
          const senderProfile = profileMap.get(m.sender_id);
          const senderBusiness = resolveSenderBusiness(m, conversationBusiness);
          return toClientMessage(m, {
            attachments: attachments.filter(a => a.message_id === m.id),
            profiles: senderProfile,
            sender_business: senderBusiness,
          });
        })
      );
      if (fetchTokenRef.current !== token) return;

      setMessages(prev => mergeMessages(prev, messagesWithProfiles));
    } catch (error) {
      setError(error instanceof Error ? error : new Error('Could not load earlier messages'));
      console.error('Messaging operation failed', { operation: 'load_older', conversationId });
    } finally {
      if (fetchTokenRef.current === token) setLoadingMore(false);
    }
  }, [conversationId, user, loadingMore, messages, attachForwardedMessages, conversationBusiness]);

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
          if (newMessage.sender_id === user.id) {
            // Reconcile an optimistic send, but still append an authoritative
            // row from another device or a delayed reconnect.
            setMessages(prev => {
              const optimistic = newMessage.client_id
                ? prev.find(m => m.client_id === newMessage.client_id && m.optimistic)
                : undefined;
              const authoritative: Message = {
                ...newMessage,
                is_pinned: !!newMessage.is_pinned,
                attachments: optimistic?.attachments || [],
                profiles: optimistic?.profiles || newMessage.profiles,
                optimistic: false,
                failed: false,
                sender_business: resolveSenderBusiness(newMessage, conversationBusiness),
              };
              const withoutOptimistic = optimistic ? prev.filter(m => m.id !== optimistic.id) : prev;
              return mergeMessages(withoutOptimistic, [authoritative]);
            });
            return;
          }

          // Mark the message as read for the open recipient
          (async () => {
            try {
              await supabase.rpc('mark_message_reads_up_to', {
                conv_id: conversationId,
                read_until: new Date().toISOString(),
              });
            } catch {
              // Ignore read-tracking failures
            }
          })();

          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url')
            .eq('user_id', newMessage.sender_id)
            .single();

          // Identity comes from the stored sender_business_id on the row.
          const senderBusiness = resolveSenderBusiness(newMessage, conversationBusiness);

          // Fetch attachments (may be empty if still being inserted)
          const { data: attachments } = await supabase
            .from('message_attachments')
            .select('*')
            .eq('message_id', newMessage.id);

          const [forwarded] = await attachForwardedMessages([{
            ...newMessage,
            is_pinned: !!newMessage.is_pinned,
            attachments: (attachments || []) as MessageAttachment[],
            profiles: profile
              ? { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url }
              : undefined,
            forwarded_message: null,
            sender_business: senderBusiness,
          }]);

          setMessages(prev => mergeMessages(prev, [forwarded]));
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
            prev.map(m => (m.id === updated.id ? { ...m, ...updated, is_pinned: !!updated.is_pinned } : m))
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
  }, [conversationId, user, attachForwardedMessages, conversationBusiness]);

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
          const updated = payload.new as { user_id: string; is_typing: boolean };
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

  const detectEffect = (content: string): MessageEffectType | null => {
    const text = content.toLowerCase();
    if (/\b(congratulations|congrats|confetti)\b/.test(text) || text.includes('🎉')) return 'confetti';
    if (text.includes('🎆') || text.includes('🎇') || /\bfireworks\b/.test(text)) return 'fireworks';
    if (/\blaser\b/.test(text)) return 'laser';
    if (text.includes('🔥') || /\bfire\b/.test(text)) return 'fire';
    if (/\bhalo\b/.test(text)) return 'halo';
    return null;
  };

  const sendMessage = async (
    content: string,
    attachments: NewAttachment[] = [],
    replyToId: string | null = null,
    options: SendOptions = {}
  ) => {
    if (!conversationId || !user) return;
    if (identity.type === 'business' && !activeBusiness) throw new Error('Choose a conversation in your active business inbox');
    if (!content.trim() && attachments.length === 0) return;
    if (!isEnabled('direct_messages_enabled')) throw new Error('Direct messages are currently disabled by the admin.');

    const clientId = crypto.randomUUID();
    const effectiveEffect = options.effect ?? detectEffect(content);

    // For business conversations, use business identity for the optimistic message
    const senderProfile = activeBusiness
      ? { username: activeBusiness.username || '', display_name: activeBusiness.name, avatar_url: activeBusiness.avatar_url }
      : { username: '', display_name: 'You', avatar_url: null };

    // Optimistic message for instant feedback
    const optimisticMessage: Message = {
      id: `temp-${clientId}`,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      created_at: new Date().toISOString(),
      is_edited: false,
      is_pinned: false,
      effect: effectiveEffect,
      client_id: clientId,
      forwarded_from_message_id: options.forwardedFromMessageId ?? null,
      reply_to_message_id: replyToId,
      attachments: attachments.map(a => ({
        id: `temp-att-${Math.random().toString(36).slice(2)}`,
        message_id: `temp-${clientId}`,
        conversation_id: conversationId,
        type: a.type,
        url: a.url,
        name: a.name ?? null,
        size: a.size ?? null,
        mime_type: a.mime_type ?? null,
        duration: a.duration ?? null,
        created_at: new Date().toISOString(),
      })),
      profiles: senderProfile,
      optimistic: true,
      sender_business: activeBusiness,
      sender_business_id: activeBusiness?.id ?? null,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          reply_to_message_id: replyToId,
          forwarded_from_message_id: options.forwardedFromMessageId ?? null,
          effect: effectiveEffect,
          client_id: clientId,
          sender_business_id: activeBusiness?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      // The insert response is authoritative. Realtime remains a reconciliation
      // path, never the only way a sender sees their own message.
      setMessages(prev => {
        const optimistic = prev.find(m => m.client_id === clientId && m.optimistic);
        const authoritative = toClientMessage(inserted as RawMessage, {
          attachments: optimistic?.attachments,
          profiles: optimistic?.profiles,
          sender_business: activeBusiness,
        });
        return mergeMessages(prev.filter(m => m.id !== optimistic?.id), [authoritative]);
      });

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
      // Keep the draft message in the thread so a failure is visible and can be
      // retried without forcing the composer to discard the user's text.
      setMessages(prev => prev.map(m =>
        m.client_id === clientId && m.optimistic ? { ...m, optimistic: false, failed: true } : m
      ));
      console.error('Messaging operation failed', { operation: 'send_message', conversationId });
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

  const retryMessage = async (message: Message) => {
    if (!message.failed) return;
    await sendMessage(
      message.content,
      (message.attachments || []).map(({ type, url, name, size, mime_type, duration }) => ({ type, url, name, size, mime_type, duration })),
      message.reply_to_message_id ?? null,
      { effect: message.effect, forwardedFromMessageId: message.forwarded_from_message_id }
    );
    setMessages(prev => prev.filter(current => current.id !== message.id));
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

      await supabase.rpc('mark_message_reads_up_to', {
        conv_id: conversationId,
        read_until: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const editMessage = async (messageId: string, content: string) => {
    if (!conversationId || !user) return false;

    const trimmed = content.trim();
    if (!trimmed) return false;

    try {
      const { error } = await supabase
        .from('messages')
        .update({
          content: trimmed,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error editing message:', error);
      return false;
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!conversationId || !user) return false;

    try {
      await supabase
        .from('message_attachments')
        .delete()
        .eq('message_id', messageId);

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  };

  const togglePin = async (messageId: string, pinned: boolean) => {
    if (!conversationId || !user) return;

    try {
      const fn = pinned ? 'unpin_message' : 'pin_message';
      await supabase.rpc(fn, { message_id: messageId });
      // Optimistically update
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? { ...m, is_pinned: !pinned, pinned_at: pinned ? null : new Date().toISOString() }
            : m
        )
      );
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const searchMessages = useCallback(async (query: string, limit = 30): Promise<Message[]> => {
    if (!conversationId || !user || !query.trim()) return [];

    try {
      const { data, error } = await supabase.rpc('search_conversation_messages', {
        conv_id: conversationId,
        query: query.trim(),
        max_results: limit,
      });

      if (error) throw error;

      const rows = (data ?? []) as Message[];
      const messageIds = rows.map(m => m.id);
      const senderIds = [...new Set(rows.map(m => m.sender_id))];

      const [attData, profileData] = await Promise.all([
        messageIds.length > 0
          ? supabase.from('message_attachments').select('*').in('message_id', messageIds)
          : Promise.resolve({ data: [], error: null }),
        senderIds.length > 0
          ? supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', senderIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const attachments = (attData.data ?? []) as MessageAttachment[];
      const profileMap = new Map(
        (profileData.data ?? []).map(p => [p.user_id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }] as const)
      );

      return rows.map(m => ({
        ...m,
        is_pinned: !!m.is_pinned,
        attachments: attachments.filter(a => a.message_id === m.id),
        profiles: profileMap.get(m.sender_id),
      }));
    } catch (error) {
      console.error('Error searching messages:', error);
      return [];
    }
  }, [conversationId, user]);

  return {
    messages,
    loading,
    error,
    fetchMessages,
    loadingMore,
    hasMore,
    loadOlder,
    typingUsers,
    sendMessage,
    retryMessage,
    handleTyping,
    markAsRead,
    editMessage,
    deleteMessage,
    togglePin,
    searchMessages,
  };
}
