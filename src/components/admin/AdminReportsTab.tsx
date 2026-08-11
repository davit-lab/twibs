import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, SearchCheck, Trash2, EyeOff,
  Flag, ShieldAlert,
} from 'lucide-react';
import { AdminReport } from './types';
import ReportInvestigationDialog, { ReportAction } from './ReportInvestigationDialog';
import AdminSection from './AdminSection';

const HIDEABLE_TYPES = ['post', 'reel', 'book'];
const DELETEABLE_TYPES = ['post', 'reel', 'book', 'comment', 'interest_post'];

export default function AdminReportsTab() {
  const { user: currentUser } = useAuth();
  const { toggleHidden, deleteContent, writeAudit } = useAdminActions();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [investigating, setInvestigating] = useState<AdminReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const resolveTarget = useCallback(async (targetType: string, targetId: string) => {
    try {
      switch (targetType) {
        case 'post': {
          const { data: post } = await (supabase as any)
            .from('posts').select('content, user_id, hidden').eq('id', targetId).maybeSingle();
          if (!post) return null;
          return { type: 'post', preview: post.content?.slice(0, 400), userId: post.user_id, hidden: !!post.hidden };
        }
        case 'interest_post': {
          const { data: post } = await (supabase as any)
            .from('interest_posts').select('content, user_id').eq('id', targetId).maybeSingle();
          if (!post) return null;
          return { type: 'interest_post', preview: post.content?.slice(0, 400), userId: post.user_id };
        }
        case 'profile': {
          const { data: prof } = await (supabase as any)
            .from('profiles').select('display_name, username, user_id').eq('user_id', targetId).maybeSingle();
          if (!prof) return null;
          return { type: 'profile', preview: `@${prof.username}`, userId: prof.user_id, userName: prof.display_name };
        }
        case 'reel': {
          const { data: reel } = await (supabase as any)
            .from('reels').select('caption, user_id, hidden').eq('id', targetId).maybeSingle();
          if (!reel) return null;
          return { type: 'reel', preview: reel.caption?.slice(0, 400), userId: reel.user_id, hidden: !!reel.hidden };
        }
        case 'book': {
          const { data: book } = await (supabase as any)
            .from('books').select('title, author_id, hidden').eq('id', targetId).maybeSingle();
          if (!book) return null;
          return { type: 'book', preview: book.title, userId: book.author_id, hidden: !!book.hidden };
        }
        case 'group': {
          const { data: group } = await (supabase as any)
            .from('groups').select('name').eq('id', targetId).maybeSingle();
          if (!group) return null;
          return { type: 'group', preview: group.name };
        }
        case 'comment': {
          const { data: comment } = await (supabase as any)
            .from('comments').select('content, user_id').eq('id', targetId).maybeSingle();
          if (!comment) return null;
          return { type: 'comment', preview: comment.content?.slice(0, 400), userId: comment.user_id };
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reportsData } = await (supabase as any)
        .from('reports')
        .select('*')
        .in('status', ['open', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (reportsData && reportsData.length > 0) {
        const reporterIds = [...new Set(reportsData.map((r: any) => r.reporter_id))];
        const { data: reporterProfiles } = await (supabase as any)
          .from('profiles').select('user_id, display_name, username, avatar_url').in('user_id', reporterIds);
        const reporterMap = new Map((reporterProfiles || []).map((p: any) => [p.user_id, p]));

        const withTargets = await Promise.all(
          reportsData.map(async (report: any) => ({
            ...report,
            reporter: reporterMap.get(report.reporter_id) || null,
            target: await resolveTarget(report.target_type, report.target_id),
          }))
        );
        setReports(withTargets);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load reports.' });
    } finally {
      setLoading(false);
    }
  }, [resolveTarget]);

  useEffect(() => { load(); }, [load]);

  const setReportStatus = async (report: AdminReport, status: string) => {
    setBusyReportId(report.id);
    try {
      const { error } = await (supabase as any).rpc('update_report_status', {
        report_id: report.id,
        new_status: status,
      });
      if (error) throw error;
      await writeAudit(status === 'resolved' ? 'resolve_report' : 'dismiss_report', 'report', report.id, { reason: report.reason });
      setReports(prev => prev.filter(r => r.id !== report.id));
      setSelected(prev => { const s = new Set(prev); s.delete(report.id); return s; });
      toast({ title: status === 'resolved' ? 'Report resolved' : 'Report dismissed' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Failed to update report.' });
    } finally {
      setBusyReportId(null);
    }
  };

  const suspendAuthor = async (report: AdminReport) => {
    const userId = report.target?.userId;
    if (!userId) return;
    setBusyReportId(report.id);
    const { error } = await (supabase as any).from('user_bans').insert({
      user_id: userId,
      banned_by: currentUser?.id,
      reason: `Reported content: ${report.reason}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!error) {
      await writeAudit('suspend_user', 'user', userId, { reason: report.reason, via: 'report' });
      await setReportStatus(report, 'resolved');
    } else {
      setBusyReportId(null);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleAction = async (report: AdminReport, action: ReportAction) => {
    setBusyReportId(report.id);
    const targetType = report.target_type;
    const targetId = report.target_id;
    try {
      if (action === 'delete' && DELETEABLE_TYPES.includes(targetType)) {
        const res = await deleteContent(targetType, targetId);
        if (res.error) throw new Error(res.error);
      } else if (action === 'hide' && HIDEABLE_TYPES.includes(targetType)) {
        const res = await toggleHidden(targetType, targetId, true);
        if (res.error) throw new Error(res.error);
      } else if (action === 'suspend') {
        await suspendAuthor(report);
        return;
      }
      await setReportStatus(report, action === 'dismiss' ? 'dismissed' : 'resolved');
      setInvestigating(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: error?.message || 'Something went wrong.' });
    } finally {
      setBusyReportId(null);
    }
  };

  const bulkClear = async () => {
    if (!selected.size) return;
    setBusy(true);
    const targets = reports.filter(r => selected.has(r.id));
    for (const report of targets) {
      await (supabase as any).rpc('update_report_status', { report_id: report.id, new_status: 'dismissed' });
      await writeAudit('dismiss_report', 'report', report.id, { bulk: true });
    }
    setReports(prev => prev.filter(r => !selected.has(r.id)));
    setSelected(new Set());
    setBusy(false);
    toast({ title: 'Cleared', description: `${targets.length} report(s) dismissed.` });
  };

  const bulkHide = async () => {
    if (!selected.size) return;
    setBusy(true);
    const targets = reports.filter(r => selected.has(r.id) && HIDEABLE_TYPES.includes(r.target_type));
    for (const report of targets) {
      await toggleHidden(report.target_type, report.target_id, true);
      await setReportStatus(report, 'resolved');
    }
    setBusy(false);
    toast({ title: 'Hidden', description: `${targets.length} item(s) hidden from feeds.` });
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    setBusy(true);
    const targets = reports.filter(r => selected.has(r.id) && DELETEABLE_TYPES.includes(r.target_type));
    for (const report of targets) {
      await deleteContent(report.target_type, report.target_id);
      await setReportStatus(report, 'resolved');
    }
    setBusy(false);
    toast({ title: 'Deleted', description: `${targets.length} item(s) permanently removed.` });
  };

  const selectedCount = selected.size;

  return (
    <AdminSection
      icon={Flag}
      title="Content Reports"
      eyebrow="Moderation"
      description="Investigate reports and take bulk moderation action"
      actions={
        <Button variant="outline" size="sm" onClick={() => { setSelected(new Set()); load(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      }
    >
        {loading ? (
          <div className="py-14 text-center"><Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-success" />
            </div>
            <p className="font-bold text-lg mb-1">All caught up</p>
            <p className="text-sm text-muted-foreground">No open reports right now.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button variant="ghost" size="sm" disabled={!selectedCount}
                onClick={() => setSelected(selectedCount === reports.length ? new Set() : new Set(reports.map(r => r.id)))}>
                {selectedCount === reports.length ? 'Deselect all' : 'Select all'}
              </Button>
              <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
              {selectedCount > 0 && (
                <>
                  <Separator orientation="vertical" className="h-5" />
                  <Button variant="outline" size="sm" onClick={bulkClear} disabled={busy}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5 text-success" /> Clear
                  </Button>
                  <Button variant="outline" size="sm" onClick={bulkHide} disabled={busy}>
                    <EyeOff className="w-4 h-4 mr-1.5" /> Hide
                  </Button>
                  <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={busy}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="rounded-xl border border-border/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={selected.has(report.id)}
                        onCheckedChange={(checked) => {
                          setSelected(prev => {
                            const s = new Set(prev);
                            if (checked) s.add(report.id); else s.delete(report.id);
                            return s;
                          });
                        }}
                        aria-label={`Select report for ${report.reason}`}
                      />
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={report.reporter?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {(report.reporter?.display_name || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          Reported by {report.reporter?.display_name || 'Unknown'}
                          <span className="text-muted-foreground"> @{report.reporter?.username || 'unknown'}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.target_type} · {new Date(report.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={report.status === 'open' ? 'destructive' : 'secondary'}>{report.status}</Badge>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                      <ShieldAlert className="w-3 h-3 inline mr-1" />
                      {report.reason}
                    </p>
                    {report.details && <p className="text-muted-foreground text-sm mt-1">{report.details}</p>}
                    {report.target && (
                      <p className="mt-2 text-foreground/80 border-t border-border/40 pt-2 line-clamp-3">
                        <span className="font-semibold">{report.target.type}: </span>
                        {report.target.preview || <span className="italic text-muted-foreground">(no preview)</span>}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => setInvestigating(report)}
                      disabled={busyReportId === report.id}
                    >
                      <SearchCheck className="w-4 h-4 mr-1.5" />
                      Investigate
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setReportStatus(report, 'resolved')}
                      disabled={busyReportId === report.id}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5 text-success" /> Resolve
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setReportStatus(report, 'dismissed')}
                      disabled={busyReportId === report.id}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" /> Dismiss
                    </Button>
                    {busyReportId === report.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      <ReportInvestigationDialog
        report={investigating}
        open={!!investigating}
        onOpenChange={(open) => !open && setInvestigating(null)}
        processing={busyReportId !== null}
        onAction={handleAction}
      />
    </AdminSection>
  );
}
