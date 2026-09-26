import { BookOpen, CheckCircle2, Clock } from 'lucide-react';
import type { LibraryBookWithProgress } from '@/hooks/useBooks';

interface ReadingOverviewProps {
  books: LibraryBookWithProgress[];
}

export default function ReadingOverview({ books }: ReadingOverviewProps) {
  const totalChapters = books.reduce((sum, b) => sum + (b.total_chapters || 0), 0);
  const completedChapters = books.reduce((sum, b) => sum + (b.completed_count || 0), 0);
  const inProgress = books.filter(
    (b) => b.progress && b.completed_count < b.total_chapters
  ).length;
  const completedBooks = books.filter(
    (b) => b.total_chapters > 0 && b.completed_count === b.total_chapters
  ).length;
  const notStarted = Math.max(books.length - inProgress - completedBooks, 0);

  const pct = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const stats = [
    { label: 'Reading now', value: inProgress, icon: BookOpen },
    { label: 'Completed', value: completedBooks, icon: CheckCircle2 },
    { label: 'To start', value: notStarted, icon: Clock },
  ];

  return (
    <div className="grid items-center gap-6 rounded-2xl border border-border/60 bg-card p-5 md:grid-cols-[auto_1fr] md:gap-8 md:p-6">
      {/* Progress ring */}
      <div className="mx-auto flex flex-col items-center gap-3 md:mx-0">
        <div className="relative h-32 w-32">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="7" className="stroke-border" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              className="stroke-primary"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tracking-tight">{clamped}%</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              read
            </span>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completedChapters} of {totalChapters} chapters
        </span>
      </div>

      {/* Details */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Your reading journey
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight md:text-2xl">
          {clamped === 100
            ? 'You finished the whole library!'
            : `${books.length} ${books.length === 1 ? 'book' : 'books'} on your shelf`}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {clamped === 100
            ? 'Impressive — every one of them completed. Find your next read.'
            : 'Keep the momentum going — every chapter counts toward your streak.'}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/50 bg-muted/30 p-3 text-center">
              <p className="text-xl font-bold leading-none tracking-tight">{stat.value}</p>
              <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <stat.icon className="h-3 w-3 text-primary" />
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Aggregate bar */}
        <div className="mt-4 max-w-md">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">Overall progress</span>
            <span className="font-bold text-primary">{clamped}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${clamped}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}