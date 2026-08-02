import { cn } from '@/lib/utils';
import { ReactionGroup } from '@/hooks/useMessageReactions';

interface MessageReactionsProps {
  reactions: ReactionGroup[];
  isOwn: boolean;
  onToggle: (emoji: string) => void;
}

export default function MessageReactions({
  reactions,
  isOwn,
  onToggle,
}: MessageReactionsProps) {
  if (reactions.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 mt-1",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      {reactions.map(({ emoji, count, hasReacted }) => (
        <button
          key={emoji}
          onClick={() => onToggle(emoji)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
            "transition-all duration-200 hover:scale-105",
            hasReacted
              ? "bg-primary/20 border border-primary/40 text-primary"
              : "bg-muted/80 border border-border/50 text-foreground"
          )}
        >
          <span>{emoji}</span>
          {count > 1 && <span className="font-medium">{count}</span>}
        </button>
      ))}
    </div>
  );
}
