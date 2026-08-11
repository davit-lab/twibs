import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Search, Loader2, Trash2, Eye, EyeOff, BookOpen } from 'lucide-react';
import { AdminBook } from './types';
import PaginationBar from './PaginationBar';
import AdminSection from './AdminSection';

const PAGE_SIZE = 20;

export default function AdminBooksTab() {
  const { toggleHidden, deleteContent } = useAdminActions();
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminBook | null>(null);

  const load = useCallback(async (term: string, currentPage: number) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('books')
        .select('id, title, status, hidden, created_at, author_id', { count: 'exact' });
      if (term.trim()) {
        query = query.ilike('title', `%${term.trim()}%`);
      }
      const from = currentPage * PAGE_SIZE;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data || []) as AdminBook[];
      const ids = [...new Set(rows.map(r => r.author_id))];
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('user_id, display_name, username').in('user_id', ids);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setBooks(rows.map(r => ({ ...r, author: pmap.get(r.author_id) || { display_name: 'Unknown', username: 'unknown' } })));
      setTotal(count ?? 0);
    } catch (error) {
      console.error('Error loading books:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load books.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, page); }, [search, page, load]);

  const hide = async (book: AdminBook) => {
    setBusyId(book.id);
    const res = await toggleHidden('book', book.id, !book.hidden);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, hidden: !b.hidden } : b));
    toast({ title: book.hidden ? 'Book unhidden' : 'Book hidden' });
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await deleteContent('book', deleteTarget.id);
    setBusyId(null);
    if (res.error) { toast({ variant: 'destructive', title: 'Failed', description: res.error }); return; }
    setBooks(prev => prev.filter(b => b.id !== deleteTarget.id));
    setTotal(t => Math.max(0, t - 1));
    setDeleteTarget(null);
    toast({ title: 'Book deleted' });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminSection
      icon={BookOpen}
      title="Book Management"
      eyebrow="Content"
      description="Review, hide and remove published books"
      actions={
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search titles..."
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
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : books.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No books found.</TableCell></TableRow>
              ) : books.map((book) => (
                <TableRow key={book.id} className={book.hidden ? 'opacity-60' : ''}>
                  <TableCell className="font-medium max-w-[220px]">
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{book.title}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{book.author.display_name}</p>
                    <p className="text-sm text-muted-foreground">@{book.author.username}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <Badge variant={book.status === 'published' ? 'default' : 'secondary'}>{book.status}</Badge>
                      {book.hidden && <Badge variant="secondary" className="bg-destructive/10 text-destructive">Hidden</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(book.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => hide(book)} disabled={busyId === book.id} title={book.hidden ? 'Unhide' : 'Hide'}>
                        {busyId === book.id ? <Loader2 className="w-4 h-4 animate-spin" /> : book.hidden ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(book)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={total} label="books" onPageChange={setPage} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="admin-scope">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete this book?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the book and its chapters. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              Delete book
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminSection>
  );
}
