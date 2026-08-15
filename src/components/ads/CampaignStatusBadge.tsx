import { STATUS_META, type CampaignStatus } from '@/lib/ads';
import { cn } from '@/lib/utils';

export default function CampaignStatusBadge({
  status,
  className,
}: {
  status: CampaignStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        meta.badgeClass,
        className
      )}
      title={meta.description}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  );
}
