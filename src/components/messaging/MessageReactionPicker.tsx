import { Reply, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position: 'left' | 'right';
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

export default function MessageReactionPicker({
  onSelect,
  onClose,
  position,
  onReply,
  onEdit,
  onDelete,
}: MessageReactionPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      
      {/* Picker */}
      <div
        className={cn(
          "absolute z-50 bottom-full mb-2 flex items-center gap-1 p-2 rounded-2xl",
          "bg-background/95 border border-border/50 shadow-xl",
          "origin-bottom",
          position === 'right' ? 'right-0' : 'left-0'
        )}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full text-xl",
              "hover:bg-muted hover:scale-125 transition-all duration-200",
              "active:scale-100"
            )}
          >
            {emoji}
          </button>
        ))}
        {onReply && (
          <div className="w-px h-6 bg-border/60 mx-1" />
        )}
        {onReply && (
          <button
            onClick={() => {
              onReply();
              onClose();
            }}
            className={cn(
              "h-10 px-3 flex items-center gap-1.5 rounded-full text-xs font-medium",
              "text-muted-foreground hover:bg-muted hover:text-foreground transition-all",
              "active:scale-95"
            )}
            title="Reply"
          >
            <Reply className="h-4 w-4" />
            Reply
          </button>
        )}
        {(onEdit || onDelete) && (
          <div className="w-px h-6 bg-border/60 mx-1" />
        )}
        {onEdit && (
          <button
            onClick={() => {
              onEdit();
              onClose();
            }}
            className={cn(
              "h-10 px-3 flex items-center gap-1.5 rounded-full text-xs font-medium",
              "text-foreground hover:bg-muted transition-all",
              "active:scale-95"
            )}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className={cn(
              "h-10 px-3 flex items-center gap-1.5 rounded-full text-xs font-medium",
              "text-destructive hover:bg-destructive/10 transition-all",
              "active:scale-95"
            )}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </>
  );
}
