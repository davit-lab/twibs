import { motion } from 'framer-motion';
import { Check, Bookmark } from 'lucide-react';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { BADGE_MILESTONES } from '@/hooks/useReadingStreak';
import { BADGE_DISPLAY_NAMES } from '@/hooks/useReadingStreak';

interface StreakMilestone {
  days: number;
  label: string;
  state: 'completed' | 'current' | 'future';
}

function useMilestones(currentStreak: number): StreakMilestone[] {
  return BADGE_MILESTONES.map((days) => {
    let state: StreakMilestone['state'] = 'future';
    if (currentStreak >= days) state = 'completed';
    else if (currentStreak > 0 && currentStreak < days) state = 'current';
    return { days, label: BADGE_DISPLAY_NAMES[`streak_${days}`] || `${days} days`, state };
  });
}

export default function StreakMilestones({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { streak } = useReadingStreak(targetUserId);
  const currentStreak = streak?.current_streak || 0;
  const milestones = useMilestones(currentStreak);

  const currentMilestone = milestones.find((m) => m.state === 'current');
  const nextMilestone = currentMilestone || milestones.find((m) => m.state === 'future');

  return (
    <div className="space-y-1">
      {milestones.map((milestone, index) => {
        const isCompleted = milestone.state === 'completed';
        const isCurrent = milestone.state === 'current';

        return (
          <motion.div
            key={milestone.days}
            initial={isCurrent ? { opacity: 0, x: -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
              isCompleted && 'bg-primary/[0.06]',
              isCurrent && 'bg-primary/[0.04]',
              !isCompleted && !isCurrent && 'hover:bg-muted/20'
            )}
          >
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
                isCompleted && 'bg-primary text-primary-foreground',
                isCurrent && 'border border-primary bg-background text-primary',
                !isCompleted && !isCurrent && 'border border-muted bg-muted/20 text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Bookmark className="h-3 w-3" />
              )}
            </div>

            <div className="flex flex-1 items-baseline gap-2">
              <span
                className={cn(
                  'text-sm font-semibold',
                  isCompleted && 'text-primary',
                  isCurrent && 'text-foreground',
                  !isCompleted && !isCurrent && 'text-muted-foreground'
                )}
              >
                {milestone.days} days
              </span>
              <span
                className={cn(
                  'text-xs',
                  isCompleted && 'text-primary/70',
                  isCurrent && 'text-muted-foreground',
                  !isCompleted && !isCurrent && 'text-muted-foreground/60'
                )}
              >
                {milestone.label}
              </span>
            </div>

            {isCurrent && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                {milestone.days - currentStreak} to go
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
