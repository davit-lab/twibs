import { Link } from 'react-router-dom';
import { useBusinessOverview } from '@/hooks/useBusinessData';
import { useAnalyticsRange } from '@/hooks/useAnalyticsRange';
import { RangeSelector } from '@/components/business/RangeSelector';
import { MetricCard, LoadingGrid, EmptyState } from '@/components/business/bits';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/ads';
import {
  Users,
  TrendingUp,
  Megaphone,
  Wallet,
  Eye,
  MousePointerClick,
  Heart,
  ListVideo,
  ArrowRight,
  Star,
  MessageCircle,
} from 'lucide-react';

export function OverviewTab({ businessId }: { businessId: string }) {
  const [range, selectRange] = useAnalyticsRange();
  const { data: overview, isLoading, isError, isFetching } = useBusinessOverview(businessId, range);

  if (isLoading) return <LoadingGrid items={4} />;
  if (isError || !overview)
    return (
      <EmptyState
        title="Could not load your overview"
        description="Something went wrong while fetching your business data."
      />
    );

  // Rates are null when the window has no impressions; render them as "—" so a
  // genuine 0.0% is never confused with "nothing was measured yet".
  const rate = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RangeSelector value={range} onChange={(next) => selectRange(next.key, next)} />
        {isFetching && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Followers"
          value={overview.followers_count}
          icon={<Users className="h-4 w-4" />}
          hint={`+${overview.followers_gained_7d} in 7 days`}
        />
        <MetricCard label="Active promotions" value={overview.active_promotions} icon={<Megaphone className="h-4 w-4" />} />
        <MetricCard label="Total campaigns" value={overview.total_campaigns} icon={<ListVideo className="h-4 w-4" />} />
        <MetricCard
          label="Spend"
          value={formatMoney(overview.total_spend_cents)}
          icon={<Wallet className="h-4 w-4" />}
          hint={overview.is_lifetime ? 'All time' : 'In this period'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Reach" value={overview.reach} icon={<Users className="h-4 w-4" />} hint="Unique viewers" />
        <MetricCard label="Impressions" value={overview.impressions} icon={<Eye className="h-4 w-4" />} />
        <MetricCard
          label="Engagement"
          value={overview.engagement}
          icon={<Heart className="h-4 w-4" />}
          hint={range.key === 'today' ? undefined : `${rate(overview.engagement_rate)} of impressions`}
        />
        <MetricCard
          label="Clicks"
          value={overview.clicks}
          icon={<MousePointerClick className="h-4 w-4" />}
          hint={`${rate(overview.ctr)} CTR`}
        />
      </div>

      <div className="rounded-2xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Recent content
          </p>
          {overview.recent_content.length > 0 && (
            <span className="text-xs text-muted-foreground">{overview.recent_content.length} post(s)</span>
          )}
        </div>
        <div className="divide-y divide-border/60">
          {overview.recent_content.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Posts you publish as this business appear here.
            </p>
          )}
          {overview.recent_content.map((post) => (
            <Link
              key={post.id}
              to={`/post/${post.id}`}
              className="block px-4 py-3 transition-colors hover:bg-muted/30"
            >
              <p className="line-clamp-2 text-sm">{post.content}</p>
              <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> {post.star_count ?? 0}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count ?? 0}
                </span>
                <span>{new Date(post.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" asChild className="gap-1.5">
          <Link to="/b?tab=promote">
            Promote a post
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}