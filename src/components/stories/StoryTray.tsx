import { useMemo } from 'react';
import { Plus, Loader2, Megaphone } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { GroupedStories, StoryUploadState } from '@/hooks/useStories';

interface StoryTrayProps {
  user: { id: string } | null;
  groups: GroupedStories[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  uploadState?: StoryUploadState;
  onOpenCreator: () => void;
  onPlayGroup: (groupIndex: number) => void;
  onRetry: () => void;
}

function getInitials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function RingAvatar({ src, name, size = 'h-14 w-14', isAd }: { src?: string | null; name: string; size?: string; isAd?: boolean }) {
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

function UploadRing({ progress, active, children }: { progress: number; active: boolean; children: React.ReactNode }) {
  const p = Math.min(100, Math.max(0, Math.round(progress * 100)));
  return (
    <div
      className="relative rounded-full p-[2.5px] transition-colors"
      style={{
        background: active
          ? `conic-gradient(#8B5CF6 ${p}%, rgba(255,255,255,0.14) ${p}%)`
          : undefined,
      }}
    >
      {children}
    </div>
  );
}

export default function StoryTray({
  user,
  groups,
  loading,
  error,
  uploading,
  uploadState,
  onOpenCreator,
  onPlayGroup,
  onRetry,
}: StoryTrayProps) {
  const yourIndex = useMemo(
    () => (user ? groups.findIndex(g => g.user_id === user.id) : -1),
    [groups, user]
  );
  const hasOwnStories = yourIndex >= 0;

  if (loading) {
    return (
      <div className="py-4">
        <div className="flex gap-4 overflow-hidden px-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
              <div className="h-16 w-16 animate-pulse rounded-full bg-neutral-800" />
              <div className="h-3 w-14 animate-pulse rounded bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasAnyStories = groups.length > 0;
  const uploadProgress = uploadState?.progress ?? 0;

  return (
    <div className="py-4">
      <div className="flex gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {user && (
          <button
            type="button"
            onClick={hasOwnStories ? () => onPlayGroup(yourIndex) : onOpenCreator}
            className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5"
            aria-label={hasOwnStories ? 'View your story' : 'Add to your story'}
          >
            <div className="relative">
              {hasOwnStories ? (
                <UploadRing progress={uploadProgress} active={uploading}>
                  <RingAvatar src={groups[yourIndex].avatar_url} name={groups[yourIndex].display_name} />
                </UploadRing>
              ) : (
                <UploadRing progress={uploadProgress} active={uploading}>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-zinc-600 bg-surface-2 transition-colors group-hover:border-violet-500 group-hover:bg-surface-3">
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                    ) : (
                      <Plus className="h-6 w-6 text-violet-500" />
                    )}
                  </div>
                </UploadRing>
              )}
              {hasOwnStories && !uploading && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); onOpenCreator(); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onOpenCreator(); } }}
                  className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-violet-600 text-white"
                  aria-label="Add to your story"
                >
                  <Plus className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className="mt-0.5 max-w-[72px] truncate text-[11px] font-semibold leading-tight text-foreground">
              {uploading ? 'Posting…' : 'Your story'}
            </span>
          </button>
        )}

        {groups.map((group, index) => {
          const isAd = !!group.ad;
          return (
            <button
              key={group.user_id}
              onClick={() => onPlayGroup(index)}
              className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5"
              aria-label={`View ${isAd ? 'sponsored story' : `${group.display_name}'s story`}`}
            >
              <div className={cn('rounded-full p-[2.5px] transition-opacity group-hover:opacity-90', !isAd && group.has_unviewed ? 'bg-violet-600' : 'bg-neutral-700')}>
                <RingAvatar src={group.avatar_url} name={group.display_name} isAd={isAd} />
              </div>
              <span className={cn(
                'mt-0.5 max-w-[72px] truncate text-[11px] font-medium leading-tight',
                isAd ? 'text-zinc-500' : group.has_unviewed ? 'text-foreground' : 'text-zinc-500'
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
    </div>
  );
}