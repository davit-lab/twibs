import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useBusiness } from '@/contexts/BusinessContext';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import {
  ALLOWED_AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  extensionFor,
} from '@/hooks/useBusinessAssetUpload';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Store,
  Sparkles,
  Building2,
  FolderKanban,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Camera,
  Globe,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACCOUNT_TYPE_META,
  BUSINESS_GOALS,
  type BusinessAccountType,
} from '@/lib/business';

const TYPE_CARDS: { type: BusinessAccountType; icon: typeof Store }[] = [
  { type: 'business', icon: Store },
  { type: 'creator', icon: Sparkles },
  { type: 'organization', icon: Building2 },
  { type: 'project', icon: FolderKanban },
];

const STEPS = ['Type', 'Identity', 'Goals', 'Finish'];

function getInitials(name: string) {
  return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'B';
}

export default function BusinessCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = useBusiness();
  const api = useBusinessApi();

  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<BusinessAccountType>('business');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [category, setCategory] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarStagedPath, setAvatarStagedPath] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);

  const toggleGoal = (goal: string) =>
    setGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));

  const canContinue =
    (step === 0 && !!accountType) ||
    (step === 1 && name.trim().length > 0 && usernameValid) ||
    (step === 2 && true) ||
    step === 3;

  const uploadAvatar = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error('Images must be 10MB or smaller.');
    }
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) throw new Error('Not authenticated');

    // The advertiser_accounts row does not exist yet, so the asset cannot go
    // straight into its business-scoped folder. It is staged under the
    // creator's own (writable) personal folder and relocated to
    // `<business_id>/...` by `relocateStagedAvatar` once the id is known.
    const fileExt = extensionFor(file.type, 'jpg');
    const stagedPath = `${user.id}/business-staging/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(stagedPath, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(stagedPath);
    return { url: urlData.publicUrl, path: stagedPath };
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { url, path } = await uploadAvatar(file);
      // A previously staged pick that is being replaced is now dead weight.
      if (avatarStagedPath) {
        void supabase.storage.from('avatars').remove([avatarStagedPath]);
      }
      setAvatarUrl(url);
      setAvatarStagedPath(path);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload photo.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  /**
   * Moves the staged avatar into the newly created business's own folder and
   * repoints `avatar_url` at it. Best-effort: if this fails the business still
   * exists and still has a working (staged) avatar, so a storage hiccup must not
   * be reported as a failed creation.
   */
  const relocateStagedAvatar = async (businessId: string, stagedPath: string) => {
    const { data: blob, error: downloadError } = await supabase.storage
      .from('avatars')
      .download(stagedPath);
    if (downloadError || !blob) throw downloadError ?? new Error('Could not read staged avatar.');

    const destination = `${businessId}/business-avatar-${Date.now()}.${stagedPath.split('.').pop() || 'jpg'}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(destination, blob, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(destination);
    await api.updateBusinessProfile(businessId, { avatar_url: urlData.publicUrl });
    void supabase.storage.from('avatars').remove([stagedPath]);
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const account = await api.createBusinessAccount({
        account_type: accountType,
        name: name.trim(),
        username: username.trim(),
        category: category.trim() || undefined,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        location: location.trim() || undefined,
        avatar_url: avatarUrl || undefined,
        goals,
      });
      await refresh();

      // Now that the business has an id, move the avatar out of the creator's
      // personal staging folder into the business folder the RLS policies
      // actually govern, so later edits and removals are correctly authorised.
      if (avatarStagedPath) {
        try {
          await relocateStagedAvatar(account.id, avatarStagedPath);
        } catch {
          // Non-fatal: the business exists and its avatar URL still resolves.
        }
      }

      toast({
        title: 'Business created',
        description: `${account.name} is ready. Pick a post to promote.`,
      });
      navigate('/b', { replace: true });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not create business',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create a business identity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Post as a brand, grow your audience and run promotions — all inside Twibs.
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                  i < step && 'border-primary bg-primary text-white',
                  i === step && 'border-primary text-primary',
                  i > step && 'border-border text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-px w-8', i < step ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1 — type */}
        {step === 0 && (
          <div className="space-y-3">
            {TYPE_CARDS.map(({ type, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setAccountType(type)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors',
                  accountType === type
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30'
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                    accountType === type ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <span className="font-semibold">{ACCOUNT_TYPE_META[type].label}</span>
                    {accountType === type && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {ACCOUNT_TYPE_META[type].description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* STEP 2 — identity */}
        {step === 1 && (
          <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16 ring-2 ring-border">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-base">
                      {getInitials(name || 'Business')}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-background shadow-sm hover:border-primary/50 hover:text-primary transition-colors">
                    {uploadingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{ACCOUNT_TYPE_META[accountType].label} photo</p>
                  <p>Square photo, up to 5MB. You can change this later.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Name</Label>
                <Input
                  id="biz-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={ACCOUNT_TYPE_META[accountType].label === 'Creator' ? 'e.g. Your Creator Name' : 'e.g. Acme Studio'}
                  maxLength={100}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-username">
                  Username
                  {username && (
                    <span className={cn('ml-2 text-xs', usernameValid ? 'text-emerald-600' : 'text-destructive')}>
                      {usernameValid ? `@${username} looks good` : '3-30 characters: letters, numbers, _'}
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                  <Input
                    id="biz-username"
                    className="pl-7"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                    placeholder="username"
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="biz-category">Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="biz-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Coffee shop"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="biz-location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="biz-location"
                      className="pl-9"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, Country"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="biz-website"
                    className="pl-9"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biz-desc">Bio <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  id="biz-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell people what this business is about."
                  maxLength={300}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — goals */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              What do you want to achieve? These shape your default promotion settings.
            </p>
            {BUSINESS_GOALS.map((goal) => (
              <button
                key={goal}
                onClick={() => toggleGoal(goal)}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border p-4 text-left text-sm font-medium transition-colors',
                  goals.includes(goal)
                    ? 'border-primary/50 bg-primary/5 text-primary ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30'
                )}
              >
                {goal}
                {goals.includes(goal) && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}

        {/* STEP 4 — finish */}
        {step === 3 && (
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white">
                    {getInitials(name || 'Business')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{name || 'Untitled business'}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    @{username || 'username'} · {ACCOUNT_TYPE_META[accountType].label}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                {category && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium">{category}</span>
                  </div>
                )}
                {location && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium">{location}</span>
                  </div>
                )}
                {website && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Website</span>
                    <span className="font-medium text-primary break-all">{website}</span>
                  </div>
                )}
                {goals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {goals.map((g) => (
                      <span key={g} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Your business gets its own profile, promotion wallet and team roles. You can manage all of this later in the Business hub.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue} className="gap-1.5">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create business
            </Button>
          )}
        </div>
      </div>
    </MainLayout>
  );
}