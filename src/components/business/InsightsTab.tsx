import { useBusinessInsights } from '@/hooks/useBusinessData';
import { MetricCard, LoadingGrid, EmptyState, CampaignStatusBadge } from '@/components/business/bits';
import { Card, CardContent } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { formatNumber, formatMoney } from '@/lib/ads';
import { Users, Eye, MousePointerClick, Heart, Wallet, ArrowRight } from 'lucide-react';

export function InsightsTab({ businessId }: { businessId: string }) {
  const { data: insights, isLoading, isError } = useBusinessInsights(businessId);

  if (isLoading) return <LoadingGrid items={4} />;
  if (isError || !insights)
    return (
      <EmptyState
        title="No insights yet"
        description="Insights build up from real campaign delivery — no placeholder numbers."
      />
    );

  const { totals } = insights;
  const impressions = totals.impressions;
  const ctr = impressions ? ((totals.clicks / impressions) * 100).toFixed(1) : '—';
  const er = impressions ? ((totals.engagements / impressions) * 100).toFixed(1) : '—';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Reach" value={totals.reach} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Impressions" value={totals.impressions} icon={<Eye className="h-4 w-4" />} />
        <MetricCard label="Clicks" value={totals.clicks} icon={<MousePointerClick className="h-4 w-4" />} hint={`${ctr}% CTR`} />
        <MetricCard label="Engagement" value={totals.engagements} icon={<Heart className="h-4 w-4" />} hint={`${er}% rate`} />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold">Impressions over time</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              {formatMoney(totals.spend_cents)} spent
            </p>
          </div>
          {insights.daily.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Daily delivery will appear here once campaigns go live.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={insights.daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatNumber(value), name === 'impressions' ? 'Impressions' : 'Engagements']}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', fontSize: 12 }}
                />
                <Bar dataKey="impressions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                <Bar dataKey="engagements" fill="var(--accent, #7c3aed)" radius={[4, 4, 0, 0]} fillOpacity={0.35} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Top content</p>
        </div>
        {insights.top_content.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {insights.top_content.slice(0, 6).map((item) => (
              <Link
                key={item.campaign_id}
                to={`/ads/campaigns/${item.campaign_id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{item.campaign_name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{item.content || 'No post text'}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-4 text-xs text-muted-foreground">
                  <span>{formatNumber(item.impressions)} impr.</span>
                  <span>{formatNumber(item.engagements)} engage.</span>
                  <span className="font-semibold text-foreground">{formatMoney(item.spend_cents)}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}