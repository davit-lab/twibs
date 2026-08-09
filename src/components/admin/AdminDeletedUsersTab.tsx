import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Loader2, Archive, Trash2, Clock, Mail, AlertTriangle } from 'lucide-react';

interface Deletion {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  reason: string | null;
  deleted_by: string | null;
  deleted_at: string;
  purge_due_at: string;
  purged_at: string | null;
}

export default function AdminDeletedUsersTab() {
  const { isAdmin } = useAuth();
  const { getDeletions, exportUserData, purgeUserData, purgeExpiredDeletions } = useAdminActions();

  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Deletion | null>(null);
  const [purgeAllLoading, setPurgeAllLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await getDeletions();
    setDeletions(rows as Deletion[]);
    setLoading(false);
  }, [getDeletions]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadZip = async (row: Deletion) => {
    setBusyId(row.user_id);
    const { error, blob } = await exportUserData(row.user_id);
    setBusyId(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Export failed', description: error });
      return;
    }
    const url = URL.createObjectURL(blob!);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deleted-user-${row.email || row.user_id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Export ready', description: 'The ZIP was downloaded. Email it to the user or support.' });
  };

  const confirmPurge = async () => {
    if (!purgeTarget) return;
    setBusyId(purgeTarget.user_id);
    const { error } = await purgeUserData(purgeTarget.user_id);
    setBusyId(null);
    setPurgeTarget(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Purge failed', description: error });
      return;
    }
    setDeletions(prev => prev.filter(d => d.user_id !== purgeTarget.user_id));
    toast({ title: 'Purged', description: 'The account and all associated data were permanently deleted.' });
  };

  const purgeAllExpired = async () => {
    setPurgeAllLoading(true);
    const { error } = await purgeExpiredDeletions();
    setPurgeAllLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error });
      return;
    }
    await load();
    toast({ title: 'Purge complete', description: 'All deletions past their retention window were removed.' });
  };

  const remaining = (purgeDueAt: string, purgedAt: string | null): string => {
    if (purgedAt) return 'Purged';
    const due = new Date(purgeDueAt).getTime();
    const ms = due - Date.now();
    if (ms <= 0) return 'Ready to purge';
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return days > 0 ? `${days}d ${hours}h left` : `${Math.max(1, Math.floor(ms / 3600000))}h left`;
  };

  const expired = (row: Deletion) => !row.purged_at && new Date(row.purge_due_at).getTime() <= Date.now();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div>
            <CardTitle>Deleted Accounts</CardTitle>
            <CardDescription>
              Accounts deleted by users or staff. Data is retained 7 days so support can export it as a ZIP before permanent purge.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="lg:ml-auto gap-2"
            onClick={purgeAllExpired}
            disabled={purgeAllLoading || loading}
          >
            {purgeAllLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Purge expired
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : deletions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No deleted accounts.
                  </TableCell>
                </TableRow>
              ) : deletions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </div>
                      <div>
                        <p className="font-medium flex items-center gap-1.5">
                          {row.display_name || 'Deleted User'}
                          {row.purged_at && <Badge variant="outline" className="text-xs">Purged</Badge>}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {row.email || 'no email'}
                          {row.username && <span>· @{row.username}</span>}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(row.deleted_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={expired(row) ? 'destructive' : 'secondary'}>
                      {remaining(row.purge_due_at, row.purged_at)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {row.reason || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={busyId === row.user_id}
                        onClick={() => downloadZip(row)}
                      >
                        {busyId === row.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                        Export ZIP
                      </Button>
                      {isAdmin && !row.purged_at && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId === row.user_id}
                          onClick={() => setPurgeTarget(row)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Purge
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Permanently purge {purgeTarget?.email}
            </DialogTitle>
            <DialogDescription>
              This immediately deletes the account and ALL content (posts, reels, comments, messages, books).
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={busyId !== null}>Cancel</Button>
            <Button variant="destructive" onClick={confirmPurge} disabled={busyId !== null}>
              {busyId === purgeTarget?.user_id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Purge everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
