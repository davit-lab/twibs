import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Search, Loader2, Trash2, Eye, EyeOff, Play, Heart, MessageSquare, Clapperboard } from 'lucide-react';
import { AdminReel } from './types';
import PaginationBar from './PaginationBar';
import AdminSection from './AdminSection';

const PAGE_SIZE = 20;

export default function AdminReelsTab() {
  const { toggleHidden, deleteContent } = useAdminActions();
  const [reels, setReels] = useState<AdminReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReel | null>(null);

  const load = useCallback(async (term: string, currentPage: number) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('reels')
        .select('id, caption, view_count, like_count, comment_count, hidden, created_at, user_id, video_url', { count: 'exact' });
      if (term.trim()) {
        query = query.ilike('caption', `%${term.trim()}%`);
      }
      const from = currentPage * PAGE_SIZE;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data || []) as AdminReel[];
      const ids = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('user_id, display_name, username').in('user_id', ids);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setReels(rows.map(r => ({ ...r, user: pmap.get(r.user_id) || { display_name: 'Unknown', username: 'unknown' } })));
      setTotal(count ?? 0);
    } catch (error) {
      console.error('Error loading reels:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load reels.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, page); }, [search, page, load]);

  const hide = async (reel: AdminReel) => {
    setBusyId(reel.id);
    const res = await toggleHidden('reel', reel.id, !reel.hidden);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setReels(prev => prev.map(r => r.id === reel.id ? { ...r, hidden: !r.hidden } : r));
    toast({ title: reel.hidden ? 'Reel unhidden' : 'Reel hidden' });
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await deleteContent('reel', deleteTarget.id);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setReels(prev => prev.filter(r => r.id !== deleteTarget.id));
    setTotal(t => Math.max(0, t - 1));
    setDeleteTarget(null);
    toast({ title: 'Reel deleted' });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminSection
      icon={Clapperboard}
      title="Reels Management"
      eyebrow="Content"
      description="Review, hide and remove short videos"
      actions={
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search captions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="admin-search"
          />
        </div>
      }
    >
        <div className="overflow-x-auto">
          <Table className="admin-table">
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Caption</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stats</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : reels.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No reels found.</TableCell></TableRow>
              ) : reels.map((reel) => (
                <TableRow key={reel.id} className={reel.hidden ? 'opacity-60' : ''}>
                  <TableCell>
                    <p className="font-medium">{reel.user.display_name}</p>
                    <p className="text-sm text-muted-foreground">@{reel.user.username}</p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {reel.caption ? <p className="truncate">{reel.caption}</p> : <span className="text-muted-foreground italic">No caption</span>}
                  </TableCell>
                  <TableCell>
                    {reel.hidden
                      ? <Badge variant="secondary" className="bg-destructive/10 text-destructive">Hidden</Badge>
                      : <Badge variant="outline">Live</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Play className="h-3 w-3" />{reel.view_count}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{reel.like_count}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{reel.comment_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(reel.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => hide(reel)} disabled={busyId === reel.id} title={reel.hidden ? 'Unhide' : 'Hide'}>
                        {busyId === reel.id ? <Loader2 className="w-4 h-4 animate-spin" /> : reel.hidden ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(reel)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} label="reels" onPageChange={setPage} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="admin-scope">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete this reel?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the reel. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              Delete reel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminSection>
  );
}
