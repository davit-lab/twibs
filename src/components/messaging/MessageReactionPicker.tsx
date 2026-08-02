import { cn } from '@/lib/utils';

interface MessageReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position: 'left' | 'right';
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

export default function MessageReactionPicker({
  onSelect,
  onClose,
  position,
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
          "absolute z-50 bottom-full mb-2 flex items-center gap-1 p-2 rounded-full",
          "bg-background/95  border border-border/50 shadow-xl",
          " origin-bottom",
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
      </div>
    </>
  );
}
