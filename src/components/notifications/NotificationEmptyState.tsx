import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';

export default function NotificationEmptyState({
  title = "You're all caught up.",
  hint = 'When people interact with you, it shows up here — likes, comments, follows and messages.',
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="relative">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-surface-2 ring-1 ring-border">
          <BrandLogo className="h-9 w-9 object-contain" />
        </div>
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[hsl(var(--primary))]"
        />
      </div>
      <h3 className="mt-6 text-lg font-bold tracking-tight">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
        {hint}
      </p>
      <Link
        to="/explore"
        className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors hover:text-primary/80"
      >
        Explore Twibsers
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}