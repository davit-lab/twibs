import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ShimmerBarProps {
  className?: string;
  delay?: number;
}

export function ShimmerBar({ className, delay = 0 }: ShimmerBarProps) {
  return (
    <motion.div
      className={cn('rounded', className)}
      initial={{ opacity: 0.3 }}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      style={{ background: 'hsl(var(--muted))' }}
    />
  );
}

interface ShimmerGridProps {
  columns?: number;
  rows?: number;
  cellClass?: string;
  delay?: number;
  gap?: string;
}

export function ShimmerGrid({ columns = 7, rows = 1, cellClass = 'h-10', delay = 0, gap = '4px' }: ShimmerGridProps) {
  const total = columns * rows;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className={cn('rounded-sm', cellClass)}
          style={{ background: 'hsl(var(--muted))' }}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.55, 0.3] }}
          transition={{
            duration: 2,
            delay: delay + i * 0.03,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

interface ShimmerPillProps {
  count?: number;
  height?: string;
  delay?: number;
}

export function ShimmerPills({ count = 3, height = 'h-7', delay = 0 }: ShimmerPillProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerBar key={i} className={`${height} w-20 rounded-full`} delay={delay + i * 0.08} />
      ))}
    </div>
  );
}

export function StreakCardLoading({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="space-y-3">
        <ShimmerBar className="h-4 w-full" delay={0} />
        <ShimmerGrid columns={7} cellClass="h-8" delay={0.1} />
        <ShimmerBar className="h-3 w-24" delay={0.4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <ShimmerBar className="h-3 w-32" delay={0} />
          <ShimmerBar className="h-8 w-56" delay={0.1} />
          <ShimmerBar className="h-3 w-72" delay={0.15} />
        </div>
        <div className="space-y-2 text-right">
          <ShimmerBar className="h-3 w-20" delay={0.2} />
          <ShimmerBar className="h-16 w-24" delay={0.25} />
        </div>
      </div>

      <ShimmerBar className="h-3 w-24" delay={0.3} />
      <ShimmerGrid columns={7} cellClass="h-8" delay={0.35} />

      <ShimmerBar className="h-3 w-20" delay={0.5} />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <ShimmerBar key={i} className="h-12 w-full" delay={0.55 + i * 0.05} />
        ))}
      </div>

      <ShimmerBar className="h-3 w-20" delay={0.75} />
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <ShimmerBar key={i} className="h-10 w-full" delay={0.8 + i * 0.05} />
        ))}
      </div>
    </div>
  );
}
