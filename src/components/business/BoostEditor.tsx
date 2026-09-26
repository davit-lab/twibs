import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Megaphone,
  Check,
  TrendingUp,
  Sparkles,
  Target,
  RefreshCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatMoney, OBJECTIVE_META, type CampaignObjective } from '@/lib/ads';
import { PRIORITY_META, type DiscoveryPriority } from '@/lib/business';

interface BoostEditorProps {
  businessId: string;
  preselectedPostId?: string;
  initialPost?: BoostPost | null;
}

interface BoostPost {
  id: string;
  content: string;
  created_at: string;
  star_count: number | null;
  comment_count: number | null;
}

const GOALS: CampaignObjective[] = ['reach', 'profile_visits', 'engagement', 'followers'];
const MIN_BUDGET_DOLLARS = 5;

function getInitials(name: string) {
  return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'B';
}

export function BoostEditor({ businessId, preselectedPostId, initialPost }: BoostEditorProps) {
  const { profile } = useAuth();
  const api = useBusinessApi();
  const { toast } = useToast();

  const { data: posts, isLoading: postsLoading } = useQuery<BoostPost[]>({
    queryKey: ['business', businessId, 'posts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('posts')
        .select('id, content, created_at, star_count, comment_count')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as BoostPost[]) || [];
    },
    enabled: !!businessId,
  });

  const [postId, setPostId] = useState<string>(
    preselectedPostId || initialPost?.id || ''
  );
  const [goal, setGoal] = useState<CampaignObjective>('reach');
  const [budgetDollars, setBudgetDollars] = useState('10');
  const [days, setDays] = useState('7');
  const [priority, setPriority] = useState<DiscoveryPriority>('normal');
  const [audienceExpansion, setAudienceExpansion] = useState(true);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ reachMin: number | null; reachMax: number | null; impressions: number | null } | null>(null);

  const budgetCents = Math.max(0, Math.round(parseFloat(budgetDollars) * 100 || 0));
  const daysNum = Math.max(1, Math.min(90, parseInt(days) || 7));
  const canSubmit = !submitting && !!postId && budgetCents >= MIN_BUDGET_DOLLARS * 100 && !done;

  const estimatedReachCents = useMemo(() => {
    if (!budgetCents) return null;
    const perDay = budgetCents / daysNum; // simple pacing-based estimate
    const impressions = Math.floor(perDay * 18 * daysNum);
    return {
      impressions,
      reachMin: Math.floor(impressions * 0.55),
      reachMax: Math.floor(impressions * 0.85),
    };
  }, [budgetCents, daysNum]);

  const selectablePosts = useMemo(() => {
    if (!posts) return initialPost ? [initialPost] : [];
    if (initialPost && !posts.some((p) => p.id === initialPost.id)) {
      return [initialPost, ...posts];
    }
    return posts;
  }, [posts, initialPost]);

  // ---------------------------------------------------------------------------

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const campaign = await api.createBoostCampaign({
        advertiser_id: businessId,
        post_id: postId,
        goal,
        budget_cents: budgetCents,
        days: daysNum,
        description: description.trim() || undefined,
        distribution_priority: priority,
        audience_expansion: audienceExpansion,
      });
      await api.submitBoostCampaign(campaign.id);
      setDone({
        reachMin: campaign.estimated_reach_min,
        reachMax: campaign.estimated_reach_max,
        impressions: campaign.estimated_impressions,
      });
      toast({
        title: 'Promotion submitted',
        description: 'Your boosted post is now in review.',
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not boost post',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card className="rounded-2xl border-primary/30">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-bold">Promotion submitted</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Your boosted post is being reviewed. It will start delivering once approved.
          </p>
          <div className="mt-5 grid w-full max-w-xs grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Est. reach</p>
              <p className="mt-1 font-bold tabular-nums">
                {(done.reachMin ?? 0).toLocaleString()}–{(done.reachMax ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Est. impressions</p>
              <p className="mt-1 font-bold tabular-nums">{(done.impressions ?? 0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Budget</p>
              <p className="mt-1 font-bold tabular-nums">{formatMoney(budgetCents)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Estimates only — actual delivery depends on approval and real audience signals.</p>
          <Button variant="outline" className="mt-5 gap-2" onClick={() => setDone(null)}>
            <RefreshCcw className="h-4 w-4" />
            Boost another post
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Post selection */}
      <div className="space-y-2">
        <Label>Post to boost</Label>
        {postsLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your posts…
          </div>
        ) : selectablePosts.length > 0 ? (
          <div className="space-y-2">
            {selectablePosts.map((post) => (
              <button
                key={post.id}
                onClick={() => setPostId(post.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors',
                  postId === post.id ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                )}
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{getInitials(profile?.display_name || 'U')}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{post.content || 'No text'}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {post.star_count ?? 0} stars · {post.comment_count ?? 0} comments · {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </span>
                {postId === post.id && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No business posts yet. Post something from your home feed while acting as this business.
          </div>
        )}
      </div>

      {/* Goal */}
      <div className="space-y-2">
        <Label>Goal</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GOALS.map((g) => (
            <button
              key={g}
              onClick={() => setGoal(g)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                goal === g ? 'border-primary/50 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              <Target className="h-3.5 w-3.5" />
              {OBJECTIVE_META[g].label.replace('More ', '').replace('More ', '')}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{OBJECTIVE_META[goal].description}</p>
      </div>

      {/* Budget + duration */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="boost-budget">Budget</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              id="boost-budget"
              type="number"
              min={MIN_BUDGET_DOLLARS}
              step="1"
              className="pl-7"
              value={budgetDollars}
              onChange={(e) => setBudgetDollars(e.target.value)}
            />
          </div>
          {budgetCents < MIN_BUDGET_DOLLARS * 100 && budgetCents > 0 && (
            <p className="text-xs text-destructive">Minimum ${MIN_BUDGET_DOLLARS}.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="boost-days">Duration</Label>
          <div className="relative">
            <Input
              id="boost-days"
              type="number"
              min={1}
              max={90}
              step="1"
              className="pr-14"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">days</span>
          </div>
          <p className="text-xs text-muted-foreground">Between 1 and 90 days.</p>
        </div>
      </div>

      {/* Distribution */}
      <div className="space-y-2">
        <Label>Reach & discovery</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as DiscoveryPriority)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRIORITY_META) as DiscoveryPriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PRIORITY_META[priority].description}</p>
        <label className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-border p-3.5">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Audience expansion
            </span>
            <span className="block text-xs text-muted-foreground">Show to audiences related to yours.</span>
          </span>
          <Switch checked={audienceExpansion} onCheckedChange={setAudienceExpansion} />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="boost-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          id="boost-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What makes this worth seeing?"
          maxLength={300}
        />
      </div>

      {/* Summary + estimate */}
      <div className="flex items-center justify-between rounded-2xl bg-muted/50 p-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Estimated reach
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Based on {formatMoney(budgetCents)} over {daysNum} days. Estimates only — never guaranteed.
          </p>
        </div>
        {estimatedReachCents && (
          <p className="text-lg font-bold tabular-nums">
            {(estimatedReachCents.reachMin / 1000).toFixed(1)}K–{(estimatedReachCents.reachMax / 1000).toFixed(1)}K
            <span className="ml-1 text-xs font-medium text-muted-foreground">people</span>
          </p>
        )}
      </div>

      <Button onClick={submit} disabled={!canSubmit} className="w-full gap-2" size="lg">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
        Boost this post · {formatMoney(budgetCents)}
      </Button>
      {!postId && !postsLoading && selectablePosts.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">Select a post above to enable boosting.</p>
      )}
    </div>
  );
}