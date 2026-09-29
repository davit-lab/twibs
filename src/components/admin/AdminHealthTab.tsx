import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import AdminSection from './AdminSection';

interface HealthData { database_bytes: number; users: number; open_reports: number; active_stories: number; groups: number; businesses: number; pending_products: number; open_orders: number; failed_payments: number; checked_at: string; }
const fmt = (n: number) => new Intl.NumberFormat().format(n || 0);

export default function AdminHealthTab() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await (supabase as any).rpc('admin_platform_health');
    if (error) toast({ variant: 'destructive', title: 'Health check failed', description: error.message }); else setData(result as HealthData);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const cards = data ? [
    ['Users', data.users], ['Businesses', data.businesses], ['Groups', data.groups], ['Active stories', data.active_stories],
    ['Open reports', data.open_reports], ['Open orders', data.open_orders], ['Products awaiting review', data.pending_products], ['Failed payments', data.failed_payments],
  ] as const : [];
  return <AdminSection icon={Activity} title="Platform health" eyebrow="Operations" description="A live operational snapshot of the database and action queues" actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Run check</Button>}>
    {loading ? <Loader2 className="mx-auto my-14 h-7 w-7 animate-spin text-primary" /> : data && <>
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><div><p className="text-sm font-semibold">Database responded successfully</p><p className="text-xs text-muted-foreground">Checked {new Date(data.checked_at).toLocaleString()}</p></div><div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4" />{(data.database_bytes / 1024 / 1024).toFixed(1)} MB</div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => { const warning = label === 'Failed payments' && value > 0 || label === 'Open reports' && value > 0; return <div key={label} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">{label}</p>{warning && <AlertTriangle className="h-4 w-4 text-amber-500" />}</div><p className="mt-2 text-2xl font-bold tabular-nums">{fmt(value)}</p></div>; })}</div>
    </>}
  </AdminSection>;
}

