import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, Conversation } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import MainLayout from '@/components/layout/MainLayout';
import ConversationList from '@/components/messaging/ConversationList';
import MessageThread from '@/components/messaging/MessageThread';
import CallHistory from '@/components/messaging/CallHistory';
import NewChatDialog from '@/components/messaging/NewChatDialog';
import { MessageSquare, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface OtherUser {
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
}

interface Participant {
  user_id: string | null;
  business_id?: string | null;
  last_read_at: string | null;
  profiles?: OtherUser | OtherUser[] | null;
}

export default function Messages() {
  const { identity } = useActiveIdentity();
  return <IdentityMessages key={`${identity.userId}:${identity.businessId ?? "personal"}`} />;
}

function IdentityMessages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { identity, switchToPersonal, switchToBusiness } = useActiveIdentity();
  const { accounts } = useBusiness();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    fetchConversations,
    loading: convsLoading,
    error: conversationsError,
    startConversation,
    startBusinessConversation,
    createGroup,
    createCommunity,
    joinByCode,
    leaveConversation,
    deleteConversation,
  } = useConversations();
  const { toast } = useToast();
  
  const selectedConvId = searchParams.get('conv');
  const newUserId = searchParams.get('new');
  const newBusinessId = searchParams.get('business');
  const newProductId = searchParams.get('product') || undefined;
  const newOrderId = searchParams.get('order') || undefined;
  const draft = searchParams.get('draft');
  const draftNonce = searchParams.get('nonce');
  const [inboxFilter, setInboxFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'messages' | 'calls'>('messages');
  
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const fetchConversationsRef = useRef(fetchConversations);

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  const selectedConversation: Conversation | undefined =
    conversations.find(c => c.id === selectedConvId) || undefined;

  // Handle starting new conversation from profile page
  useEffect(() => {
    if (newUserId && user && identity.type === 'personal') {
      const initConversation = async () => {
        const convId = await startConversation(newUserId);
        if (convId) {
          setSearchParams(
            draft
              ? { conv: convId, draft, nonce: draftNonce || undefined }
              : { conv: convId }
          );
        }
      };
      initConversation();
    }
  }, [newUserId, user]);

  // Handle starting a conversation with a business from its public profile
  useEffect(() => {
    if (!newBusinessId || !user) return;

    let cancelled = false;
    const initConversation = async () => {
      const managesTarget = accounts.some((account) => account.id === newBusinessId);

      // A team member cannot become a customer of their own business. Opening
      // the same destination should take them to that Business inbox instead.
      if (!newOrderId && managesTarget) {
        if (identity.type !== 'business' || identity.businessId !== newBusinessId) {
          switchToBusiness(newBusinessId);
        } else {
          setSearchParams({});
        }
        return;
      }

      // Business-to-business threads are not a separate conversation type.
      // For an enquiry to another store, use the person's customer identity.
      if (!newOrderId && identity.type === 'business') {
        switchToPersonal();
        return;
      }

      // Seller order links must operate as the Business that owns the order.
      if (newOrderId && managesTarget && identity.businessId !== newBusinessId) {
        switchToBusiness(newBusinessId);
        return;
      }

      const result = await supabase.rpc('open_commerce_conversation', {
        p_business_id: newBusinessId,
        p_product_id: newProductId,
        p_order_id: newOrderId,
        p_as_business: identity.type === 'business' && !!newOrderId,
      });
      const convId = result.error ? null : result.data;
      if (convId) await fetchConversationsRef.current();
      if (cancelled) return;
      if (convId) {
        setSearchParams({ conv: convId });
      } else {
        toast({
          variant: 'destructive',
          title: 'Could not open conversation',
          description: result.error?.message || 'This business is not currently accepting messages.',
        });
      }
    };
    initConversation();
    return () => {
      cancelled = true;
    };
  }, [accounts, identity.businessId, identity.type, newBusinessId, newOrderId, newProductId, setSearchParams, switchToBusiness, switchToPersonal, toast, user]);

  // The other side is derived from the conversation itself, so a business thread
  // always presents the business and never one of its staff members.
  useEffect(() => {
    const party = selectedConversation?.party;
    if (!selectedConvId || !user || !party) {
      setOtherUser(null);
      setOtherUserId(null);
      return;
    }

    if (party.kind === 'user' && party.userId) {
      setOtherUserId(party.userId);
      setOtherUser({
        display_name: party.name,
        username: party.username || '',
        avatar_url: party.avatar_url,
        is_verified: party.is_verified,
      });
    } else {
      // Business / group / community: there is no single human on the other side,
      // so person-scoped affordances (calls, block) stay disabled.
      setOtherUserId(null);
      setOtherUser(null);
    }
  }, [selectedConvId, selectedConversation, user]);

  // Track when the other person last read the thread (read receipts).
  useEffect(() => {
    if (!selectedConvId || !user || !selectedConversation) {
      setLastReadAt(null);
      return;
    }

    const fetchOtherReadState = async () => {
      const { data } = await supabase
        .from('conversation_participants')
        .select(`
          user_id,
          business_id,
          last_read_at
        `)
        .eq('conversation_id', selectedConvId);

      const participants = data as Pick<Participant, 'user_id' | 'last_read_at'>[] | null;
      // Only real people produce a "seen" timestamp. A business participant row
      // has no user_id and is skipped.
      const other = participants?.find(
        (p) => p.user_id !== null && p.user_id !== user.id
      );
      setLastReadAt(other?.last_read_at ?? null);
    };

    fetchOtherReadState();

    const channel = supabase
      .channel(`read-receipts-${selectedConvId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `conversation_id=eq.${selectedConvId}`,
        },
        (payload) => {
          const updated = payload.new as Participant;
          if (updated.user_id !== null && updated.user_id !== user.id) {
            setLastReadAt(updated.last_read_at);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConvId, user, selectedConversation?.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || !user) {
    return null;
  }

  const handleSelectConversation = (convId: string) => {
    setSearchParams({ conv: convId });
  };

  const handleRemoveChat = async (conv: Conversation) => {
    const ok = await leaveConversation(conv.id);
    if (ok && selectedConvId === conv.id) setSearchParams({});
    return ok;
  };

  const handleDeleteChat = async (conv: Conversation) => {
    const ok = await deleteConversation(conv.id);
    if (ok && selectedConvId === conv.id) setSearchParams({});
    return ok;
  };

  const handleBack = () => {
    setSearchParams({});
  };

  const handleCreated = (convId: string) => {
    setSearchParams({ conv: convId });
  };

  const isChatOpen = !!selectedConvId;

  return (
    <MainLayout immersive={isChatOpen}>
      <div className={cn(
        'flex relative overflow-hidden',
        isChatOpen ? 'h-[100dvh]' : 'h-[calc(100vh-48px)] lg:h-screen'
      )}>
        {/* Conversation List Panel */}
        <div className={cn(
          'w-full md:w-72 lg:w-80 flex flex-col',
          selectedConvId ? 'hidden md:flex' : 'flex'
        )}>
          {/* Tab switcher */}
          <div className="px-5 pt-5 pb-2 border-b border-border/50 bg-card">
            <div className="flex gap-1 p-1 bg-surface-2 rounded-full">
              <button
                onClick={() => setActiveTab('messages')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-all duration-200',
                  activeTab === 'messages' 
                    ? 'bg-foreground text-background shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MessageSquare className="h-4 w-4" />
                Chats
              </button>
              <button
                disabled={identity.type === 'business'}
                onClick={() => setActiveTab('calls')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-all duration-200',
                  activeTab === 'calls' 
                    ? 'bg-foreground text-background shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Phone className="h-4 w-4" />
                Calls
              </button>
            </div>
          </div>
          
          {activeTab === 'messages' ? (
            <>
              <div className={identity.type === 'business' ? 'border-b p-3' : 'hidden'}>
                <h2 className="mb-2 text-sm font-semibold">{identity.business?.name} · Inbox</h2>
                <select aria-label="Business inbox filter" className="w-full rounded border bg-background p-2 text-sm" value={inboxFilter} onChange={e => setInboxFilter(e.target.value)}>
                  {['all','unread','leads','customers','orders','archived'].map(value => <option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}
                </select>
              </div>
              {convsLoading ? (
                <div className="flex-1 overflow-y-auto px-2.5 pb-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : conversationsError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                  <p>Chats could not be loaded. Your existing conversations have not been removed.</p>
                  <button className="rounded border px-3 py-1.5 text-foreground" onClick={() => void fetchConversations()}>Try again</button>
                </div>
              ) : (
                <ConversationList
                  conversations={identity.type !== 'business' ? conversations : conversations.filter(c => inboxFilter === 'archived' ? c.business_inbox_state === 'archived' : c.business_inbox_state !== 'archived' && (inboxFilter === 'all' || (inboxFilter === 'unread' && c.unread_count > 0) || (inboxFilter === 'leads' && c.business_inbox_state === 'lead' && !c.context_order_id) || (inboxFilter === 'customers' && (c.business_inbox_state === 'customer' || !!c.context_order_id)) || (inboxFilter === 'orders' && !!c.context_order_id)))}
                  loading={false}
                  selectedId={selectedConvId || undefined}
                  onSelect={handleSelectConversation}
                  onNewChat={() => { if (identity.type === 'personal') setShowNewChat(true); else toast({ title: 'Business conversations', description: 'Reply to an enquiry or open a customer order to start a conversation.' }); }}
                  currentUserId={user.id}
                  onRemoveChat={handleRemoveChat}
                  onDeleteChat={handleDeleteChat}
                />
              )}
            </>
          ) : (
            <CallHistory />
          )}
        </div>

        {/* Message Thread Panel */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0',
          !selectedConvId ? 'hidden md:flex' : 'flex'
        )}>
          {selectedConversation && <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-xs">{selectedConversation.context_product_id && <Link className="text-primary hover:underline" to={`/marketplace/product/${selectedConversation.context_product_id}`}>View product</Link>}{selectedConversation.context_order_id && <Link className="text-primary hover:underline" to={`/orders?order=${selectedConversation.context_order_id}`}>View order</Link>}{identity.type === 'business' && <select aria-label="Conversation customer status" className="ml-auto rounded border bg-background p-1" value={selectedConversation.business_inbox_state || 'lead'} onChange={async e => { const { error } = await supabase.rpc('set_business_inbox_state', { p_conversation_id: selectedConversation.id, p_state: e.target.value }); if(error) toast({ title: 'Could not update conversation',description:error.message,variant:'destructive' }); else void fetchConversations(); }}><option value="lead">Lead</option><option value="customer">Customer</option><option value="archived">Archived</option></select>}</div>}
          {selectedConvId && selectedConversation ? (
            <MessageThread
              key={`${identity.businessId}:${selectedConversation?.id}`}
              conversationId={selectedConvId}
              conversation={selectedConversation}
              otherUser={otherUser}
              otherUserId={otherUserId}
              onBack={handleBack}
              lastReadAt={lastReadAt}
              initialDraft={draft || undefined}
              draftNonce={draftNonce || undefined}
            />
          ) : selectedConvId && convsLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 border border-border rounded-xl m-4">
              <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="mt-4 text-sm font-medium">Loading conversation...</p>
            </div>
          ) : selectedConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 border border-border rounded-xl m-4">
              <p className="text-sm font-medium">This conversation is unavailable in the active inbox.</p>
              <button className="rounded border px-3 py-1.5 text-foreground" onClick={() => void fetchConversations()}>Refresh chats</button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 border border-border rounded-xl m-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-primary/70" strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-semibold mb-1">Your messages</h2>
              <p className="text-sm text-center text-muted-foreground max-w-xs">
                Send private messages to a friend, create a group with friends, or join a community by code.
              </p>
            </div>
          )}
        </div>
      </div>

      <NewChatDialog
        open={showNewChat}
        onOpenChange={setShowNewChat}
        onCreated={handleCreated}
        onCreateGroup={createGroup}
        onCreateCommunity={createCommunity}
        onJoinByCode={joinByCode}
      />
    </MainLayout>
  );
}
