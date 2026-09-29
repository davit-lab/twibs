import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, RefreshCw, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminSection from './AdminSection';

interface BusinessRow {
  id: string; name: string; username: string; account_type: string; category: string | null;
  status: 'active' | 'suspended'; owner_id: string; owner_name: string | null;
  owner_username: string | null; product_count: number; order_count: number; created_at: string;
}

export default function AdminBusinessesTab() {
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('admin_list_businesses', {
      p_status: status, p_search: search.trim() || null, p_limit: 150,
    });
    if (error) toast({ variant: 'destructive', title: 'Could not load businesses', description: error.message });
    else setRows((data || []) as BusinessRow[]);
    setLoading(false);
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (row: BusinessRow) => {
    const next = row.status === 'active' ? 'suspended' : 'active';
    const reason = reasons[row.id]?.trim() || null;
    if (next === 'suspended' && !reason) {
      toast({ variant: 'destructive', title: 'Add a reason', description: 'A suspension reason is required for the audit record.' });
      return;
    }
    setBusy(row.id);
    const { error } = await (supabase as any).rpc('admin_set_business_status', {
      p_business_id: row.id, p_status: next, p_reason: reason,
    });
    setBusy(null);
    if (error) toast({ variant: 'destructive', title: 'Action failed', description: error.message });
    else {
      toast({ title: next === 'active' ? 'Business restored' : 'Business suspended' });
      setReasons((current) => ({ ...current, [row.id]: '' }));
      void load();
    }
  };

  return (
    <AdminSection icon={Building2} title="Businesses" eyebrow="Operations" description="Review business accounts, ownership and commerce activity"
      actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business or username" className="pl-9" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All businesses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select>
      </div>
      {loading ? <Loader2 className="mx-auto my-14 h-7 w-7 animate-spin text-primary" /> : rows.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No businesses match these filters.</p> : (
        <div className="divide-y divide-border">{rows.map((row) => <article key={row.id} className="py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-semibold">{row.name}</h3><Badge variant={row.status === 'active' ? 'outline' : 'destructive'}>{row.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">@{row.username} · {row.account_type} {row.category ? `· ${row.category}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">Owner: {row.owner_name || 'Unknown'} {row.owner_username ? `(@${row.owner_username})` : ''}</p></div>
            <div className="text-right text-xs text-muted-foreground"><p><strong className="text-foreground">{row.product_count}</strong> products</p><p><strong className="text-foreground">{row.order_count}</strong> orders</p></div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {row.status === 'active' && <Input value={reasons[row.id] || ''} onChange={(e) => setReasons((r) => ({ ...r, [row.id]: e.target.value }))} placeholder="Reason for suspension" className="h-9 sm:max-w-md" />}
            <Button size="sm" variant={row.status === 'active' ? 'destructive' : 'outline'} disabled={busy === row.id} onClick={() => void changeStatus(row)}>{busy === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : row.status === 'active' ? <ShieldOff className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}{row.status === 'active' ? 'Suspend business' : 'Restore business'}</Button>
          </div>
        </article>)}</div>
      )}
    </AdminSection>
  );
}

