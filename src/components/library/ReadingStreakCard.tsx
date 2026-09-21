import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useReadingStreak } from '@/hooks/useReadingStreak';
import WeeklyRhythm from '@/components/streak/WeeklyRhythm';
import { ReadingRecords } from '@/components/streak/ReadingRecords';
import StreakMilestones from '@/components/streak/StreakMilestones';
import ReadingBadges from '@/components/streak/ReadingBadges';
import ReadingActivity from '@/components/streak/ReadingActivity';
import StreakEmptyState from '@/components/streak/StreakEmptyState';
import { StreakCardLoading } from '@/components/streak/StreakLoading';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ReadingStreakCardProps {
  userId?: string;
  compact?: boolean;
}

export default function ReadingStreakCard({ userId, compact = false }: ReadingStreakCardProps) {
  const { streak, badges, todayReading, loading } = useReadingStreak(userId);
  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;

  if (loading) {
    return <StreakCardLoading compact={compact} />;
  }

  if (currentStreak === 0) {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-border/60 bg-card">
        <StreakEmptyState isLoggedIn={!!userId} />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <BookOpen className="h-4 w-4 self-center text-primary/60" />
            <motion.span
              key={currentStreak}
              initial={{ opacity: 0.7, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-2xl font-extrabold tabular-nums tracking-tight"
            >
              {currentStreak}
            </motion.span>
            <span className="text-xs font-semibold text-muted-foreground">
              {currentStreak === 1 ? 'day' : 'days'} streak
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Best <span className="font-bold tabular-nums">{longestStreak}</span>
          </span>
        </div>

        <WeeklyRhythm userId={userId} />

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 5).map((badge) => (
              <span
                key={badge.id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                title={`${badge.badge_name} · ${format(new Date(badge.earned_at), 'MMM d, yyyy')}`}
              >
                {badge.badge_name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Reading streak</p>
        <div className="mt-2 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Your reading rhythm</h2>
            {todayReading?.hasRead ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Read today &middot; {todayReading.minutes} min &middot; {todayReading.chapters} chapters
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Read today to continue your streak</p>
            )}
          </div>

          <div className="flex flex-col items-start md:items-end">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary/60" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">consecutive</span>
            </div>
            <motion.div
              key={currentStreak}
              initial={{ opacity: 0.6, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="mt-1 text-7xl font-semibold tracking-[-0.04em] tabular-nums leading-none md:text-8xl"
            >
              {currentStreak}
            </motion.div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Days</span>
              {currentStreak > 0 && longestStreak > currentStreak && (
                <span className="text-xs text-muted-foreground">
                  &middot; best <span className="font-semibold text-foreground">{longestStreak}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Weekly rhythm */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">This week</p>
        <WeeklyRhythm userId={userId} />
      </motion.div>

      {/* Reading status */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Today</p>
        {todayReading?.hasRead ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-sm font-medium text-foreground">Read today</span>
            <span className="text-sm text-muted-foreground">
              {todayReading.minutes} min &middot; {todayReading.chapters} chapters
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full border border-primary" />
            <span className="text-sm font-medium text-muted-foreground">Not read today</span>
          </div>
        )}
      </motion.div>

      {/* Reading records */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Records</p>
        <ReadingRecords userId={userId} />
      </motion.div>

      {/* Milestones */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Milestones</p>
        <StreakMilestones userId={userId} />
      </motion.div>

      {/* Badges */}
      {badges.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
        >
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Earned</p>
          <ReadingBadges userId={userId} />
        </motion.div>
      )}

      {/* Reading activity */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Activity</p>
        <ReadingActivity userId={userId} />
      </motion.div>
    </div>
  );
}
