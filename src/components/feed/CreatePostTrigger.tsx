import { Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface CreatePostTriggerProps {
  onClick: () => void;
  avatarUrl?: string | null;
  displayName?: string | null;
  className?: string;
}

export default function CreatePostTrigger({
  onClick,
  avatarUrl,
  displayName,
  className,
}: CreatePostTriggerProps) {
  const initials =
    displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Create a post"
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-surface/60 p-2 pl-3 text-left transition-colors',
        'hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className
      )}
    >
      <Avatar className="h-9 w-9 flex-shrink-0 ring-1 ring-border/80">
        <AvatarImage src={avatarUrl || undefined} alt={displayName || 'You'} />
        <AvatarFallback className="bg-neutral-700 text-white text-xs">{initials}</AvatarFallback>
      </Avatar>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Start a post…
        </span>
        <span className="block truncate text-[11px] text-muted-foreground/70">
          Share with your interests
        </span>
      </span>

      <span className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-[13px] font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Plus className="h-3.5 w-3.5" />
        Post
      </span>

      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-active:scale-95 sm:hidden">
        <Plus className="h-4 w-4" />
      </span>
    </button>
  );
}