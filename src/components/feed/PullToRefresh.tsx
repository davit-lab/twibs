import { ReactNode, forwardRef } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  pullDistance: number;
  isRefreshing: boolean;
  progress: number;
  shouldRefresh: boolean;
}

const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(
  ({ children, pullDistance, isRefreshing, progress, shouldRefresh }, ref) => {
    return (
      <div ref={ref} className="relative">
        {/* Pull indicator */}
        <div
          className={cn(
            "absolute left-0 right-0 flex items-center justify-center transition-opacity duration-200 z-10",
            pullDistance > 0 || isRefreshing ? "opacity-100" : "opacity-0"
          )}
          style={{
            top: -60,
            height: 60,
            transform: `translateY(${Math.min(pullDistance, 60)}px)`,
          }}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
              shouldRefresh || isRefreshing
                ? "bg-primary text-primary-foreground "
                : "bg-muted text-muted-foreground"
            )}
            style={{
              transform: `scale(${0.5 + progress * 0.5}) rotate(${progress * 180}deg)`,
            }}
          >
            {isRefreshing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowDown
                className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  shouldRefresh && "rotate-180"
                )}
              />
            )}
          </div>
        </div>

        {/* Content with pull transform */}
        <div
          style={{
            transform: `translateY(${pullDistance}px)`,
            transition: pullDistance === 0 ? 'transform 0.3s ease-out' : 'none',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);

PullToRefresh.displayName = 'PullToRefresh';

export default PullToRefresh;
