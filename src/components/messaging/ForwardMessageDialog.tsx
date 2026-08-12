import { useState } from 'react';
import { Send, X, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useConversations, Conversation } from '@/hooks/useConversations';
import { useAuth } from '@/contexts/AuthContext';
import { Message } from '@/hooks/useMessages';

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  onForward: (conversation: Conversation, message: Message) => Promise<boolean>;
}

export default function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  onForward,
}: ForwardMessageDialogProps) {
  const { user } = useAuth();
  const { conversations, loading } = useConversations();
  const [query, setQuery] = useState('');
  const [forwardingId, setForwardingId] = useState<string | null>(null);

  const getConversationName = (c: Conversation) => {
    if (c.type !== 'dm') return c.name || 'Group';
    const other = c.participants.find((p) => p.user_id !== user?.id);
    return other?.profiles?.display_name || 'Chat';
  };

  const getConversationAvatar = (c: Conversation) => {
    if (c.type !== 'dm') return c.avatar_url;
    const other = c.participants.find((p) => p.user_id !== user?.id);
    return other?.profiles?.avatar_url || null;
  };

  const filtered = conversations.filter((c) =>
    getConversationName(c).toLowerCase().includes(query.toLowerCase())
  );

  const preview = message ? (message.content?.trim() || '📎 Attachment') : '';

  const handleForward = async (c: Conversation) => {
    if (!message) return;
    setForwardingId(c.id);
    const ok = await onForward(c, message);
    setForwardingId(null);
    if (ok) {
      onOpenChange(false);
      setQuery('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Forward message
          </DialogTitle>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-3 rounded-xl bg-muted/50 border border-border/60 p-3 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary mb-0.5">Forwarding</p>
              <p className="text-sm text-muted-foreground line-clamp-2 break-words">{preview}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="icon-btn h-7 w-7 rounded-full flex-shrink-0"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="w-full h-10 rounded-xl bg-muted/50 border border-border/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-2 p-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No chats found</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleForward(c)}
                  disabled={forwardingId !== null}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/60 transition-colors text-left disabled:opacity-50"
                >
                  <Avatar className="h-9 w-9 rounded-full flex-shrink-0">
                    <AvatarImage src={getConversationAvatar(c) || undefined} />
                    <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                      {getConversationName(c).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {getConversationName(c)}
                  </span>
                  <Button size="sm" className="h-8 rounded-full gap-1.5 flex-shrink-0">
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
