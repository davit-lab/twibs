import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useConversations } from '@/hooks/useConversations';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, Copy, Send, ExternalLink, MessageCircle, Loader2, Link2, Check } from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

interface ReelShareSheetProps {
  reelId: string;
  shareCount: number;
  creatorUsername: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShareToStory: () => Promise<void>;
  onCopyLink: () => void;
}

export default function ReelShareSheet({
  reelId,
  shareCount,
  creatorUsername,
  open,
  onOpenChange,
  onShareToStory,
  onCopyLink,
}: ReelShareSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { conversations, startConversation } = useConversations();
  const { toast } = useToast();
  const [sharingStory, setSharingStory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const reelUrl = `${window.location.origin}/reels/${reelId}`;
  const shareText = `Check out this reel by @${creatorUsername}!`;

  const quickContacts = conversations
    .filter(c => c.participants.length > 0)
    .slice(0, 4)
    .map(c => c.participants[0]);

  const handleQuickSend = async (contact: { user_id: string; profiles: { username: string; display_name: string; avatar_url: string | null } }) => {
    if (!user) return;
    setSendingTo(contact.user_id);
    const convId = await startConversation(contact.user_id);
    setSendingTo(null);
    onOpenChange(false);
    if (convId) {
      toast({ title: `Link sent to ${contact.profiles?.username || 'user'}` });
      navigate(`/messages?conv=${convId}`);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not open chat' });
    }
  };

  const handleCopy = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const initials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-white/10 bg-zinc-950 p-0">
        <SheetHeader className="px-5 pb-3 pt-5">
          <SheetTitle className="text-center text-white">Share to</SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-6">
          {user && quickContacts.length > 0 && (
            <div className="mb-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Quick Send</p>
              <div className="flex gap-4">
                {quickContacts.map(contact => (
                  <button
                    key={contact.user_id}
                    onClick={() => handleQuickSend(contact)}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <div className="relative">
                      <Avatar className="h-12 w-12 ring-2 ring-transparent transition-all group-hover:ring-primary/70 group-hover:scale-105">
                        <AvatarImage src={contact.profiles?.avatar_url || defaultAvatar} className="object-cover" />
                        <AvatarFallback className="bg-neutral-800 text-xs text-white">
                          {initials(contact.profiles?.display_name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      {sendingTo === contact.user_id && (
                        <span className="absolute -inset-0.5 flex items-center justify-center rounded-full bg-black/60">
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                        </span>
                      )}
                    </div>
                    <span className="max-w-[56px] truncate text-[10px] text-white/60">
                      {contact.profiles?.username || 'user'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5 space-y-2">
            <button
              onClick={async () => {
                setSharingStory(true);
                try { await onShareToStory(); onOpenChange(false); }
                finally { setSharingStory(false); }
              }}
              disabled={sharingStory}
              className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60"
            >
              {sharingStory ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Sparkles className="h-5 w-5 text-white" />}
              <div>
                <p className="text-sm font-semibold text-white">Share to Story</p>
                <p className="text-xs text-white/70">Repost this reel to your story</p>
              </div>
            </button>

            <button
              onClick={handleCopy}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left transition-all hover:bg-white/10 active:scale-[0.99]"
            >
              {copied ? <Check className="h-5 w-5 text-primary" /> : <Copy className="h-5 w-5 text-white" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Copy Link</p>
                <p className="truncate text-xs text-white/40">{reelUrl}</p>
              </div>
            </button>
          </div>

          <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
            <Link2 className="h-4 w-4 flex-shrink-0 text-white/50" />
            <span className="truncate text-xs text-white/60">{reelUrl}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(reelUrl)}`, '_blank', 'width=600,height=400')}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 py-3 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <Send className="h-5 w-5" />
              <span className="text-[10px]">X / Twitter</span>
            </button>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${reelUrl}`)}`, '_blank')}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 py-3 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-[10px]">WhatsApp</span>
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'Check out this reel!', text: shareText, url: reelUrl }).catch(() => {});
                } else {
                  handleCopy();
                }
              }}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 py-3 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <ExternalLink className="h-5 w-5" />
              <span className="text-[10px]">More</span>
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] text-white/30">{shareCount} shares</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
