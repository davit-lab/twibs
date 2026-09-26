import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META, formatNumber } from '@/lib/ads';
import type { BusinessCampaign } from '@/lib/business';

export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{formatNumber(Number(value))}</p>
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function LoadingGrid({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i} className="rounded-2xl">
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CampaignStatusBadge({ status }: { status: BusinessCampaign['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        meta?.badgeClass || 'bg-muted text-muted-foreground'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta?.dotClass || 'bg-muted-foreground')} />
      {meta?.label || status}
    </span>
  );
}

export function CampaignRow({ campaign }: { campaign: BusinessCampaign }) {
  return (
    <Link
      to={`/ads/campaigns/${campaign.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border p-3.5 transition-colors hover:border-primary/30 hover:bg-muted/30"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{campaign.name}</p>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {campaign.post_content || 'No post attached'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatNumber(campaign.impressions_delivered)} impressions ·{' '}
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: campaign.currency || 'USD' }).format(
            campaign.spend_cents / 100
          )}{' '}
          spent
        </p>
      </div>
    </Link>
  );
}