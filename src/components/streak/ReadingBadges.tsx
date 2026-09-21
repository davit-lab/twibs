import { motion } from 'framer-motion';
import { Sprout, Flame, Star, Trophy, Gem, Crown } from 'lucide-react';
import { useReadingStreak, BADGE_DISPLAY_NAMES } from '@/hooks/useReadingStreak';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ShimmerPills } from './StreakLoading';

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'streak_3': Sprout,
  'streak_7': Flame,
  'streak_14': Star,
  'streak_30': Trophy,
  'streak_60': Gem,
  'streak_100': Crown,
};

interface ReadingBadgesProps {
  userId?: string;
}

export default function ReadingBadges({ userId }: ReadingBadgesProps) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  const { badges, loading } = useReadingStreak(targetUserId);

  if (loading) {
    return <ShimmerPills count={3} />;
  }

  if (badges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Badges appear here as your streak grows.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge, index) => {
        const Icon = BADGE_ICONS[badge.badge_type];
        return (
          <motion.span
            key={badge.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.06 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.04] px-2.5 py-1 text-xs"
            title={`${BADGE_DISPLAY_NAMES[badge.badge_type] || badge.badge_name} — earned ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
          >
            {Icon && <Icon className="h-3 w-3 text-primary/70" />}
            <span className="font-medium text-foreground">
              {BADGE_DISPLAY_NAMES[badge.badge_type] || badge.badge_name}
            </span>
          </motion.span>
        );
      })}
    </div>
  );
}
