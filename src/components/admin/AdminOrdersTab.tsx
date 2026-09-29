import { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/lib/ads';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminSection from './AdminSection';

const STATUSES = ['pending','paid','processing','ready','shipped','completed','cancelled','refunded'] as const;
interface OrderRow { id: string; order_number: string; business_id: string; business_name: string; customer_id: string; customer_name: string | null; customer_username: string | null; status: string; payment_status: string; fulfillment: string; total_cents: number; currency: string; created_at: string; updated_at: string; }

export default function AdminOrdersTab() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('admin_list_orders', { p_status: filter, p_search: search.trim() || null, p_limit: 200 });
    if (error) toast({ variant: 'destructive', title: 'Could not load orders', description: error.message }); else setRows((data || []) as OrderRow[]);
    setLoading(false);
  }, [filter, search]);
  useEffect(() => { void load(); }, [load]);

  const update = async (row: OrderRow, next: string) => {
    setBusy(row.id);
    const { error } = await (supabase as any).rpc('admin_set_order_status', { p_order_id: row.id, p_status: next, p_note: notes[row.id]?.trim() || null });
    setBusy(null);
    if (error) toast({ variant: 'destructive', title: 'Could not update order', description: error.message }); else { toast({ title: 'Order updated', description: `${row.order_number} is now ${next}.` }); void load(); }
  };

  return <AdminSection icon={PackageCheck} title="Orders & disputes" eyebrow="Commerce operations" description="Find any order and correct its operational status with an audit note" actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}>
    <div className="mb-5 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number, customer or business" className="pl-9" /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All orders</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    {loading ? <Loader2 className="mx-auto my-14 h-7 w-7 animate-spin text-primary" /> : rows.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No orders match these filters.</p> : <div className="divide-y divide-border">{rows.map((row) => <article key={row.id} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.order_number}</h3><Badge variant="outline">{row.status}</Badge><Badge variant={row.payment_status === 'failed' ? 'destructive' : 'secondary'}>{row.payment_status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{row.business_name} · {row.customer_name || row.customer_username || 'Unknown customer'} · {new Date(row.created_at).toLocaleString()}</p></div><p className="font-bold">{formatMoney(row.total_cents, row.currency.toUpperCase())}</p></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><Input value={notes[row.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))} placeholder="Internal audit note (optional)" className="h-9" /><Select defaultValue={row.status} onValueChange={(value) => setRows((all) => all.map((item) => item.id === row.id ? { ...item, status: value } : item))}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={busy === row.id} onClick={() => void update(row, row.status)}>{busy === row.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save status</Button></div>
    </article>)}</div>}
  </AdminSection>;
}

