import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Lock, RefreshCw } from 'lucide-react';
import { useAdminAudit, getActionLabel } from '@/hooks/useAdminAudit';
import PaginationBar from './PaginationBar';
import AdminSection from './AdminSection';

const ACTION_COLORS: Record<string, string> = {
  delete_user: 'bg-destructive/15 text-destructive',
  purge_all_users: 'bg-destructive/15 text-destructive',
  delete_content: 'bg-destructive/15 text-destructive',
  hide_content: 'bg-warning/15 text-warning',
};

function initials(name: string) {
  return (name || '?').slice(0, 2).toUpperCase();
}


export default function AdminAuditTab() {
  const { entries, loading, total, page, setPage, search, setSearch, refetch, pageSize } = useAdminAudit();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminSection
      icon={Lock}
      title="Admin Audit Log"
      eyebrow="Security"
      description="Immutable record of every administrative action. Entries can never be edited or deleted."
      actions={
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search action, actor, target..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="admin-search"
            />
          </div>
          <Button variant="outline" size="icon" onClick={refetch} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      }
    >
        <ScrollArea className="max-h-[60vh]">
          <Table className="admin-table">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No audit entries found.</TableCell></TableRow>
              ) : entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={undefined} />
                        <AvatarFallback className="text-[10px]">{initials(entry.actor_email || entry.actor_id || '?')}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground max-w-[160px] truncate">
                        {entry.actor_email || entry.actor_id?.slice(0, 8) || 'system'}
                      </span>
                    </div>
                    
                  </TableCell>
                  <TableCell>
                    <Badge className={ACTION_COLORS[entry.action] || 'bg-muted text-muted-foreground'}>
                      {getActionLabel(entry.action)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.target_type ? (
                      <>
                        <span className="text-foreground/80">{entry.target_type}</span>
                        <span className="text-xs"> · {entry.target_id?.slice(0, 8)}</span>
                      </>
                    ) : <span className="text-xs">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {entry.details ? (
                      <code className="text-xs text-muted-foreground block truncate">
                        {JSON.stringify(entry.details)}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        <PaginationBar page={page} totalPages={totalPages} total={total} label="entries" onPageChange={setPage} />
    </AdminSection>
  );
}
