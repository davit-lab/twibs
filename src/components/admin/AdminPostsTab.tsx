import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Search, Loader2, Trash2, Eye, EyeOff, Star, MessageSquare, FileText } from 'lucide-react';
import { AdminPost } from './types';
import PaginationBar from './PaginationBar';
import AdminSection from './AdminSection';

const PAGE_SIZE = 20;

export default function AdminPostsTab() {
  const { toggleHidden, deleteContent } = useAdminActions();
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPost | null>(null);

  const load = useCallback(async (term: string, currentPage: number) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('posts')
        .select('id, content, visibility, star_count, comment_count, hidden, created_at, user_id', { count: 'exact' });
      if (term.trim()) {
        query = query.ilike('content', `%${term.trim()}%`);
      }
      const from = currentPage * PAGE_SIZE;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data || []) as AdminPost[];
      const ids = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('user_id, display_name, username').in('user_id', ids);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setPosts(rows.map(r => ({ ...r, user: pmap.get(r.user_id) || { display_name: 'Unknown', username: 'unknown' } })));
      setTotal(count ?? 0);
    } catch (error) {
      console.error('Error loading posts:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load posts.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, page); }, [search, page, load]);

  const hide = async (post: AdminPost) => {
    setBusyId(post.id);
    const res = await toggleHidden('post', post.id, !post.hidden);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, hidden: !p.hidden } : p));
    toast({ title: post.hidden ? 'Post unhidden' : 'Post hidden', description: post.hidden ? 'Visible to everyone again.' : 'Removed from public feeds.' });
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await deleteContent('post', deleteTarget.id);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setPosts(prev => prev.filter(p => p.id !== deleteTarget.id));
    setTotal(t => Math.max(0, t - 1));
    setDeleteTarget(null);
    toast({ title: 'Post deleted', description: 'The post was permanently removed.' });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminSection
      icon={FileText}
      title="Post Management"
      eyebrow="Content"
      description="Review, hide and remove posts from the platform"
      actions={
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search post content..."
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
                <TableHead>Author</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : posts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No posts found.</TableCell></TableRow>
              ) : posts.map((post) => (
                <TableRow key={post.id} className={post.hidden ? 'opacity-60' : ''}>
                  <TableCell>
                    <p className="font-medium">{post.user.display_name}</p>
                    <p className="text-sm text-muted-foreground">@{post.user.username}</p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate">{post.content}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <Badge variant="outline">{post.visibility}</Badge>
                      {post.hidden && <Badge variant="secondary" className="bg-destructive/10 text-destructive">Hidden</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{post.star_count}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.comment_count}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(post.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => hide(post)} disabled={busyId === post.id} title={post.hidden ? 'Unhide' : 'Hide'}>
                        {busyId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : post.hidden ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(post)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} label="posts" onPageChange={setPage} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="admin-scope">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the post. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminSection>
  );
}
