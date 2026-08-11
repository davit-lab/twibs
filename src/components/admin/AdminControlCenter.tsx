import { useMemo } from 'react';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { getActionLabel } from '@/hooks/useAdminAudit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  Crown,
  FileText,
  Flag,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function OverviewCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {detail && <p className="mt-3 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}

function PlainPanel({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border/70 bg-card shadow-sm ${className ?? ''}`}>
      <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function QueueRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20'
        : tone === 'success'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20'
          : 'bg-muted text-muted-foreground border-border';

  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${toneClass}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function AdminControlCenter({
  onNavigate,
  openReportCount,
  pendingVerifyCount,
  onPurge,
  isSuperAdmin,
}: {
  onNavigate: (tab: string) => void;
  openReportCount: number;
  pendingVerifyCount: number;
  onPurge: () => void;
  isSuperAdmin: boolean;
}) {
  const { user, profile } = useAuth();
  const d = useAdminDashboard();

  const lastSignups = d.series.length ? d.series[d.series.length - 1].signups : 0;
  const lastPosts = d.series.length ? d.series[d.series.length - 1].posts : 0;

  const contentTotal = useMemo(() => {
    const m = d.contentMix;
    return m.posts + m.reels + m.books + m.comments + m.messages + m.groups;
  }, [d.contentMix]);

  const displayName = profile?.display_name || profile?.username || user?.email || 'Admin';
  const reportTotal = d.reportBreakdown.open + d.reportBreakdown.reviewing + d.reportBreakdown.resolved + d.reportBreakdown.dismissed;
  const healthyServices = d.health.filter((h) => h.status === 'ok').length;

  return (
    <div className="mb-5 space-y-4">
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin panel</h1>
              <Badge variant="secondary" className="rounded-full">
                {isSuperAdmin ? 'Super admin' : 'Staff'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Review users, content, reports, verification requests and safety settings.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{displayName}</span>
              {profile?.username && <span> · @{profile.username}</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={d.refresh}>
              <RefreshCw className={`h-4 w-4 ${d.loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {isSuperAdmin && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={onPurge}>
                <Trash2 className="h-4 w-4" />
                Delete all users
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <OverviewCard label="Users" value={d.totals.users} icon={Users} detail={lastSignups ? `+${lastSignups} today` : 'No new signups today'} />
        <OverviewCard label="Posts" value={d.totals.posts} icon={FileText} detail={lastPosts ? `+${lastPosts} today` : 'No new posts today'} />
        <OverviewCard label="Reels" value={d.totals.reels} icon={Clapperboard} />
        <OverviewCard label="Books" value={d.totals.books} icon={BookOpen} />
        <OverviewCard label="Open reports" value={d.totals.reportsOpen} icon={Flag} detail={pendingVerifyCount ? `${pendingVerifyCount} verifications pending` : 'Verification queue clear'} />
        <OverviewCard label="Active bans" value={d.totals.bans} icon={Ban} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PlainPanel
          title="Moderation"
          description="Items that need staff review."
          action={(
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => onNavigate('reports')}>
              Open reports <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <QueueRow label="Open reports" value={d.reportBreakdown.open} tone={d.reportBreakdown.open ? 'danger' : 'success'} />
            <QueueRow label="In review" value={d.reportBreakdown.reviewing} tone={d.reportBreakdown.reviewing ? 'warning' : 'default'} />
            <QueueRow label="Resolved" value={d.reportBreakdown.resolved} tone="success" />
            <QueueRow label="Dismissed" value={d.reportBreakdown.dismissed} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigate('reports')}>
              <Flag className="h-4 w-4" />
              Reports ({openReportCount})
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigate('verification')}>
              <BadgeCheck className="h-4 w-4" />
              Verification ({pendingVerifyCount})
            </Button>
          </div>

          {reportTotal === 0 && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              No reports are waiting right now.
            </div>
          )}
        </PlainPanel>

        <PlainPanel title="Platform status" description="Basic service checks and content totals.">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Services healthy
              </span>
              <span className="text-sm font-medium text-foreground">
                {healthyServices}/{d.health.length || 0}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2.5">
              <span className="text-sm text-foreground">Total content items</span>
              <span className="text-sm font-medium tabular-nums text-foreground">{contentTotal.toLocaleString()}</span>
            </div>

            {d.health.some((h) => h.status === 'down' || h.status === 'slow') && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Some services are responding slowly. Check the audit and infrastructure logs.
              </div>
            )}

            {!d.health.some((h) => h.status === 'down' || h.status === 'slow') && (
              <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                No immediate service issues detected.
              </div>
            )}
          </div>
        </PlainPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PlainPanel
          title="Recent admin activity"
          action={(
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => onNavigate('audit')}>
              View audit log <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        >
          <div className="divide-y divide-border/70">
            {d.auditFeed.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
            )}
            {d.auditFeed.slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {getActionLabel(e.action)}
                    {e.target_type && <span className="font-normal text-muted-foreground"> · {e.target_type}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtRelative(e.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </PlainPanel>

        <PlainPanel
          title="New users"
          action={(
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => onNavigate('users')}>
              User directory <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        >
          <div className="divide-y divide-border/70">
            {d.recentUsers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No new users yet.</p>
            )}
            {d.recentUsers.slice(0, 6).map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {(u.display_name || u.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.display_name || u.username}
                    {u.is_verified && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtRelative(u.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </PlainPanel>
      </div>
    </div>
  );
}
