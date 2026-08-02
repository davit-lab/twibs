import { Conversation } from '@/hooks/useConversations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus, BellOff, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { isUserOnline } from '@/hooks/usePresence';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  selectedId?: string;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

const TABS = ['All', 'Unread', 'Groups', 'Communities'] as const;

export default function ConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  onNewChat,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All');

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const filteredConversations = conversations.filter(conv => {
    if (activeTab === 'Groups') return conv.type === 'group';
    if (activeTab === 'Communities') return conv.type === 'community';
    if (activeTab === 'Unread') return conv.unread_count > 0;

    const otherUser = conv.participants[0]?.profiles;
    const searchable = conv.type === 'dm'
      ? `${otherUser?.display_name || ''} ${otherUser?.username || ''}`
      : (conv.name || '');
    return searchable.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const isGroup = (conv: Conversation) => conv.type !== 'dm';

  const getTitle = (conv: Conversation) => {
    if (isGroup(conv)) return conv.name || 'Unnamed group';
    return conv.participants[0]?.profiles?.display_name || 'Unknown';
  };

  const getSubtitle = (conv: Conversation) => {
    if (isGroup(conv)) {
      return `${conv.participant_count} members`;
    }
    const profile = conv.participants[0]?.profiles;
    if (!profile) return '';
    return isUserOnline(profile.last_seen_at) ? 'Online' : 'Offline';
  };

  const getAvatar = (conv: Conversation) => {
    const avatars = conv.participants
      .slice(0, 3)
      .map(p => p.profiles?.avatar_url)
      .filter(Boolean) as string[];

    if (isGroup(conv)) {
      return conv.avatar_url || avatars[0] || undefined;
    }
    return conv.participants[0]?.profiles?.avatar_url || undefined;
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-card">
        <div className="panel-head">
          <Skeleton className="h-7 w-28" />
          <div className="flex gap-1">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
        <div className="px-5 pb-3">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="px-5 pb-3 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex-1 px-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      {/* Header */}
      <div className="panel-head">
        <h2>Messages</h2>
        <div className="flex gap-1">
          <button className="icon-btn h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary" onClick={onNewChat}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="orbis-search"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('orbis-tab whitespace-nowrap', activeTab === tab && 'active')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-primary/70" />
            </div>
            <p className="font-semibold">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start a conversation from someone's profile
            </p>
            <ButtonLike onClick={onNewChat} />
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {filteredConversations.map((conv) => {
              const isG = isGroup(conv);
              const online = !isG && isUserOnline(conv.participants[0]?.profiles?.last_seen_at);
              const title = getTitle(conv);
              const avatarUrl = getAvatar(conv);

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'contact-item w-full text-left',
                    selectedId === conv.id && 'active'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    {isG ? (
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md shadow-primary/15">
                        <Users className="h-5 w-5 text-white" />
                        {conv.participant_count > 0 && (
                          <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-background border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center tabular-nums">
                            {conv.participant_count}
                          </span>
                        )}
                      </div>
                    ) : (
                      <>
                        <Avatar className="h-12 w-12 rounded-full">
                          <AvatarImage src={avatarUrl || undefined} />
                          <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-sm font-bold">
                            {getInitials(title)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                          online ? 'bg-success' : 'bg-muted-foreground/40'
                        )} />
                      </>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn(
                        "truncate text-sm flex items-center gap-1.5",
                        conv.unread_count > 0 ? "font-semibold" : "font-medium"
                      )}>
                        {title}
                        {conv.type === 'community' && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                            Community
                          </span>
                        )}
                        {conv.type === 'group' && (
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 flex-shrink-0">
                            Group
                          </span>
                        )}
                      </span>
                      {conv.last_message && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm truncate flex-1",
                        conv.unread_count > 0 ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {conv.last_message
                          ? conv.type === 'dm' || conv.participants.length <= 1
                            ? conv.last_message.content
                            : `${getSenderName(conv, conv.last_message.sender_id)}: ${conv.last_message.content}`
                          : getSubtitle(conv)}
                      </p>
                      {conv.muted && <BellOff className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      {conv.unread_count > 0 && (
                        <span className="unread-badge">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ButtonLike({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/25 hover:bg-primary/90 transition-colors"
    >
      Start new chat
    </button>
  );
}

function getSenderName(conv: Conversation, senderId: string): string {
  const sender = conv.participants.find(p => p.user_id === senderId);
  if (sender?.profiles?.display_name) return sender.profiles.display_name;
  return 'You';
}
