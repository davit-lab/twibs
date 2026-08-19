import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import CampaignStatusBadge from '@/components/ads/CampaignStatusBadge';
import { useCampaigns, useAdsOverview, useCampaignActions } from '@/hooks/useAds';
import { useAdvertiserAccounts } from '@/hooks/useAdvertiserAccounts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  X,
  Eye,
  MousePointerClick,
  DollarSign,
  TrendingUp,
  Users,
  Building2,
  Search,
  UserPlus,
  Rocket,
  BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatMoney,
  formatNumber,
  OBJECTIVE_META,
  type Campaign,
  type CampaignStatus,
} from '@/lib/ads';

type StatusFilter = 'all' | 'active' | 'in_review' | 'draft' | 'completed' | 'ended';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In review' },
  { value: 'draft', label: 'Drafts' },
  { value: 'completed', label: 'Completed' },
  { value: 'ended', label: 'Ended' },
];

const ACTIVE_STATUSES: CampaignStatus[] = ['active', 'paused', 'scheduled'];
const REVIEW_STATUSES: CampaignStatus[] = ['pending_payment', 'pending_review'];
const ENDED_STATUSES: CampaignStatus[] = ['cancelled', 'rejected'];

function matchesFilter(campaign: Campaign, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.includes(campaign.status);
  if (filter === 'in_review') return REVIEW_STATUSES.includes(campaign.status);
  if (filter === 'draft') return campaign.status === 'draft';
  if (filter === 'completed') return campaign.status === 'completed';
  if (filter === 'ended') return ENDED_STATUSES.includes(campaign.status);
  return true;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
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

interface OwnPost {
  id: string;
  content: string;
  created_at: string;
  star_count: number;
  profiles: { display_name: string; username: string; avatar_url: string | null };
  post_media: { id: string; url: string; type: string }[];
}

function BoostPostPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const loadPosts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('posts')
        .select(`
          id, content, created_at, star_count,
          profiles (display_name, username, avatar_url),
          post_media (id, url, type)
        `)
        .eq('user_id', user.id)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setPosts((data || []) as OwnPost[]);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load posts',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (open) loadPosts();
  }, [open, loadPosts]);

  const filtered = posts.filter((p) =>
    !query.trim() ||
    p.content.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Boost a post</DialogTitle>
          <DialogDescription>
            Pick one of your recent posts to promote. You'll choose an audience,
            budget and duration next.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your posts…"
            className="pl-9"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-semibold">No posts found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.trim()
                  ? 'Try a different search.'
                  : 'You don\'t have any posts to boost yet.'}
              </p>
            </div>
          ) : (
            filtered.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/ads/boost/${post.id}`)}
                className="flex w-full items-start gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={post.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {post.profiles.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{post.content || '(No text)'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString()} ·{' '}
                    {formatNumber(post.star_count)} stars
                    {post.post_media?.length ? ` · ${post.post_media.length} media` : ''}
                  </p>
                </div>
                <Rocket className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdsCampaigns() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { campaigns, loading, refresh } = useCampaigns();
  const { overview } = useAdsOverview();
  const { accounts, loading: accountsLoading } = useAdvertiserAccounts();
  const { pauseCampaign, resumeCampaign, cancelCampaign } = useCampaignActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [boostOpen, setBoostOpen] = useState(false);

  const visible = campaigns.filter(
    (c) =>
      matchesFilter(c, filter) &&
      (!query.trim() ||
        c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        (c.advertiser_accounts?.name ?? '').toLowerCase().includes(query.trim().toLowerCase()))
  );

  const runAction = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
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
      setBusyId(null);
    }
  };

  const needsProfessionalAccount = !accountsLoading && accounts.length === 0;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <Megaphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Advertise</h1>
              <p className="text-sm text-muted-foreground">
                Boost posts and run campaigns to grow your audience.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2" onClick={() => setBoostOpen(true)}>
              <Rocket className="h-4 w-4" />
              Boost a post
            </Button>
            <Button onClick={() => navigate('/ads/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              New campaign
            </Button>
          </div>
        </div>

        {needsProfessionalAccount && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Create a professional account first</p>
                  <p className="text-sm text-muted-foreground">
                    Ads are shown as a Business or Creator identity. You can create
                    several and switch between them.
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate('/settings?section=professional')} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Set up
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={DollarSign}
            label="Total spend"
            value={formatMoney(overview?.total_spend_cents, 'USD')}
          />
          <StatCard
            icon={TrendingUp}
            label="Active campaigns"
            value={formatNumber(overview?.active_campaigns)}
          />
          <StatCard icon={Eye} label="Impressions" value={formatNumber(overview?.impressions)} />
          <StatCard icon={Users} label="Reach" value={formatNumber(overview?.reach)} />
          <StatCard
            icon={MousePointerClick}
            label="Clicks"
            value={formatNumber(overview?.clicks)}
          />
          <StatCard
            icon={UserPlus}
            label="New followers"
            value={formatNumber(overview?.follows)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Your campaigns
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="h-8 w-44 pl-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto rounded-full border border-border/60 p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                      filter === f.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : visible.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <TrendingUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <h3 className="font-semibold">
                  {query.trim() || filter !== 'all'
                    ? 'No campaigns match'
                    : 'No campaigns yet'}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {query.trim() || filter !== 'all'
                    ? 'Try a different filter or search.'
                    : 'Create your first campaign to start reaching new people. You\'ll need a Business or Creator account.'}
                </p>
                {!query.trim() && filter === 'all' && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button onClick={() => navigate('/ads/new')}>Create a campaign</Button>
                    <Button variant="outline" onClick={() => setBoostOpen(true)}>
                      Boost a post
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            visible.map((campaign: Campaign) => (
              <Card key={campaign.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="min-w-0 text-left"
                      onClick={() => navigate(`/ads/campaigns/${campaign.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{campaign.name}</h3>
                        <CampaignStatusBadge status={campaign.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {OBJECTIVE_META[campaign.objective]?.label}
                        {campaign.advertiser_accounts?.name
                          ? ` · ${campaign.advertiser_accounts.name}`
                          : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {campaign.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Pause"
                          disabled={busyId === campaign.id}
                          onClick={() =>
                            runAction(campaign.id, () => pauseCampaign(campaign.id), 'Campaign paused')
                          }
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {campaign.status === 'paused' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Resume"
                          disabled={busyId === campaign.id}
                          onClick={() =>
                            runAction(campaign.id, () => resumeCampaign(campaign.id), 'Campaign resumed')
                          }
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {['draft', 'pending_payment', 'pending_review', 'scheduled'].includes(
                        campaign.status
                      ) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="Cancel"
                          disabled={busyId === campaign.id}
                          onClick={() =>
                            runAction(campaign.id, () => cancelCampaign(campaign.id), 'Campaign cancelled')
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:text-left sm:flex sm:gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground">Budget</div>
                      <div className="text-sm font-semibold">
                        {formatMoney(campaign.total_budget_cents, campaign.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Spend</div>
                      <div className="text-sm font-semibold">
                        {formatMoney(campaign.spend_cents, campaign.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Impressions</div>
                      <div className="text-sm font-semibold">
                        {formatNumber(campaign.impressions_delivered)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          <BadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
          <p>
            Every number here comes from real delivery — impressions, clicks and
            spend are recorded server-side.
          </p>
        </div>
      </div>

      <BoostPostPicker open={boostOpen} onOpenChange={setBoostOpen} />
    </MainLayout>
  );
}
