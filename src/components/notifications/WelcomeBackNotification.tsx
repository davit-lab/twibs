import { ArrowDown } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';

export interface WelcomeCounts {
  unread: number;
  messages: number;
  likes: number;
  follows: number;
  comments: number;
  mentions: number;
}

function buildSentence(counts: WelcomeCounts): string {
  const parts: string[] = [];
  if (counts.unread > 0) {
    parts.push(`${counts.unread} unread notification${counts.unread === 1 ? '' : 's'}`);
  }
  if (counts.messages > 0) {
    parts.push(`${counts.messages} new message${counts.messages === 1 ? '' : 's'}`);
  }
  if (counts.likes > 0) {
    parts.push(`${counts.likes} new like${counts.likes === 1 ? '' : 's'}`);
  }
  if (counts.follows > 0) {
    parts.push(`${counts.follows} new follow${counts.follows === 1 ? '' : 's'}`);
  }
  if (counts.comments > 0) {
    parts.push(`${counts.comments} new comment${counts.comments === 1 ? '' : 's'}`);
  }
  if (counts.mentions > 0) {
    parts.push(`${counts.mentions} new mention${counts.mentions === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export default function WelcomeBackNotification({
  displayName,
  counts,
  onSeeWhatsNew,
}: {
  displayName?: string;
  counts: WelcomeCounts;
  onSeeWhatsNew?: () => void;
}) {
  const sentence = buildSentence(counts);
  const firstName = displayName?.split(' ')[0];

  return (
    <aside className="mt-5 rounded-2xl border border-border/70 bg-surface/50 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-surface-2 ring-1 ring-border">
          <BrandLogo className="h-6 w-6 object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-snug tracking-tight">
            {firstName ? `Welcome back, ${firstName}.` : 'Welcome back to Twibsers.'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here's what's happened while you were away.
          </p>
          {sentence && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{sentence}.</p>
          )}
          {onSeeWhatsNew && (
            <button
              onClick={onSeeWhatsNew}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary transition-colors hover:text-primary/80"
            >
              See what's new
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}