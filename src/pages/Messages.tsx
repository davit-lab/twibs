import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, Conversation } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import MainLayout from '@/components/layout/MainLayout';
import ConversationList from '@/components/messaging/ConversationList';
import MessageThread from '@/components/messaging/MessageThread';
import CallHistory from '@/components/messaging/CallHistory';
import NewChatDialog from '@/components/messaging/NewChatDialog';
import { MessageSquare, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CallSession } from '@/hooks/useWebRTC';

interface OtherUser {
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean;
}

interface Participant {
  user_id: string;
  last_read_at: string | null;
  profiles: OtherUser | OtherUser[];
}

export default function Messages() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversations, loading: convsLoading, startConversation, createGroup, createCommunity, joinByCode } = useConversations();
  
  const selectedConvId = searchParams.get('conv');
  const newUserId = searchParams.get('new');
  const answerCallId = searchParams.get('answer');
  const draft = searchParams.get('draft');
  const draftNonce = searchParams.get('nonce');
  const [activeTab, setActiveTab] = useState<'messages' | 'calls'>('messages');
  
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [pendingAnswerCall, setPendingAnswerCall] = useState<CallSession | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const selectedConversation: Conversation | undefined =
    conversations.find(c => c.id === selectedConvId) || undefined;

  // Handle answering call from global provider via URL param
  useEffect(() => {
    if (answerCallId && selectedConvId) {
      const fetchCallSession = async () => {
        const { data } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', answerCallId)
          .single();
        
        if (data) {
          setPendingAnswerCall(data as unknown as CallSession);
        }
        
        setSearchParams({ conv: selectedConvId });
      };
      fetchCallSession();
    }
  }, [answerCallId, selectedConvId]);

  // Handle starting new conversation from profile page
  useEffect(() => {
    if (newUserId && user) {
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

  // Fetch other user info when conversation is selected
  useEffect(() => {
    if (!selectedConvId || !user) {
      setOtherUser(null);
      setOtherUserId(null);
      return;
    }

    const fetchOtherUser = async () => {
      const { data } = await supabase
        .from('conversation_participants')
        .select(`
          user_id,
          last_read_at,
          profiles (
            display_name,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('conversation_id', selectedConvId);

      const participants = data as Participant[] | null;
      const other = participants?.find((p) => p.user_id !== user.id);
      const myParticipant = participants?.find((p) => p.user_id === user.id);
      
      if (other) {
        const profile = Array.isArray(other.profiles) ? other.profiles[0] : other.profiles;
        setOtherUser(profile);
        setOtherUserId(other.user_id);
      }
      
      if (other) {
        setLastReadAt(other.last_read_at);
      }
    };

    fetchOtherUser();

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
          if (updated.user_id !== user.id) {
            setLastReadAt(updated.last_read_at);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConvId, user]);

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
        'flex relative',
        isChatOpen ? 'h-[100dvh]' : 'h-[calc(100vh-48px)] lg:h-screen'
      )}>
        {/* Conversation List Panel */}
        <div className={cn(
          'w-full md:w-80 lg:w-96 flex flex-col',
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
            <ConversationList
              conversations={conversations}
              loading={convsLoading}
              selectedId={selectedConvId || undefined}
              onSelect={handleSelectConversation}
              onNewChat={() => setShowNewChat(true)}
            />
          ) : (
            <CallHistory />
          )}
        </div>

        {/* Message Thread Panel */}
        <div className={cn(
          'flex-1 flex flex-col',
          !selectedConvId ? 'hidden md:flex' : 'flex'
        )}>
          {selectedConvId ? (
            <MessageThread
              conversationId={selectedConvId}
              conversation={selectedConversation}
              otherUser={otherUser}
              otherUserId={otherUserId}
              onBack={handleBack}
              lastReadAt={lastReadAt}
              pendingAnswerCall={pendingAnswerCall}
              onCallAnswered={() => setPendingAnswerCall(null)}
              initialDraft={draft || undefined}
              draftNonce={draftNonce || undefined}
            />
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
