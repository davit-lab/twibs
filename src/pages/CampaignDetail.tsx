import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import CampaignStatusBadge from '@/components/ads/CampaignStatusBadge';
import { useCampaign, useCampaignAnalytics, useCampaignActions } from '@/hooks/useAds';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Play,
  Pause,
  X,
  Flag,
  Eye,
  Users,
  MousePointerClick,
  Heart,
  MessageSquare,
  Share2,
  Bookmark,
  UserPlus,
  ExternalLink,
  TrendingUp,
  DollarSign,
  CreditCard,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
  campaignActions,
  type Campaign,
} from '@/lib/ads';

const CHART_CONFIG: ChartConfig = {
  impressions: { label: 'Impressions', color: 'var(--primary)' },
  clicks: { label: 'Clicks', color: 'hsl(var(--chart-2))' },
  spend: { label: 'Spend', color: 'hsl(var(--chart-3))' },
};

interface PaymentRecord {
  id: string;
  provider: 'stripe' | 'manual';
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-bold leading-tight">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { campaign, loading, refresh } = useCampaign(campaignId);
  const { analytics, loading: analyticsLoading } = useCampaignAnalytics(campaignId);
  const { pauseCampaign, resumeCampaign, endCampaign, cancelCampaign } = useCampaignActions();
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const loadPayments = useCallback(async () => {
    if (!campaignId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('id, provider, amount_cents, currency, status, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPayments((data || []) as PaymentRecord[]);
    } catch {
      setPayments([]);
    }
  }, [campaignId]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    if (!campaign) return;
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </MainLayout>
    );
  }

  if (!campaign) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Button variant="ghost" size="sm" className="gap-1.5 mb-4" onClick={() => navigate('/ads')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <p className="text-muted-foreground text-sm">Campaign not found.</p>
        </div>
      </MainLayout>
    );
  }

  const c = campaign as Campaign;
  const actions = campaignActions(c.status);
  const t = analytics?.totals;
  const ctr = formatPercent(t?.clicks ?? 0, t?.impressions ?? 0);
  const cpm = formatRate(t?.spend_cents ?? 0, (t?.impressions ?? 0) / 1000);

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <Button variant="ghost" size="sm" className="gap-1.5 mb-3" onClick={() => navigate('/ads')}>
            <ArrowLeft className="h-4 w-4" />
            Back to campaigns
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight truncate">{c.name}</h1>
                <CampaignStatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.advertiser_accounts?.name || 'Advertiser'} · {c.status === 'active' ? 'Running' : 'Stopped'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {actions.canPause && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => runAction(() => pauseCampaign(c.id), 'Campaign paused')}
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              )}
              {actions.canResume && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => runAction(() => resumeCampaign(c.id), 'Campaign resumed')}
                >
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              )}
              {actions.canEnd && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => runAction(() => endCampaign(c.id), 'Campaign ended')}
                >
                  <Flag className="h-4 w-4" />
                  End
                </Button>
              )}
              {actions.canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive"
                  disabled={busy}
                  onClick={() => runAction(() => cancelCampaign(c.id), 'Campaign cancelled')}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>

        {c.status === 'rejected' && c.rejection_reason && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 text-sm">
              <span className="font-semibold text-destructive">Rejected: </span>
              {c.rejection_reason}
            </CardContent>
          </Card>
        )}
        {c.status === 'pending_review' && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Awaiting review</p>
              <p>
                Your campaign is in review. It will start delivering as soon as it is
                approved.
              </p>
            </CardContent>
          </Card>
        )}

        {payments.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Payments
              </div>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {p.status === 'succeeded' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      )}
                      <span className="font-semibold">
                        {formatMoney(p.amount_cents, p.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        via {p.provider}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric
            icon={DollarSign}
            label="Budget"
            value={formatMoney(c.total_budget_cents, c.currency)}
          />
          <Metric icon={Eye} label="Impressions" value={formatNumber(t?.impressions)} />
          <Metric icon={Users} label="Reach" value={formatNumber(t?.reach)} />
          <Metric
            icon={MousePointerClick}
            label="Clicks"
            value={`${formatNumber(t?.clicks)} · ${ctr}`}
          />
        </div>

        {c.status === 'active' || c.status === 'paused' || c.status === 'completed' ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Performance
            </h2>
            {analyticsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric icon={Heart} label="Likes" value={formatNumber(t?.likes)} />
                <Metric icon={MessageSquare} label="Comments" value={formatNumber(t?.comments)} />
                <Metric icon={Share2} label="Shares" value={formatNumber(t?.shares)} />
                <Metric icon={Bookmark} label="Saves" value={formatNumber(t?.saves)} />
                <Metric icon={UserPlus} label="Follows" value={formatNumber(t?.follows)} />
                <Metric
                  icon={TrendingUp}
                  label="Profile visits"
                  value={formatNumber(t?.profile_visits)}
                />
                <Metric
                  icon={ExternalLink}
                  label="Website clicks"
                  value={formatNumber(t?.website_clicks)}
                />
                <Metric
                  icon={DollarSign}
                  label="Spend"
                  value={formatMoney(t?.spend_cents, c.currency)}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Cost per 1,000 impressions (CPM)</div>
                  <div className="text-lg font-bold">{cpm}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Engagements</div>
                  <div className="text-lg font-bold">{formatNumber(t?.engagements)}</div>
                </CardContent>
              </Card>
            </div>

            {!analyticsLoading && analytics?.daily && analytics.daily.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3">Daily performance</h3>
                  <ChartContainer config={CHART_CONFIG} className="h-52 w-full">
                    <BarChart data={analytics.daily} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={36}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip
                        cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                        content={<ChartTooltipContent />}
                      />
                      <Bar dataKey="impressions" fill={CHART_CONFIG.impressions.color} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="clicks" fill={CHART_CONFIG.clicks.color} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="spend" fill={CHART_CONFIG.spend.color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Performance metrics will appear once your campaign starts delivering.
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
