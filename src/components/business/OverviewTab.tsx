import { Link } from 'react-router-dom';
import { useBusinessOverview } from '@/hooks/useBusinessData';
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
  const { data: overview, isLoading, isError } = useBusinessOverview(businessId);

  if (isLoading) return <LoadingGrid items={4} />;
  if (isError || !overview)
    return (
      <EmptyState
        title="Could not load your overview"
        description="Something went wrong while fetching your business data."
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Followers" value={overview.followers_count} icon={<Users className="h-4 w-4" />} hint={`+${overview.followers_gained_7d} in 7 days`} />
        <MetricCard label="Active promotions" value={overview.active_promotions} icon={<Megaphone className="h-4 w-4" />} />
        <MetricCard label="Total campaigns" value={overview.total_campaigns} icon={<ListVideo className="h-4 w-4" />} />
        <MetricCard label="Total spend" value={formatMoney(overview.total_spend_cents)} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Reach" value={overview.reach} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Impressions" value={overview.impressions} icon={<Eye className="h-4 w-4" />} />
        <MetricCard label="Engagement" value={overview.engagement} icon={<Heart className="h-4 w-4" />} />
        <MetricCard label="Clicks" value={overview.clicks} icon={<MousePointerClick className="h-4 w-4" />} />
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