import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BadgeCheck, Music2 } from 'lucide-react';
import { Reel } from '@/hooks/useReels';
import defaultAvatar from '@/assets/default-avatar.png';

interface AudioDetailsSheetProps {
  reel: Reel | null;
  similarReels: Reel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AudioDetailsSheet({ reel, similarReels, open, onOpenChange }: AudioDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl border-white/10 bg-zinc-950 p-0 overflow-hidden">
        <SheetHeader className="px-5 pb-4 pt-5 border-b border-white/10">
          <SheetTitle className="text-white text-center">Original Sound</SheetTitle>
        </SheetHeader>

        {reel && (
          <div className="flex flex-col h-[calc(70vh-64px)] overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-4 p-5">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-600 via-neutral-800 to-black p-[3px] ring-1 ring-white/15 animate-vinyl-spin" style={{ animationDuration: '6s' }}>
                <Avatar className="h-full w-full rounded-xl">
                  <AvatarImage src={reel.profile?.avatar_url || defaultAvatar} className="object-cover" />
                  <AvatarFallback className="bg-neutral-800 text-sm text-white">&#9835;</AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-white">{reel.audio_name || 'Original Audio'}</h3>
                <Link to={`/profile/${reel.profile?.username}`} className="mt-1 flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
                  <span>{reel.audio_url ? 'Audio by' : 'Original sound by'} @{reel.profile?.username || 'unknown'}</span>
                  {reel.profile?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-blue-400 fill-blue-400/20" />}
                </Link>
              </div>
            </div>

            <div className="px-5 pb-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                {similarReels.length} reels using this sound
              </p>

              {similarReels.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-10 text-center">
                  <Music2 className="h-8 w-8 text-white/20" />
                  <p className="text-sm text-white/40">No other reels use this sound yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {similarReels.slice(0, 9).map((r) => (
                    <Link
                      key={r.id}
                      to={`/profile/${r.profile?.username}`}
                      className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10"
                    >
                      <video
                        src={r.video_url}
                        preload="metadata"
                        muted
                        playsInline
                        className="h-full w-full object-cover opacity-80 transition-all duration-200 group-hover:opacity-100 group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-medium text-white">
                        @{r.profile?.username || 'unknown'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
