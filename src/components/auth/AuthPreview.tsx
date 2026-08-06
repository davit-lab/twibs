import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Phone, Video, Plus, Smile,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FEED_PICS = [
  'https://picsum.photos/id/1015/300/300',
  'https://picsum.photos/id/1016/300/300',
  'https://picsum.photos/id/1039/300/300',
  'https://picsum.photos/id/1074/300/300',
  'https://picsum.photos/id/1025/300/300',
  'https://picsum.photos/id/1018/300/300',
];

function Bubble({ own, children }: { own?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex', own ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[78%] px-3.5 py-2 text-sm leading-snug', own ? 'message-own' : 'message-other')}>
        {children}
      </div>
    </div>
  );
}

export function ChatPreview() {
  return (
    <div className="w-full max-w-sm bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/30">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/60">
        <div className="relative">
          <img src="https://i.pravatar.cc/100?img=47" alt="Maya" className="w-10 h-10 rounded-full object-cover" />
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-card" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Maya</p>
          <p className="text-xs text-muted-foreground">online now</p>
        </div>
        <div className="flex items-center gap-3 ml-auto text-muted-foreground">
          <Phone className="h-5 w-5" />
          <Video className="h-5 w-5" />
        </div>
      </div>

      <div className="p-4 space-y-2.5 bg-surface">
        <Bubble>Hey! Are you still up? 👀</Bubble>
        <Bubble>I just saw your new post 😍</Bubble>
        <Bubble own>Yeah! Just got back from the trip</Bubble>
        <Bubble own>The sunset photo is my favorite 🌅</Bubble>
        <div className="flex justify-start">
          <div className="typing-bubble"><span /><span /><span /></div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-card">
        <div className="orbis-input-wrap h-10">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Message</span>
        </div>
        <Smile className="h-5 w-5 text-muted-foreground shrink-0 cursor-pointer" />
        <div className="send-btn">
          <Send className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function FeedPreview() {
  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/30">
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="https://i.pravatar.cc/100?img=32" alt="sophia.photos" className="w-8 h-8 rounded-full object-cover" />
          <p className="text-sm font-semibold">sophia.photos</p>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground ml-auto" />
        </div>
        <img src="https://picsum.photos/id/1011/800/700" alt="Golden hour photo" className="w-full h-72 object-cover" />
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-4 text-foreground">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Send className="h-5 w-5" />
            <Bookmark className="h-5 w-5 ml-auto" />
          </div>
          <p className="text-sm font-semibold mt-2.5">2,418 likes</p>
          <p className="text-sm mt-1">
            <span className="font-semibold">sophia.photos</span> golden hour hits different 🧡
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FEED_PICS.map((src, i) => (
          <img key={i} src={src} alt="Feed photo" loading="lazy" className="w-full h-20 rounded-xl object-cover" />
        ))}
      </div>
    </div>
  );
}
