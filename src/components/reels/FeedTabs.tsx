import { cn } from '@/lib/utils';
import { ReelsFeedType } from '@/hooks/useReels';
import { Button } from '@/components/ui/button';
import { Clapperboard, X } from 'lucide-react';

interface FeedTabsProps {
  feedType: ReelsFeedType;
  onFeedTypeChange: (type: ReelsFeedType) => void;
  onClose: () => void;
}

export default function FeedTabs({ feedType, onFeedTypeChange, onClose }: FeedTabsProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-[60] flex items-center gap-2 px-4 pt-4 pb-4 sm:pt-6">
      <Button
        variant="ghost" size="icon"
        onClick={onClose}
        className="h-10 w-10 shrink-0 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
        aria-label="Close reels"
      >
        <X className="h-5 w-5" />
      </Button>

      <div className="flex flex-1 justify-center">
        <div className="flex items-center rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur-md">
          {([
            { value: 'following' as const, label: 'Following' },
            { value: 'foryou' as const, label: 'For You' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onFeedTypeChange(value)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                feedType === value
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white/90"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex w-10 shrink-0 items-center justify-end">
        <Clapperboard className="h-4 w-4 text-white/30" aria-hidden="true" />
      </div>
    </div>
  );
}
