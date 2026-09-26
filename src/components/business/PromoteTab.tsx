import { Link } from 'react-router-dom';
import { useBusinessOverview, useBusinessCampaigns } from '@/hooks/useBusinessData';
import { BoostEditor } from '@/components/business/BoostEditor';
import { CampaignRow, EmptyState } from '@/components/business/bits';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/ads';
import { Megaphone, ArrowRight, Loader2, ChevronRight } from 'lucide-react';

export function PromoteTab({ businessId }: { businessId: string }) {
  const { data: overview } = useBusinessOverview(businessId);
  const { data: campaigns, isLoading } = useBusinessCampaigns(businessId);
  const active = (campaigns || []).filter((c) =>
    ['pending_review', 'scheduled', 'active', 'paused'].includes(c.status)
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Smart Boost</h2>
            <p className="text-sm text-muted-foreground">Pick a post, a budget and a goal. We handle the rest.</p>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {active.length} active
          </span>
        </div>
        <BoostEditor businessId={businessId} />
      </div>

      <div className="space-y-4 xl:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Current promotions</h2>
          <Link to="/b?tab=campaigns" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
          </div>
        ) : active.length > 0 ? (
          <div className="space-y-2.5">
            {active.slice(0, 5).map((c) => (
              <CampaignRow key={c.id} campaign={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active promotions"
            description="Boost a post on the left to start reaching new people."
          />
        )}

        {overview && overview.total_spend_cents > 0 && (
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">All-time spend</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(overview.total_spend_cents)}</p>
          </div>
        )}

        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Megaphone className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Boost from your posts</p>
              <p className="text-xs text-muted-foreground">Promote any post instantly.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <Button variant="outline" asChild className="w-full gap-1.5">
          <Link to="/b?tab=campaigns">
            Manage all campaigns
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}