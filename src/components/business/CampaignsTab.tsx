import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessCampaigns } from '@/hooks/useBusinessData';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { CampaignRow, EmptyState } from '@/components/business/bits';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { campaignActions } from '@/lib/ads';
import { Megaphone, Pause, Play, Square, Loader2 } from 'lucide-react';

export function CampaignsTab({ businessId }: { businessId: string }) {
  const { data: campaigns, isLoading, isError, refetch } = useBusinessCampaigns(businessId);
  const api = useBusinessApi();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, action: 'pause' | 'resume' | 'end') => {
    setBusy(id);
    try {
      if (action === 'pause') await api.pauseCampaign(id);
      if (action === 'resume') await api.resumeCampaign(id);
      if (action === 'end') await api.endCampaign(id);
      await refetch();
      toast({ title: `Campaign ${action === 'end' ? 'ended' : action === 'pause' ? 'paused' : 'resumed'}` });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (isLoading)
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
      </div>
    );
  if (isError)
    return <EmptyState title="Could not load campaigns" description="Something went wrong while fetching your promotions." />;

  const list = campaigns || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {list.length} campaign{list.length === 1 ? '' : 's'} · staff review before delivery
        </p>
        <Button className="gap-1.5" onClick={() => navigate('/b?tab=promote')}>
          <Megaphone className="h-4 w-4" />
          Boost a post
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Boost a post to run your first promotion."
          action={
            <Button onClick={() => navigate('/b?tab=promote')} className="gap-1.5">
              <Megaphone className="h-4 w-4" />
              Start boosting
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const actions = campaignActions(c.status);
            return (
              <div key={c.id} className="rounded-2xl border border-border p-1.5">
                <CampaignRow campaign={c} />
                <div className="flex items-center gap-1 border-t border-border/60 px-2 py-1.5">
                  {(actions.canPause || actions.canResume || actions.canEnd) && (
                    <>
                      {actions.canPause && (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => run(c.id, 'pause')} disabled={busy === c.id}>
                          {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                          Pause
                        </Button>
                      )}
                      {actions.canResume && (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => run(c.id, 'resume')} disabled={busy === c.id}>
                          {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          Resume
                        </Button>
                      )}
                      {actions.canEnd && (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => run(c.id, 'end')} disabled={busy === c.id}>
                          {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                          End
                        </Button>
                      )}
                    </>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Created by {c.created_by || 'you'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}