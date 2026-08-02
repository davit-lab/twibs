import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PremiumBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

const sizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const containerClasses = {
  sm: 'h-4 w-4 -bottom-0.5 -right-0.5',
  md: 'h-5 w-5 -bottom-0.5 -right-0.5',
  lg: 'h-6 w-6 -bottom-1 -right-1',
};

export function PremiumBadge({ size = 'sm', className, showTooltip = true }: PremiumBadgeProps) {
  const badge = (
    <div
      className={cn(
        'absolute flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-md border border-amber-300/50',
        containerClasses[size],
        className
      )}
    >
      <Crown className={cn('text-white', sizeClasses[size])} strokeWidth={2.5} />
    </div>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Premium Member
      </TooltipContent>
    </Tooltip>
  );
}

export default PremiumBadge;
