import { BookOpen, CheckCircle2, Clock, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LibraryBookWithProgress } from '@/hooks/useBooks';

interface ReadingOverviewProps {
  books: LibraryBookWithProgress[];
}

const SPINE_COLORS = [
  'from-violet-500 to-purple-700',
  'from-sky-500 to-blue-700',
  'from-rose-500 to-red-700',
  'from-amber-500 to-orange-700',
  'from-emerald-500 to-teal-700',
  'from-pink-500 to-fuchsia-700',
  'from-indigo-500 to-blue-800',
];

function spineColor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % 997;
  }
  return SPINE_COLORS[hash % SPINE_COLORS.length];
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
    { label: 'Reading now', value: inProgress, icon: BookOpen, tint: 'text-primary bg-primary/10' },
    { label: 'Completed', value: completedBooks, icon: CheckCircle2, tint: 'text-emerald-400 bg-emerald-400/10' },
    { label: 'To start', value: notStarted, icon: Clock, tint: 'text-muted-foreground bg-surface-2' },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8">
      <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -left-20 -bottom-24 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr] md:gap-12">
        {/* Progress ring */}
        <div className="mx-auto flex flex-col items-center gap-3 md:mx-0">
          <div className="relative h-36 w-36">
            <svg className="h-36 w-36 -rotate-90" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="overview-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))' }} />
                  <stop offset="100%" style={{ stopColor: 'hsl(320 84% 65%)' }} />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="7" className="stroke-white/10" />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke="url(#overview-ring-grad)"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="drop-shadow-[0_0_12px_hsl(var(--primary)/0.45)] transition-all duration-700"
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
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Target className="h-3.5 w-3.5" />
            Your reading journey
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {clamped === 100
              ? 'You finished the whole library!'
              : `${books.length} ${books.length === 1 ? 'book' : 'books'} on your shelf`}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Keep the momentum going — every chapter brings you closer to a bigger streak and your
            next milestone badge.
          </p>

          {/* Aggregate bar */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Overall progress</span>
              <span className="font-bold text-primary">{clamped}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-pink-500 transition-all duration-700"
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border/50 bg-background/40 p-3 text-center backdrop-blur-sm">
                <span className={cn('mx-auto flex h-7 w-7 items-center justify-center rounded-lg', stat.tint)}>
                  <stat.icon className="h-3.5 w-3.5" />
                </span>
                <p className="mt-2 text-xl font-bold leading-none tracking-tight">{stat.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shelf strip */}
      {books.length > 0 && (
        <div className="relative mt-8 flex items-end gap-1.5 overflow-hidden rounded-xl border border-border/40 bg-muted/50 px-4 pb-2 pt-3">
          {books.slice(0, 16).map((book) => (
            <div
              key={book.id}
              title={book.title}
              className={cn(
                'h-9 w-2.5 shrink-0 rounded-t-sm bg-gradient-to-b transition-all duration-300 hover:h-12',
                spineColor(book.title)
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
