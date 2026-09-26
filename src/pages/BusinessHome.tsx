import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useBusiness } from '@/contexts/BusinessContext';
import { OverviewTab } from '@/components/business/OverviewTab';
import { PromoteTab } from '@/components/business/PromoteTab';
import { ContentTab } from '@/components/business/ContentTab';
import { AudienceTab } from '@/components/business/AudienceTab';
import { InsightsTab } from '@/components/business/InsightsTab';
import { CampaignsTab } from '@/components/business/CampaignsTab';
import { BillingTab } from '@/components/business/BillingTab';
import { SettingsTab } from '@/components/business/SettingsTab';
import { ACCOUNT_TYPE_META, ROLE_META } from '@/lib/business';
import {
  LayoutDashboard,
  Megaphone,
  FileText,
  Users,
  BarChart3,
  ListChecks,
  Wallet,
  Settings,
  Store,
  Plus,
  Loader2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'promote', label: 'Promote', icon: Megaphone },
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'campaigns', label: 'Campaigns', icon: ListChecks },
  { id: 'billing', label: 'Billing', icon: Wallet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function getInitials(name: string) {
  return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'B';
}

export default function BusinessHome() {
  const { activeBusiness, accounts, accountsLoading, switchToBusiness } = useBusiness();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = searchParams.get('tab') || 'overview';
  const initialTab = TABS.some((t) => t.id === requestedTab) ? requestedTab : 'overview';
  const [tab, setTab] = useState(initialTab);

  if (accountsLoading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your business…
          </div>
        </div>
      </MainLayout>
    );
  }

  // No business identities yet → onboarding prompt.
  if (!activeBusiness && accounts.length === 0) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store className="h-8 w-8" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">Create your business</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Post as a brand, grow a following and run promotions — all with a proper identity inside Twibs.
            </p>
            <Button className="mt-6 gap-1.5" asChild>
              <Link to="/business/create">
                <Plus className="h-4 w-4" />
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // User has businesses but the active identity is personal → prompt to switch.
  if (!activeBusiness) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
              <Sparkles className="h-8 w-8" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">Switch to a business</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Pick an identity to manage its promotions, insights and team.
            </p>
            <div className="mt-6 w-full max-w-xs space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => switchToBusiness(account.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={account.avatar_url || undefined} />
                    <AvatarFallback className="bg-violet-500/15 text-violet-600 dark:text-violet-300 text-xs">
                      {getInitials(account.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{account.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{account.username} · {ACCOUNT_TYPE_META[account.account_type]?.label}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-2 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground" aria-label="Back to home">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Avatar className="h-11 w-11 ring-2 ring-primary/25">
            <AvatarImage src={activeBusiness.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-sm">
              {getInitials(activeBusiness.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold">{activeBusiness.name}</h1>
              <Badge variant="secondary" className="gap-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <Store className="h-3 w-3" />
                {ACCOUNT_TYPE_META[activeBusiness.account_type]?.label}
              </Badge>
              {activeBusiness.role && (
                <Badge variant="outline" className="rounded-full font-medium">
                  {ROLE_META[activeBusiness.role].label}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              @{activeBusiness.username} · {activeBusiness.followers_count.toLocaleString()} followers
            </p>
          </div>
          <Link
            to={`/business/${activeBusiness.username}`}
            className="ml-auto hidden text-sm font-medium text-primary hover:underline sm:block"
          >
            View public profile
          </Link>
        </div>

        <div className="mt-2 overflow-x-auto">
          <div className="flex w-max gap-1 rounded-2xl border border-border bg-muted/30 p-1">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          {tab === 'overview' && <OverviewTab businessId={activeBusiness.id} />}
          {tab === 'promote' && <PromoteTab businessId={activeBusiness.id} />}
          {tab === 'content' && <ContentTab businessId={activeBusiness.id} />}
          {tab === 'audience' && <AudienceTab businessId={activeBusiness.id} />}
          {tab === 'insights' && <InsightsTab businessId={activeBusiness.id} />}
          {tab === 'campaigns' && <CampaignsTab businessId={activeBusiness.id} />}
          {tab === 'billing' && <BillingTab businessId={activeBusiness.id} />}
          {tab === 'settings' && <SettingsTab businessId={activeBusiness.id} />}
        </div>
      </div>
    </MainLayout>
  );
}