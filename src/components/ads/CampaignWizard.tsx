import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdvertiserAccounts, useAudienceEstimate } from '@/hooks/useAdvertiserAccounts';
import { useCampaignActions } from '@/hooks/useAds';
import { useInterestCategories } from '@/hooks/useInterests';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Loader2,
  Megaphone,
  Globe2,
  Building2,
  Mic,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { getAllLanguages } from '@/lib/languageDetection';
import { cn } from '@/lib/utils';
import {
  OBJECTIVE_META,
  CTA_OPTIONS,
  formatMoney,
  formatNumber,
  type CampaignObjective,
  type CampaignTargeting,
  type AudienceEstimate,
} from '@/lib/ads';

const LANGUAGES = getAllLanguages();
const MIN_BUDGET_CENTS = 500;
const MAX_DAYS = 90;

interface BoostPost {
  id: string;
  content: string;
  created_at: string;
  star_count: number;
  comment_count: number;
  profiles: { username: string; display_name: string; avatar_url: string | null };
  post_media: { id: string; url: string; type: string; alt_text: string | null }[];
}

const STEPS = ['Post', 'Objective', 'Audience', 'Budget', 'Review'] as const;

export default function CampaignWizard({ postId }: { postId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accounts, loading: accountsLoading } = useAdvertiserAccounts();
  const { estimate } = useAudienceEstimate();
  const { createCampaign, submitCampaign } = useCampaignActions();
  const { data: categories } = useInterestCategories();

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Form state
  const [advertiserId, setAdvertiserId] = useState('');
  const [objective, setObjective] = useState<CampaignObjective>('reach');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState<string>('Learn More');
  const [ctaUrl, setCtaUrl] = useState('');
  const [targeting, setTargeting] = useState<CampaignTargeting>({
    automatic: true,
    locations: [],
    languages: [],
    interests: [],
  });
  const [budgetDollars, setBudgetDollars] = useState('');
  const [dailyBudgetDollars, setDailyBudgetDollars] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [estimateResult, setEstimateResult] = useState<AudienceEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [boostPost, setBoostPost] = useState<BoostPost | null>(null);
  const [postLoading, setPostLoading] = useState(!!postId);

  const isBoost = !!postId;

  useEffect(() => {
    if (postId) {
      (async () => {
        setPostLoading(true);
        const { data, error } = await (supabase as any)
          .from('posts')
          .select(`
            id, content, created_at, star_count, comment_count,
            profiles (username, display_name, avatar_url),
            post_media (id, url, type, alt_text)
          `)
          .eq('id', postId)
          .eq('hidden', false)
          .single();
        if (error || !data) {
          toast({ variant: 'destructive', title: 'Post not found' });
          navigate('/ads');
        } else {
          setBoostPost(data);
          setHeadline('');
        }
        setPostLoading(false);
      })();
    }
  }, [postId, navigate, toast]);

  useEffect(() => {
    if (accounts.length > 0 && !advertiserId) {
      setAdvertiserId(accounts[0].id);
    }
  }, [accounts, advertiserId]);

  const businessAccounts = accounts.filter((a) => a.account_type !== 'creator');
  const creatorAccounts = accounts.filter((a) => a.account_type === 'creator');
  const allAccounts = [...businessAccounts, ...creatorAccounts];

  const totalBudgetCents = useMemo(() => {
    const v = parseFloat(budgetDollars);
    return isFinite(v) ? Math.round(v * 100) : 0;
  }, [budgetDollars]);

  const dailyBudgetCents = useMemo(() => {
    const v = parseFloat(dailyBudgetDollars);
    return isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  }, [dailyBudgetDollars]);

  const durationDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(0, Math.ceil(diff / 86400000));
  }, [startDate, endDate]);

  const budgetValid = totalBudgetCents >= MIN_BUDGET_CENTS;
  const datesValid = !!startDate && !!endDate && durationDays >= 1 && durationDays <= MAX_DAYS;
  const dailyValid =
    dailyBudgetCents === null || (dailyBudgetCents > 0 && dailyBudgetCents <= totalBudgetCents);

  const runEstimate = useCallback(async () => {
    setEstimating(true);
    try {
      const res = await estimate(targeting);
      setEstimateResult(res);
    } catch {
      setEstimateResult(null);
    } finally {
      setEstimating(false);
    }
  }, [targeting, estimate]);

  useEffect(() => {
    if (step >= 2) {
      runEstimate();
    }
  }, [step, targeting, runEstimate]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const toggleInterest = (id: string) => {
    setTargeting((t) => ({
      ...t,
      interests: t.interests.includes(id)
        ? t.interests.filter((i) => i !== id)
        : [...t.interests, id],
    }));
  };

  const toggleLanguage = (lang: string) => {
    setTargeting((t) => ({
      ...t,
      languages: t.languages.includes(lang)
        ? t.languages.filter((l) => l !== lang)
        : [...t.languages, lang],
    }));
  };

  const handleCreate = async () => {
    if (!advertiserId) {
      toast({ variant: 'destructive', title: 'Select an advertiser account' });
      return;
    }
    if (!budgetValid) {
      toast({ variant: 'destructive', title: 'Minimum budget is $5.00' });
      return;
    }
    if (!datesValid) {
      toast({ variant: 'destructive', title: 'Choose a valid duration (1–90 days)' });
      return;
    }
    if (!dailyValid) {
      toast({ variant: 'destructive', title: 'Daily budget must be ≤ total budget' });
      return;
    }
    setCreating(true);
    try {
      const startIso = scheduled
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : new Date().toISOString();
      const endIso = new Date(`${endDate}T23:59:59`).toISOString();

      const campaign = await createCampaign({
        advertiser_id: advertiserId,
        name: boostPost
          ? `Boost: ${boostPost.profiles.display_name}'s post`
          : headline.trim() || 'New campaign',
        objective,
        total_budget_cents: totalBudgetCents,
        budget_type: dailyBudgetCents ? 'daily' : 'total',
        daily_budget_cents: dailyBudgetCents,
        start_at: startIso,
        end_at: endIso,
        is_scheduled: scheduled,
        post_id: postId ?? null,
        headline: headline.trim() || null,
        description: description.trim() || null,
        cta,
        cta_url: ctaUrl.trim() || null,
        targeting,
      });

      await submitCampaign(campaign.id);

      toast({
        title: 'Campaign created',
        description: 'Submitted for review. It will start delivering once approved.',
      });
      navigate(`/ads/campaigns/${campaign.id}`);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not create campaign',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setCreating(false);
    }
  };

  if (accountsLoading || postLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (allAccounts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Megaphone className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold">You need a professional account to advertise</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create a Business or Creator account first. It becomes the identity
            that your ads are shown as.
          </p>
          <Button className="mt-5 gap-2" onClick={() => navigate('/settings?section=professional')}>
            <Building2 className="h-4 w-4" />
            Create professional account
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                i === step
                  ? 'bg-foreground text-background'
                  : i < step
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {i < step && <Check className="h-3 w-3" />}
              <span className="tabular-nums">{i + 1}.</span>
              {label}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-3 bg-border" />}
          </div>
        ))}
      </div>

      {/* Advertiser selector */}
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <Label className="mb-2 block text-sm font-semibold">Advertising as</Label>
        <div className="flex flex-wrap gap-2">
          {allAccounts.map((account) => (
            <button
              key={account.id}
              onClick={() => setAdvertiserId(account.id)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                advertiserId === account.id
                  ? 'border-primary/60 bg-primary/5 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-border'
              )}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={account.avatar_url || undefined} />
                <AvatarFallback className="text-[9px]">
                  {account.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{account.name}</span>
              {account.account_type === 'business' ? (
                <Building2 className="h-3.5 w-3.5 text-sky-500" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      {step === 0 && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Your advertisement</h3>
              {isBoost && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  Boosting existing post
                </span>
              )}
            </div>

            {isBoost ? (
              boostPost ? (
                <div className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={boostPost.profiles.avatar_url || undefined} />
                      <AvatarFallback>{boostPost.profiles.display_name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{boostPost.profiles.display_name}</p>
                      <p className="text-sm text-muted-foreground">
                        @{boostPost.profiles.username}
                      </p>
                    </div>
                  </div>
                  {boostPost.content && (
                    <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                      {boostPost.content}
                    </p>
                  )}
                  {boostPost.post_media.map((m) =>
                    m.type === 'image' ? (
                      <img
                        key={m.id}
                        src={m.url}
                        alt=""
                        className="mt-3 max-h-72 w-full rounded-xl border border-border/40 object-cover"
                      />
                    ) : (
                      <video
                        key={m.id}
                        src={m.url}
                        className="mt-3 max-h-72 w-full rounded-xl border border-border/40"
                        controls
                        muted
                      />
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading post…</p>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-headline">Headline *</Label>
                  <Input
                    id="wiz-headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    maxLength={120}
                    placeholder="A short, punchy headline"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-desc">Description</Label>
                  <Input
                    id="wiz-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={300}
                    placeholder="Supporting text for your ad"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-cta">Call to action</Label>
                <select
                  id="wiz-cta"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {CTA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {CTA_OPTIONS.find((o) => o.value === cta)?.description}
                </p>
              </div>
              {(cta === 'Learn More' || cta === 'Visit Website') && (
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-ctaurl">Destination URL</Label>
                  <Input
                    id="wiz-ctaurl"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="font-bold">What do you want people to do?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(OBJECTIVE_META) as CampaignObjective[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setObjective(key)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-colors',
                    objective === key
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border/60 hover:border-border'
                  )}
                >
                  <p className="font-semibold">{OBJECTIVE_META[key].label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {OBJECTIVE_META[key].description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold">Who should see your ad?</h3>
                <p className="text-sm text-muted-foreground">
                  Automatic lets the platform pick based on available data.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Automatic audience</span>
                <Switch
                  checked={targeting.automatic}
                  onCheckedChange={(v) => setTargeting((t) => ({ ...t, automatic: v }))}
                />
              </div>
            </div>

            {!targeting.automatic && (
              <div className="space-y-5">
                <div>
                  <Label className="mb-2 block font-semibold">Interests</Label>
                  <div className="flex flex-wrap gap-2">
                    {categories?.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => toggleInterest(cat.id)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          targeting.interests.includes(cat.id)
                            ? 'border-primary/60 bg-primary/10 text-primary'
                            : 'border-border/60 text-muted-foreground hover:border-border'
                        )}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block font-semibold">Languages</Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => toggleLanguage(lang.code)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          targeting.languages.includes(lang.code)
                            ? 'border-primary/60 bg-primary/10 text-primary'
                            : 'border-border/60 text-muted-foreground hover:border-border'
                        )}
                      >
                        {lang.nativeName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Estimate */}
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Globe2 className="h-4 w-4" />
                Estimated audience
              </div>
              {estimating ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating from platform data…
                </div>
              ) : estimateResult?.sufficient_data ? (
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <EstimateStat label="Active users" value={formatNumber(estimateResult.total_active_users)} />
                  <EstimateStat label="Matching audience" value={formatNumber(estimateResult.matched_users)} />
                  <EstimateStat label="Est. reach" value={`${formatNumber(estimateResult.reach_min)}–${formatNumber(estimateResult.reach_max)}`} />
                  <EstimateStat label="Est. impressions" value={formatNumber(estimateResult.estimated_impressions)} />
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Audience estimate unavailable</p>
                    <p className="text-xs">
                      We&apos;re still collecting enough platform data to provide a
                      reliable estimate for this audience.
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Estimate based on your audience, budget and currently available
                inventory. Not a guarantee.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <h3 className="font-bold">Budget & duration</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-budget">Total budget (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="wiz-budget"
                    type="number"
                    min={5}
                    step="1"
                    value={budgetDollars}
                    onChange={(e) => setBudgetDollars(e.target.value)}
                    className="pl-7"
                    placeholder="25"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum $5.00 ({formatMoney(totalBudgetCents)} total)
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-daily">Daily budget (optional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="wiz-daily"
                    type="number"
                    min={1}
                    step="1"
                    value={dailyBudgetDollars}
                    onChange={(e) => setDailyBudgetDollars(e.target.value)}
                    className="pl-7"
                    placeholder="5"
                  />
                </div>
                {!dailyValid && (
                  <p className="text-xs text-destructive">
                    Daily budget must be ≤ total budget
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={scheduled} onCheckedChange={setScheduled} />
              <span className="text-sm font-medium">Schedule a start date</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-start">Start date</Label>
                <Input
                  id="wiz-start"
                  type="date"
                  disabled={!scheduled}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {!scheduled && (
                  <p className="text-xs text-muted-foreground">Starts as soon as it&apos;s approved.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-end">End date</Label>
                <Input
                  id="wiz-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {durationDays > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {durationDays} day{durationDays !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {estimating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Estimating delivery…
              </div>
            ) : estimateResult?.sufficient_data && budgetValid && datesValid ? (
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <EstimateStat label="Total budget" value={formatMoney(totalBudgetCents)} />
                  <EstimateStat label="Est. reach" value={`${formatNumber(estimateResult.reach_min)}–${formatNumber(estimateResult.reach_max)}`} />
                  <EstimateStat label="Est. impressions" value={formatNumber(estimateResult.estimated_impressions)} />
                  <EstimateStat label="Duration" value={`${durationDays}d`} />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Estimate based on your audience and current available inventory. Not a guarantee.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <h3 className="font-bold">Review your campaign</h3>

            <div className="rounded-2xl border border-border/60 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={
                      allAccounts.find((a) => a.id === advertiserId)?.avatar_url || undefined
                    }
                  />
                  <AvatarFallback>
                    {allAccounts.find((a) => a.id === advertiserId)?.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">
                    {allAccounts.find((a) => a.id === advertiserId)?.name}
                  </p>
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Megaphone className="h-3 w-3" /> Sponsored
                  </p>
                </div>
              </div>
              {(headline || boostPost?.content) && (
                <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {boostPost ? boostPost.content : headline}
                </p>
              )}
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
              {cta && (
                <Button variant="outline" size="sm" className="mt-3 rounded-full">
                  {cta}
                </Button>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Objective</dt>
                <dd className="font-semibold">{OBJECTIVE_META[objective].label}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Budget</dt>
                <dd className="font-semibold">{formatMoney(totalBudgetCents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-semibold">
                  {durationDays} day{durationDays !== 1 ? 's' : ''}
                  {scheduled ? ' (scheduled)' : ''}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Audience</dt>
                <dd className="font-semibold">
                  {targeting.automatic ? 'Automatic' : 'Targeted'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Est. reach</dt>
                <dd className="font-semibold">
                  {estimateResult?.sufficient_data
                    ? `${formatNumber(estimateResult.reach_min)}–${formatNumber(estimateResult.reach_max)}`
                    : 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Est. impressions</dt>
                <dd className="font-semibold">
                  {estimateResult?.sufficient_data
                    ? formatNumber(estimateResult.estimated_impressions)
                    : 'Unavailable'}
                </dd>
              </div>
            </dl>

            <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              Your campaign is submitted directly for staff review. Once approved,
              it starts delivering to your audience.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={next}
            disabled={
              (step === 3 && (!budgetValid || !datesValid || !dailyValid)) ||
              (step === 0 && !isBoost && !headline.trim())
            }
            className="gap-1"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={creating || !budgetValid || !datesValid || !dailyValid}
            className="gap-1.5"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Create campaign
          </Button>
        )}
      </div>
    </div>
  );
}

function EstimateStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
