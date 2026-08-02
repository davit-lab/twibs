import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Star, BadgeCheck } from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

interface Liker {
  user_id: string;
  created_at: string;
  profile?: { username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
}

interface ReelLikersModalProps {
  reelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReelLikersModal({ reelId, open, onOpenChange }: ReelLikersModalProps) {
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reelId || !open) return;
    setLoading(true);

    supabase.from('reel_likes').select('user_id, created_at').eq('reel_id', reelId).order('created_at', { ascending: false }).limit(100)
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setLikers([]); setLoading(false); return; }
        const { data: profiles } = await supabase.from('profiles').select('user_id, username, display_name, avatar_url, is_verified').in('user_id', data.map(l => l.user_id));
        const map = new Map(profiles?.map(p => [p.user_id, p]));
        setLikers(data.map(l => ({ ...l, profile: map.get(l.user_id) })));
        setLoading(false);
      });
  }, [reelId, open]);

  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl bg-black border-white/10">
        <SheetHeader className="pb-4 border-b border-white/10">
          <SheetTitle className="flex items-center justify-center gap-2 text-white">
            <Star className="h-5 w-5 text-primary fill-primary/20" /> Likes
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-60px)] mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
          ) : likers.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Star className="h-7 w-7 text-white/30 mb-4" />
              <p className="text-white/50 text-sm">No likes yet</p>
            </div>
          ) : (
            <div className="space-y-1 px-1">
              {likers.map(liker => (
                <Link key={liker.user_id} to={`/profile/${liker.profile?.username}`} onClick={() => onOpenChange(false)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={liker.profile?.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-neutral-800 text-white text-sm font-medium">{getInitials(liker.profile?.display_name || 'U')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-medium text-sm truncate">{liker.profile?.display_name || 'Unknown'}</span>
                      {liker.profile?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-blue-400 fill-blue-400/20 flex-shrink-0" />}
                    </div>
                    <span className="text-white/40 text-xs">@{liker.profile?.username || 'unknown'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
