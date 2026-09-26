import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import Feed from '@/components/feed/Feed';
import BusinessProfileEditor from '@/components/business/BusinessProfileEditor';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import { useToast } from '@/hooks/use-toast';
import {
  Store,
  BadgeCheck,
  MapPin,
  Globe,
  UserPlus,
  UserCheck,
  Settings,
  Pencil,
  Repeat,
  Loader2,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { ACCOUNT_TYPE_META, ROLE_CAN, type BusinessAccount } from '@/lib/business';

export default function BusinessProfile() {
  const { username = '' } = useParams<{ username: string }>();
  const { user } = useAuth();
  const api = useBusinessApi();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mode, activeBusiness, switchToBusiness } = useBusiness();

  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const { data: account, isLoading, isError } = useQuery<BusinessAccount>({
    queryKey: ['business-profile', username],
    queryFn: () => api.getBusinessProfile(username),
    retry: false,
  });

  const myRole = account?.my_role ?? null;
  const canEdit = ROLE_CAN.canManage(myRole && myRole !== 'none' ? myRole : null);
  const isFollowing = following ?? account?.is_following ?? false;
  const isThisActiveBusiness = mode === 'business' && activeBusiness?.id === account?.id;

  const toggleFollow = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!account) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await api.unfollowBusiness(account.id, user.id);
        setFollowing(false);
      } else {
        await api.followBusiness(account.id, user.id);
        setFollowing(true);
      }
      queryClient.invalidateQueries({ queryKey: ['business-profile', username] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not update follow',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setFollowBusy(false);
    }
  };

  const handleSwitchToBusiness = () => {
    if (!account) return;
    switchToBusiness(account.id);
    toast({
      title: `Now posting as ${account.name}`,
      description: 'Switch back to your personal account any time from the account switcher.',
    });
  };

  if (isLoading)
    return (
      <MainLayout>
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
          <div className="mx-auto max-w-4xl">
            <Skeleton className="h-44 w-full rounded-none md:h-52" />
            <div className="px-4 md:px-6">
              <div className="-mt-16 rounded-2xl border border-border bg-card p-5 md:p-6">
                <Skeleton className="h-28 w-28 rounded-full" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );

  if (isError || !account)
    return (
      <MainLayout>
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted">
            <Store className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-5 text-lg font-semibold">This business isn&apos;t available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been removed or the link may be incorrect.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate(-1)} className="rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go back
            </Button>
            <Button asChild className="rounded-xl">
              <Link to="/">Explore Twibs</Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );

  const typeLabel = ACCOUNT_TYPE_META[account.account_type]?.label;
  const joined = account.created_at
    ? new Date(account.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24 lg:pb-8">
        <div className="mx-auto max-w-4xl">
          {/* Cover */}
          <div className="relative h-44 overflow-hidden bg-muted md:h-52">
            {account.cover_url ? (
              <img src={account.cover_url} alt="" className="h-full w-full object-cover" />
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Back"
              className="absolute left-4 top-4 rounded-xl border border-white/10 bg-black/50 text-white hover:bg-black/70"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Identity card */}
          <div className="relative -mt-16 px-4">
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex items-end gap-4">
                  <div className="relative shrink-0">
                    <Avatar className="h-24 w-24 border-4 border-card md:h-28 md:w-28">
                      <AvatarImage src={account.avatar_url || undefined} alt={account.name} className="object-cover" />
                      <AvatarFallback className="rounded-xl bg-muted text-2xl font-bold">
                        {(account.name || 'B').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setEditorOpen(true)}
                        aria-label="Change profile picture"
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-card bg-primary text-primary-foreground transition-transform hover:scale-105"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="flex items-center gap-1.5 text-xl font-bold md:text-2xl">
                        <span className="break-words">{account.name}</span>
                        <BadgeCheck className="h-5 w-5 shrink-0 fill-primary text-background" />
                      </h1>
                      {typeLabel ? (
                        <Badge variant="secondary" className="gap-1 rounded-lg">
                          <Store className="h-3 w-3" />
                          {typeLabel}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">@{account.username}</p>
                    {account.category ? (
                      <p className="mt-0.5 text-sm font-medium">{account.category}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <>
                      {!isThisActiveBusiness ? (
                        <Button
                          variant="outline"
                          onClick={handleSwitchToBusiness}
                          className="h-9 gap-1.5 rounded-xl font-semibold"
                        >
                          <Repeat className="h-4 w-4" />
                          Switch to this business
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => setEditorOpen(true)}
                        className="h-9 gap-1.5 rounded-xl font-semibold"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit profile
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-xl">
                        <Link to="/b" title="Business settings">
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                    </>
                  ) : user ? (
                    <Button
                      onClick={toggleFollow}
                      disabled={followBusy}
                      className="h-9 gap-1.5 rounded-xl font-semibold"
                    >
                      {followBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isFollowing ? (
                        <>
                          <Check className="h-4 w-4" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          Follow
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button asChild className="h-9 gap-1.5 rounded-xl font-semibold">
                      <Link to="/auth">
                        <UserPlus className="h-4 w-4" />
                        Follow
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Counts + meta */}
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <span className="font-semibold">
                    {account.followers_count.toLocaleString()}{' '}
                    <span className="font-normal text-muted-foreground">
                      {account.followers_count === 1 ? 'follower' : 'followers'}
                    </span>
                  </span>
                </div>
                {account.description ? (
                  <p className="max-w-2xl leading-relaxed text-foreground/80">{account.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-muted-foreground">
                  {account.location ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {account.location}
                    </span>
                  ) : null}
                  {account.website ? (
                    <a
                      href={account.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {account.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Content tabs */}
          <div className="mt-4 px-4">
            <div className="rounded-2xl border border-border bg-card">
              <Tabs defaultValue="posts" className="w-full">
                <div className="border-b border-border px-4">
                  <TabsList className="grid h-9 w-full max-w-[320px] grid-cols-2 rounded-lg bg-muted/50 p-0.5">
                    <TabsTrigger value="posts" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <Store className="h-3.5 w-3.5" />
                      Posts
                    </TabsTrigger>
                    <TabsTrigger value="about" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <UserCheck className="h-3.5 w-3.5" />
                      About
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="posts" className="mt-0 p-4">
                  {/* Reuses the real social Feed, so business posts render with
                      full interactions and business attribution. */}
                  <Feed businessId={account.id} />
                </TabsContent>

                <TabsContent value="about" className="mt-0 p-5 md:p-6">
                  <dl className="space-y-4 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</dt>
                      <dd className="mt-1 leading-relaxed text-foreground/80">
                        {account.description || 'This business has not added a description yet.'}
                      </dd>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</dt>
                        <dd className="mt-1">{account.category || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
                        <dd className="mt-1">{typeLabel || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</dt>
                        <dd className="mt-1">{account.location || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joined</dt>
                        <dd className="mt-1">{joined || '—'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website</dt>
                        <dd className="mt-1">
                          {account.website ? (
                            <a
                              href={account.website}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-primary hover:underline"
                            >
                              {account.website}
                            </a>
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      <BusinessProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        account={account}
      />
    </MainLayout>
  );
}
