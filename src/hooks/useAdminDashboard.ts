import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardTotals {
  users: number;
  posts: number;
  reels: number;
  books: number;
  comments: number;
  messages: number;
  groups: number;
  reportsOpen: number;
  reportsTotal: number;
  verifyPending: number;
  bans: number;
  follows: number;
}

export interface SeriesPoint {
  date: string;
  signups: number;
  posts: number;
}

export interface ReportBreakdown {
  open: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
}

export interface ContentMix {
  posts: number;
  reels: number;
  books: number;
  comments: number;
  messages: number;
  groups: number;
}

export interface AuditFeedEntry {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  created_at: string;
}

export interface HealthCheck {
  service: string;
  label: string;
  latency: number | null;
  status: 'ok' | 'slow' | 'down' | 'na';
}

export interface AdminDashboardData {
  loading: boolean;
  totals: DashboardTotals;
  series: SeriesPoint[];
  reportBreakdown: ReportBreakdown;
  contentMix: ContentMix;
  auditFeed: AuditFeedEntry[];
  recentUsers: { id: string; username: string; display_name: string; created_at: string; is_verified: boolean }[];
  health: HealthCheck[];
  lastUpdated: number;
  refresh: () => void;
}

const EMPTY_TOTALS: DashboardTotals = {
  users: 0, posts: 0, reels: 0, books: 0, comments: 0, messages: 0, groups: 0,
  reportsOpen: 0, reportsTotal: 0, verifyPending: 0, bans: 0, follows: 0,
};

const EMPTY_REPORTS: ReportBreakdown = { open: 0, reviewing: 0, resolved: 0, dismissed: 0 };
const EMPTY_MIX: ContentMix = { posts: 0, reels: 0, books: 0, comments: 0, messages: 0, groups: 0 };

function countQuery(table: string, filter?: (q: any) => any): Promise<number> {
  let q: any = (supabase as any).from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  return q.then((r: any) => r.count ?? 0);
}

function lastNDays(n: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push(d);
  }
  return days;
}

function bucketByDay(rows: { created_at: string }[], days: Date[]): number[] {
  const map = new Map<string, number>();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const r of rows) {
    const key = fmt(new Date(r.created_at));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return days.map((d) => map.get(fmt(d)) ?? 0);
}

async function timeProbe(promise: Promise<any>): Promise<number | null> {
  const t0 = performance.now();
  try {
    await promise;
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

export function useAdminDashboard(): AdminDashboardData {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<DashboardTotals>(EMPTY_TOTALS);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [reportBreakdown, setReportBreakdown] = useState<ReportBreakdown>(EMPTY_REPORTS);
  const [contentMix, setContentMix] = useState<ContentMix>(EMPTY_MIX);
  const [auditFeed, setAuditFeed] = useState<AuditFeedEntry[]>([]);
  const [recentUsers, setRecentUsers] = useState<AdminDashboardData['recentUsers']>([]);
  const [health, setHealth] = useState<HealthCheck[]>([]);
  const [lastUpdated, setLastUpdated] = useState(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const days = lastNDays(14);
    const since = days[0].toISOString();

    const [
      users, posts, reels, books, comments, messages, groups,
      reportsOpen, reportsTotal, verifyPending, bans, follows,
      signupRows, postRows,
      repOpen, repReviewing, repResolved, repDismissed,
      dbLat, authLat, storageLat, funcLat,
      audit, recent,
    ] = await Promise.all([
      countQuery('profiles', (q) => q.is('deleted_at', null)),
      countQuery('posts'),
      countQuery('reels'),
      countQuery('books', (q) => q.eq('status', 'published')),
      countQuery('comments'),
      countQuery('messages'),
      countQuery('groups'),
      countQuery('reports', (q) => q.in('status', ['open', 'reviewing'])),
      countQuery('reports'),
      countQuery('verification_requests', (q) => q.eq('status', 'pending')),
      countQuery('user_bans', (q) => q.eq('is_active', true)),
      countQuery('follows'),
      (supabase as any).from('profiles').select('created_at').gte('created_at', since).is('deleted_at', null).limit(3000),
      (supabase as any).from('posts').select('created_at').gte('created_at', since).limit(3000),
      countQuery('reports', (q) => q.eq('status', 'open')),
      countQuery('reports', (q) => q.eq('status', 'reviewing')),
      countQuery('reports', (q) => q.eq('status', 'resolved')),
      countQuery('reports', (q) => q.eq('status', 'dismissed')),
      timeProbe((supabase as any).from('profiles').select('id').limit(1)),
      timeProbe(supabase.auth.getUser()),
      timeProbe(supabase.storage.listBuckets()),
      timeProbe((supabase as any).rpc('admin_red_button_status')),
      (supabase as any).from('admin_audit_logs')
        .select('id, actor_email, action, target_type, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      (supabase as any).from('profiles')
        .select('id, username, display_name, created_at, is_verified')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    if (!mounted.current) return;

    setTotals({
      users, posts, reels, books, comments, messages, groups,
      reportsOpen, reportsTotal, verifyPending, bans, follows,
    });

    const signups = bucketByDay((signupRows as any)?.data ?? [], days);
    const postCounts = bucketByDay((postRows as any)?.data ?? [], days);
    setSeries(days.map((d, i) => ({
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      signups: signups[i],
      posts: postCounts[i],
    })));

    setReportBreakdown({ open: repOpen, reviewing: repReviewing, resolved: repResolved, dismissed: repDismissed });
    setContentMix({ posts, reels, books, comments, messages, groups });
    setAuditFeed((audit as any)?.data ?? []);
    setRecentUsers((recent as any)?.data ?? []);
    setLastUpdated(Date.now());

    const toStatus = (l: number | null): 'ok' | 'slow' | 'down' | 'na' => {
      if (l === null) return 'down';
      if (l < 120) return 'ok';
      if (l < 400) return 'slow';
      return 'slow';
    };

    setHealth([
      { service: 'postgres', label: 'DATABASE', latency: dbLat, status: toStatus(dbLat) },
      { service: 'auth', label: 'AUTH', latency: authLat, status: toStatus(authLat) },
      { service: 'storage', label: 'STORAGE', latency: storageLat, status: storageLat === null ? 'na' : toStatus(storageLat) },
      { service: 'functions', label: 'EDGE FN', latency: funcLat, status: funcLat === null ? 'na' : toStatus(funcLat) },
    ]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [load]);

  const refresh = useCallback(() => { load(); }, [load]);

  return {
    loading, totals, series, reportBreakdown, contentMix, auditFeed, recentUsers, health, lastUpdated, refresh,
  };
}
