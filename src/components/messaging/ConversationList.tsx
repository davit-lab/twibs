import { Conversation } from '@/hooks/useConversations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus, BellOff, MessageSquareText, BadgeCheck, X } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { isUserOnline } from '@/hooks/usePresence';
import AvatarCollage from './AvatarCollage';

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
      return `${conv.participant_count} member${conv.participant_count === 1 ? '' : 's'}`;
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

  const tabCount = (tab: typeof TABS[number]) => {
    if (tab === 'Unread') return conversations.filter(c => c.unread_count > 0).length;
    if (tab === 'Groups') return conversations.filter(c => c.type === 'group').length;
    if (tab === 'Communities') return conversations.filter(c => c.type === 'community').length;
    return conversations.length;
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-card border-r border-border/50">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
        <div className="px-5 pb-4 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex-1 px-3 space-y-1.5">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/50">
      {/* Header */}
      <div className="relative px-5 pt-5 pb-3 overflow-hidden">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-48 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[22px] font-extrabold tracking-tight leading-none bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">Chats</h1>
            {conversations.length > 0 && (
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {conversations.length}
              </span>
            )}
          </div>
          <button
            onClick={onNewChat}
            aria-label="New chat"
            className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] text-primary-foreground flex items-center justify-center transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary/30 active:scale-95 shadow-md shadow-primary/25"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-9 rounded-full bg-surface-2 text-foreground text-sm outline-none border border-transparent transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 focus:bg-background"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-surface-3 text-muted-foreground flex items-center justify-center hover:bg-surface-4 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const active = activeTab === tab;
          const count = tabCount(tab);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 whitespace-nowrap',
                active
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
              )}
            >
              {tab}
              {count > 0 && tab !== 'All' && (
                <span className={cn(
                  'text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center tabular-nums',
                  active ? 'bg-background/20 text-background' : 'bg-surface-3 text-muted-foreground'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2.5 pb-4">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center">
                <MessageSquareText className="w-8 h-8 text-muted-foreground/70" strokeWidth={1.5} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <Plus className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
              </span>
            </div>
            <p className="font-semibold">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-[220px]">
              {searchQuery || activeTab !== 'All'
                ? 'Nothing matches your filters.'
                : 'Start a conversation from someone\u2019s profile'}
            </p>
            <button
              onClick={onNewChat}
              className="mt-5 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold shadow-md shadow-black/10 hover:opacity-90 active:scale-95 transition-all"
            >
              Start new chat
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredConversations.map((conv, index) => {
              const isG = isGroup(conv);
              const online = !isG && isUserOnline(conv.participants[0]?.profiles?.last_seen_at);
              const verified = !isG && !!conv.participants[0]?.profiles?.is_verified;
              const title = getTitle(conv);
              const avatarUrl = getAvatar(conv);
              const selected = selectedId === conv.id;
              const unread = conv.unread_count > 0;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                  className={cn(
                    'chat-item-in group relative w-full text-left flex items-center gap-3 rounded-2xl p-3 transition-all duration-200',
                    selected
                      ? 'bg-primary/[0.07]'
                      : 'hover:bg-surface-2'
                  )}
                >
                  {selected && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-9 w-[3px] rounded-r-full bg-primary" />
                  )}

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {isG ? (
                      <AvatarCollage
                        items={conv.participants.slice(0, 3).map(p => ({
                          url: p.profiles?.avatar_url,
                          name: p.profiles?.display_name,
                        }))}
                        size={48}
                        count={conv.participant_count}
                      />
                    ) : (
                      <>
                        <div className={cn(
                          'rounded-full p-[2px] transition-all duration-200',
                          online ? 'bg-gradient-to-tr from-success to-emerald-400' : 'bg-transparent'
                        )}>
                          <Avatar className="h-12 w-12 rounded-full ring-2 ring-background">
                            <AvatarImage src={avatarUrl || undefined} />
                            <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-sm font-bold">
                              {getInitials(title)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card',
                            online ? 'bg-success' : 'bg-muted-foreground/40'
                          )}
                        />
                      </>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn(
                        'truncate text-[15px] flex items-center gap-1.5',
                        unread ? 'font-bold' : 'font-semibold'
                      )}>
                        {title}
                        {verified && (
                          <BadgeCheck className="h-4 w-4 text-primary fill-primary/15 flex-shrink-0" />
                        )}
                        {conv.type === 'community' && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 flex-shrink-0">
                            Community
                          </span>
                        )}
                        {conv.type === 'group' && (
                          <span className="text-[10px] font-bold text-muted-foreground bg-surface-3 rounded-full px-2 py-0.5 flex-shrink-0">
                            Group
                          </span>
                        )}
                      </span>
                      <span className={cn(
                        'text-[11px] flex-shrink-0 tabular-nums',
                        unread ? 'text-primary font-semibold' : 'text-muted-foreground'
                      )}>
                        {conv.last_message ? formatTimestamp(conv.last_message.created_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-[13px] truncate flex-1',
                        unread ? 'text-foreground font-medium' : 'text-muted-foreground'
                      )}>
                        {conv.last_message
                          ? conv.type === 'dm' || conv.participants.length <= 1
                            ? conv.last_message.content
                            : `${getSenderName(conv, conv.last_message.sender_id)}: ${conv.last_message.content}`
                          : getSubtitle(conv)}
                      </p>
                      {conv.muted && (
                        <span className="text-muted-foreground/70 flex-shrink-0">
                          <BellOff className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {unread && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center tabular-nums shadow-sm shadow-primary/30">
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

function formatTimestamp(date: string | Date) {
  const d = new Date(date);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function getSenderName(conv: Conversation, senderId: string): string {
  const sender = conv.participants.find(p => p.user_id === senderId);
  if (sender?.profiles?.display_name) return sender.profiles.display_name;
  return 'You';
}
