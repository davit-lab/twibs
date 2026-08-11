import { cn } from '@/lib/utils';
import { ReelsFeedType } from '@/hooks/useReels';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FeedTabsProps {
  feedType: ReelsFeedType;
  onFeedTypeChange: (type: ReelsFeedType) => void;
  onClose: () => void;
}

export default function FeedTabs({ feedType, onFeedTypeChange, onClose }: FeedTabsProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-[60] flex items-center px-4 pt-4 sm:pt-6 pb-4">
      <Button
        variant="ghost" size="icon"
        onClick={onClose}
        className="h-10 w-10 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md hover:bg-black/55"
        aria-label="Close reels"
      >
        <X className="h-5 w-5" />
      </Button>

      <div className="flex-1 flex justify-center">
        <div className="flex items-center rounded-full border border-white/15 bg-black/35 p-1 backdrop-blur-md">
          {([
            { value: 'following' as const, label: 'Following' },
            { value: 'foryou' as const, label: 'For You' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onFeedTypeChange(value)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-colors",
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

      <div className="w-10" />
    </div>
  );
}
