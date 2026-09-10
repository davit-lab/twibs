import { useMemo } from 'react';
import { Plus, Loader2, Megaphone } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { GroupedStories } from '@/hooks/useStories';

interface StoryTrayProps {
  user: { id: string } | null;
  groups: GroupedStories[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  onOpenCreator: () => void;
  onPlayGroup: (groupIndex: number) => void;
  onRetry: () => void;
}

function getInitials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function ringBg(active: boolean) {
  // Unseen stories get the violet brand ring; seen/advertised stay neutral.
  return active ? 'bg-primary' : 'bg-muted';
}

function RingAvatar({ src, name, size = 'w-14 h-14', isAd }: { src?: string | null; name: string; size?: string; isAd?: boolean }) {
  return (
    <div className={cn('rounded-full bg-background p-[2px]', size)}>
      {isAd ? (
        <div className={cn('rounded-full bg-surface-3 flex items-center justify-center', size)}>
          <Megaphone className="h-6 w-6 text-foreground/70" />
        </div>
      ) : (
        <Avatar className={size}>
          <AvatarImage src={src || undefined} />
          <AvatarFallback className="bg-neutral-800 text-white">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

export default function StoryTray({ user, groups, loading, error, uploading, onOpenCreator, onPlayGroup, onRetry }: StoryTrayProps) {
  const yourIndex = useMemo(
    () => (user ? groups.findIndex(g => g.user_id === user.id) : -1),
    [groups, user]
  );
  const hasOwnStories = yourIndex >= 0;

  if (loading) {
    return (
      <div className="py-4">
        <div className="flex gap-4 px-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 w-[72px]">
              <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
              <div className="w-14 h-3 rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasAnyStories = groups.length > 0;

  return (
    <div className="py-4">
      <ScrollArea className="w-full">
        <div className="flex gap-4 px-4">
          {user && (
            <button
              type="button"
              onClick={hasOwnStories ? () => onPlayGroup(yourIndex) : onOpenCreator}
              className="flex flex-col items-center gap-1.5 w-[72px] group"
              aria-label={hasOwnStories ? 'View your story' : 'Add to your story'}
            >
              <div className="relative">
                {hasOwnStories ? (
                  <div className={cn('p-[2.5px] rounded-full transition-colors group-hover:opacity-90', ringBg(true))}>
                    <RingAvatar src={groups[yourIndex].avatar_url} name={groups[yourIndex].display_name} />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface-2 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center transition-colors group-hover:border-primary group-hover:bg-surface-3">
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Plus className="h-6 w-6 text-primary" />
                    )}
                  </div>
                )}
                {hasOwnStories && !uploading && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); onOpenCreator(); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onOpenCreator(); } }}
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background"
                    aria-label="Add to your story"
                  >
                    <Plus className="h-3 w-3" />
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-tight font-semibold text-foreground truncate max-w-[72px]">
                Your story
              </span>
            </button>
          )}

          {groups.map((group, index) => {
            const isAd = !!group.ad;
            return (
              <button
                key={group.user_id}
                onClick={() => onPlayGroup(index)}
                className="flex flex-col items-center gap-1.5 w-[72px] group"
                aria-label={`View ${isAd ? 'sponsored story' : `${group.display_name}'s story`}`}
              >
                <div className={cn('p-[2.5px] rounded-full transition-colors group-hover:opacity-90', ringBg(!isAd && group.has_unviewed))}>
                  <RingAvatar src={group.avatar_url} name={group.display_name} isAd={isAd} />
                </div>
                <span className={cn(
                  'text-[11px] leading-tight font-medium truncate max-w-[72px]',
                  isAd ? 'text-muted-foreground' : group.has_unviewed ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {group.user_id === user?.id ? 'You' : isAd ? 'Sponsored' : group.display_name}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="mx-4 mt-2 flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2 text-xs text-muted-foreground hover:bg-surface-3"
          >
            <Loader2 className="h-3.5 w-3.5" />
            Couldn’t load stories — tap to retry
          </button>
        )}

        {!error && user && !hasAnyStories && !uploading && (
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">
            Stories from people you follow appear here and disappear after 24 hours.
          </p>
        )}

        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}