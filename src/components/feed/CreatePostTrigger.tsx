import { Plus } from 'lucide-react';

interface CreatePostTriggerProps {
  onClick: () => void;
}

export default function CreatePostTrigger({ onClick }: CreatePostTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Create a post"
      className="group flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/50 px-4 text-[14px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span>Create a post</span>
      <span className="grid h-6 w-6 place-items-center rounded-full border border-border/70 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary group-focus-visible:border-primary/40 group-focus-visible:text-primary">
        <Plus className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}