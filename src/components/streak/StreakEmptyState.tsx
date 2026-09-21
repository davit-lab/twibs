import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

interface StreakEmptyStateProps {
  isLoggedIn: boolean;
}

export default function StreakEmptyState({ isLoggedIn }: StreakEmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-border/60 bg-muted/20">
        <BookOpen className="h-7 w-7 text-primary/60" />
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Reading streak</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">
        Your reading rhythm starts here
      </h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Read your first chapter to begin tracking your progress.
      </p>

      {isLoggedIn ? (
        <Link
          to="/library/explore"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start reading
        </Link>
      ) : (
        <Link
          to="/auth"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
        >
          Sign in to start tracking
        </Link>
      )}
    </div>
  );
}
