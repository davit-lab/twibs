import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Megaphone, Pause, Play } from 'lucide-react';
import AdminSection from './AdminSection';
import CampaignStatusBadge from '@/components/ads/CampaignStatusBadge';
import { formatMoney, STATUS_META, type Campaign, type CampaignStatus } from '@/lib/ads';

type Filter = 'pending_review' | 'pending_payment' | 'active' | 'all';

const FILTERS: Filter[] = ['pending_review', 'pending_payment', 'active', 'all'];

export default function AdminAdsTab() {
  const { user: currentUser } = useAuth();
  const { writeAudit } = useAdminActions();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('campaigns')
        .select('*, advertiser_accounts (*), profiles!inner (user_id, display_name, username, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter === 'pending_review') query = query.eq('status', 'pending_review');
      if (filter === 'pending_payment') query = query.eq('status', 'pending_payment');
      if (filter === 'active') query = query.in('status', ['active', 'paused', 'scheduled']);

      const { data, error } = await query;
      if (error) throw error;
      setCampaigns((data || []).map((c: any) => ({
        ...c,
        advertiser_accounts: Array.isArray(c.advertiser_accounts)
          ? c.advertiser_accounts[0]
          : c.advertiser_accounts,
        profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles,
      })));
    } catch (err: any) {
      console.error('Error loading campaigns:', err);
      toast({ variant: 'destructive', title: 'Error', description: err?.message || 'Failed to load campaigns.' });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (campaign: Campaign, action: string, success: string) => {
    setBusyId(campaign.id);
    try {
      const { data, error } = await (supabase as any).rpc('admin_moderate_campaign', {
        p_campaign_id: campaign.id,
        p_action: action,
        p_reason: reason[campaign.id] || null,
      });
      if (error) throw error;
      await writeAudit(`ads_${action}`, 'campaign', campaign.id, {
        campaign: campaign.name,
        note: reason[campaign.id] || null,
      });
      toast({ title: success, description: `"${campaign.name}" ${success.toLowerCase()}.` });
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: err?.message || 'Something went wrong.' });
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = campaigns.filter((c) => c.status === 'pending_review' || c.status === 'pending_payment').length;

  return (
    <AdminSection
      icon={Megaphone}
      title="Ad Campaigns"
      eyebrow="Advertising"
      description="Review, approve and manage paid campaigns"
      actions={
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="hidden sm:inline-flex">{pendingCount} pending</Badge>
          )}
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f} value={f}>{STATUS_META[f as CampaignStatus]?.label || f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-14 text-center"><Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" /></div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-14">
          <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-success" />
          </div>
          <p className="font-bold text-lg mb-1">Nothing here</p>
          <p className="text-sm text-muted-foreground">No campaigns match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const owner = (campaign as any).profiles as { display_name?: string; username?: string } | undefined;
            const isPending = campaign.status === 'pending_review';
            return (
              <div key={campaign.id} className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{campaign.name}</p>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {campaign.advertiser_accounts?.name || 'Unknown advertiser'}
                      {owner?.username ? ` · @${owner.username}` : ''}
                      {' · '}{formatMoney(campaign.total_budget_cents, campaign.currency)}
                      {' · '}{new Date(campaign.created_at).toLocaleString()}
                    </p>
                  </div>
                  {busyId === campaign.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {campaign.headline && (
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="font-semibold text-sm">{campaign.headline}</p>
                    {campaign.description && (
                      <p className="text-muted-foreground text-sm mt-0.5 line-clamp-2">{campaign.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Objective: {campaign.objective} · CTA: {campaign.cta || '—'}
                      {campaign.cta_url ? ` · ${campaign.cta_url}` : ''}
                    </p>
                  </div>
                )}

                {isPending && (
                  <input
                    value={reason[campaign.id] || ''}
                    onChange={(e) => setReason((r) => ({ ...r, [campaign.id]: e.target.value }))}
                    placeholder="Moderation note / rejection reason…"
                    className="w-full h-8 rounded-lg border border-border/60 bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {isPending && (
                    <>
                      <Button size="sm" disabled={busyId === campaign.id}
                        onClick={() => moderate(campaign, 'approve', 'Campaign approved')}>
                        <CheckCircle2 className="w-4 h-4 mr-1.5 text-success" />
                        Approve & launch
                      </Button>
                      <Button variant="destructive" size="sm" disabled={busyId === campaign.id}
                        onClick={() => moderate(campaign, 'reject', 'Campaign rejected')}>
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Reject
                      </Button>
                    </>
                  )}
                  {campaign.status === 'active' && (
                    <Button variant="outline" size="sm" disabled={busyId === campaign.id}
                      onClick={() => moderate(campaign, 'pause', 'Campaign paused')}>
                      <Pause className="w-4 h-4 mr-1.5" />
                      Pause
                    </Button>
                  )}
                  {campaign.status === 'paused' && (
                    <Button variant="outline" size="sm" disabled={busyId === campaign.id}
                      onClick={() => moderate(campaign, 'resume', 'Campaign resumed')}>
                      <Play className="w-4 h-4 mr-1.5" />
                      Resume
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminSection>
  );
}
