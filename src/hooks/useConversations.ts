import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type ConversationType = 'dm' | 'group' | 'community' | 'business';
export type ParticipantRole = 'owner' | 'admin' | 'member';

/** A participant is either a person or a business, never both and never neither. */
export interface Participant {
  /** NULL for the business side of a business thread. */
  user_id: string | null;
  /** NULL for ordinary user participants. */
  business_id: string | null;
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

export interface BusinessParty {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  category: string | null;
}

/**
 * The other side of a conversation as *this* viewer should perceive it.
 *
 * This is the only thing the UI should render. For a business thread it is the
 * business itself - never an individual staff member - so the business is
 * never presented as if it were a person, and staff are never exposed to the
 * customer.
 */
export interface ConversationParty {
  kind: 'user' | 'business' | 'group';
  /** Present when kind === 'user'. */
  userId: string | null;
  /** Present when kind === 'business'. */
  businessId: string | null;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
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
  business_id: string | null;
  updated_at: string;
  chat_wallpaper: string | null;
  context_product_id?: string | null;
  context_order_id?: string | null;
  business_inbox_state?: string;
  participants: Participant[];
  /** The business behind a business thread, if any. */
  business: BusinessParty | null;
  /** What to render as "the other side". Prefer this over `participants`. */
  party: ConversationParty;
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
  business_id: string | null;
  updated_at: string;
  chat_wallpaper: string | null;
  context_product_id?: string | null;
  context_order_id?: string | null;
  business_inbox_state?: string;
  business: RawBusinessParty | RawBusinessParty[] | null;
  conversation_participants?: RawParticipant[];
}

interface RawBusinessParty {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  category: string | null;
}

interface RawParticipant {
  user_id: string | null;
  business_id: string | null;
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

interface DerivePartyInput {
  type: ConversationType;
  businessId: string | null;
  business: BusinessParty | null;
  conversationName: string | null;
  conversationAvatar: string | null;
  others: Participant[];
}

/**
 * Decide what the viewer sees as "the other side".
 *
 * Business threads deliberately resolve to the business, never to a staff
 * member: the customer is talking to the business, and which employee happens
 * to be online is neither relevant nor their business.
 */
function deriveParty(input: DerivePartyInput): ConversationParty {
  const { type, businessId, business, conversationName, conversationAvatar, others } = input;

  if (type === 'business') {
    return {
      kind: 'business',
      userId: null,
      businessId,
      name: business?.name || conversationName || 'Business',
      username: business?.username ?? null,
      avatar_url: business?.avatar_url || conversationAvatar || null,
      // Verification belongs to the person who owns the business; the business
      // itself is not presented as a verified human.
      is_verified: false,
    };
  }

  if (type === 'group' || type === 'community') {
    return {
      kind: 'group',
      userId: null,
      businessId: null,
      name: conversationName || 'Group',
      username: null,
      avatar_url: conversationAvatar || null,
      is_verified: false,
    };
  }

  const other = others[0];
  return {
    kind: 'user',
    userId: other?.user_id ?? null,
    businessId: null,
    name: other?.profiles?.display_name || 'Unknown',
    username: other?.profiles?.username ?? null,
    avatar_url: other?.profiles?.avatar_url ?? null,
    is_verified: !!other?.profiles?.is_verified,
  };
}

export function useConversations() {
  const { user } = useAuth();
  const { identity, isLoading: identityLoading } = useActiveIdentity();
  const { toast } = useToast();
  const businessId = identity.businessId;
  const identityKey = `${user?.id}:${identity.type}:${businessId ?? "none"}`;
  const activeKey = useRef(identityKey);
  activeKey.current = identityKey;
  const [loadedKey, setLoadedKey] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConversations = useCallback(async () => {
    // Wait for identity to be fully resolved before fetching
    if (identityLoading) return;
    if (!user) { setConversations([]); setLoadedKey(identityKey); setLoading(false); return; }
    // In business mode, wait for businessId to be resolved
    if (identity.type === 'business' && !businessId) { setConversations([]); setLoadedKey(identityKey); setLoading(false); return; }

    setError(null);
    try {
      const { data: rpcSummaries, error: summaryError } = await supabase.rpc('get_identity_conversation_summaries', { p_business_id: businessId || undefined });
      // A migration can temporarily be unavailable while the client bundle has
      // already been deployed. Keep established personal chats usable through
      // the normal RLS-protected tables instead of rendering a false empty/error
      // inbox. The RPC remains required for business inbox summaries.
      let summaries = rpcSummaries;
      if (summaryError && !businessId) {
        console.error('Messaging operation failed', { operation: 'load_inbox_summary_fallback' });
        const { data: participantRows, error: participantError } = await supabase
          .from('conversation_participants')
          .select('conversation_id, conversations!inner(type)')
          .eq('user_id', user.id)
          .neq('conversations.type', 'business');
        if (participantError) throw participantError;
        summaries = (participantRows || []).map(row => ({
          conversation_id: row.conversation_id,
          last_message: null,
          unread_count: 0,
        }));
      } else if (summaryError) {
        throw summaryError;
      }
      const conversationIds = summaries?.map(row => row.conversation_id) || [];

      if (conversationIds.length === 0) {
        if (activeKey.current === identityKey) { setConversations([]); setLoadedKey(identityKey); setLoading(false); }
        return;
      }

      const fullConversationQuery = await supabase
        .from('conversations')
        .select(`
          id,
          name,
          avatar_url,
          description,
          type,
          join_code,
          owner_id,
          business_id,
          updated_at,
          chat_wallpaper,
          context_product_id,
          context_order_id,
          business_inbox_state,
          business:advertiser_accounts (
            id,
            name,
            username,
            avatar_url,
            category
          ),
          conversation_participants (
            user_id,
            business_id,
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

      // Connected projects that have not yet received the commerce migration
      // do not have context_product_id, business_id, or the business fields.
      // Fall back to the original conversation shape so existing personal DMs
      // remain available during a staged schema rollout.
      let convData = fullConversationQuery.data as unknown as RawConversation[] | null;
      let convError = fullConversationQuery.error;
      if (convError?.code === '42703' && !businessId) {
        const compactConversationQuery = await supabase
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
        convData = compactConversationQuery.data as unknown as RawConversation[] | null;
        convError = compactConversationQuery.error;
      }
      if (convError) throw convError;

      const lastMessageMap = new Map<string, LastMessage>();
      const unreadCounts = new Map<string, number>();
      for (const row of summaries ?? []) {
        if (row.last_message) lastMessageMap.set(row.conversation_id, row.last_message as unknown as LastMessage);
        unreadCounts.set(row.conversation_id, row.unread_count);
      }

      // The RPC is the access boundary and already scopes rows to the active
      // identity. Do not re-apply a type filter here: a personal customer is a
      // valid participant in a business conversation and previously lost every
      // such thread in this second filter.
      const visible = (convData || []) as RawConversation[];

      const conversationsWithMessages = visible.map((conv: RawConversation) => {
        const rawParticipants = (conv.conversation_participants || []) as RawParticipant[];
        const myParticipant = rawParticipants.find((p) => p.user_id === user.id);
        const normalized: Participant[] = rawParticipants.map((p) => ({
          user_id: p.user_id,
          // Older projects predate business participant columns. Normalize
          // omitted fields to the same values a current database returns.
          business_id: p.business_id ?? null,
          last_read_at: p.last_read_at,
          is_typing: p.is_typing,
          role: p.role ?? 'member',
          muted: p.muted ?? false,
          profiles: Array.isArray(p.profiles) ? (p.profiles[0] || null) : p.profiles,
        }));

        const business = Array.isArray(conv.business) ? (conv.business[0] || null) : conv.business;
        const type = conv.type as ConversationType;

        // Everyone except me, and excluding the business placeholder row.
        const isBusinessThread = type === 'business';
        const others = normalized.filter(
          (p) =>
            p.user_id !== user.id &&
            p.business_id === null &&
            !(isBusinessThread && p.role !== 'member')
        );

        return {
          id: conv.id,
          name: conv.name,
          avatar_url: conv.avatar_url,
          description: conv.description,
          type,
          join_code: conv.join_code,
          owner_id: conv.owner_id,
          business_id: conv.business_id,
          updated_at: conv.updated_at,
          chat_wallpaper: conv.chat_wallpaper ?? null,
          context_product_id: conv.context_product_id,
          context_order_id: conv.context_order_id,
          business_inbox_state: conv.business_inbox_state,
          participants: others,
          business: business ?? null,
          // In a business inbox the other party is the customer. In personal
          // mode the business remains the other party, preserving public chat
          // semantics for shoppers.
          party: businessId && type === 'business'
            ? {
                kind: 'user' as const,
                userId: others[0]?.user_id ?? null,
                businessId: null,
                name: others[0]?.profiles?.display_name || 'Customer',
                username: others[0]?.profiles?.username ?? null,
                avatar_url: others[0]?.profiles?.avatar_url ?? null,
                is_verified: !!others[0]?.profiles?.is_verified,
              }
            : deriveParty({
                type,
                businessId: conv.business_id,
                business,
                conversationName: conv.name,
                conversationAvatar: conv.avatar_url,
                others,
              }),
          participant_count: type === 'business' ? 1 : others.length,
          muted: !!myParticipant?.muted,
          my_role: (myParticipant?.role || 'member') as ParticipantRole,
          last_message: lastMessageMap.get(conv.id) || null,
          unread_count: unreadCounts.get(conv.id) || 0,
        };
      });

      if (activeKey.current !== identityKey) return;
      setLoadedKey(identityKey);
      setConversations(conversationsWithMessages);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setError(error instanceof Error ? error : new Error('Failed to fetch conversations'));
      if (activeKey.current === identityKey) {
        setLoadedKey(identityKey);
        setConversations([]);
      }
    } finally {
      if (activeKey.current === identityKey) setLoading(false);
    }
  }, [user, businessId, identityKey, identity.type, identityLoading]);

  // Fetch when identity is ready (not loading) and key changes
  useEffect(() => {
    if (identityLoading) return;
    setLoadedKey("");
    setLoading(true);
    fetchConversations();
  }, [fetchConversations, identityLoading]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!user || identityLoading) return;

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
  }, [user, fetchConversations, identityLoading]);

  // The summaries RPC scopes both identity and unread counts on every refresh.
  const refreshConversation = useCallback(async (_convId: string) => {
    await fetchConversations();
  }, [fetchConversations]);

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
      toast({
        variant: 'destructive',
        title: 'Could not start conversation',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      return null;
    }
  };

  const startBusinessConversation = async (businessId: string): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('get_or_create_business_conversation', {
        p_business_id: businessId,
      });

      if (error) throw error;

      await fetchConversations();
      return data;
    } catch (error) {
      console.error('Error starting business conversation:', error);
      toast({
        variant: 'destructive',
        title: 'Could not open conversation',
        description: error instanceof Error ? error.message : 'This business is not currently accepting messages.',
      });
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
      toast({
        variant: 'destructive',
        title: 'Could not create group',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
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
      toast({
        variant: 'destructive',
        title: 'Could not create community',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
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
      toast({
        variant: 'destructive',
        title: 'Could not join',
        description: error instanceof Error ? error.message : 'Invalid or expired code.',
      });
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
    conversations: loadedKey === identityKey ? conversations : [],
    loading: identityLoading || loading,
    error,
    fetchConversations,
    startConversation,
    startBusinessConversation,
    createGroup,
    createCommunity,
    joinByCode,
    toggleMute,
    addMembers,
    leaveConversation,
    deleteConversation,
  };
}
