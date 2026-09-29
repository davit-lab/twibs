import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ImageOff, Loader2, RefreshCw, ShoppingBag, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { formatMoney } from '@/lib/ads';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminSection from './AdminSection';

type ProductStatusFilter = 'pending_review' | 'approved' | 'rejected' | 'removed' | 'all';
interface ModerationProduct {
  product_id: string;
  business_id: string;
  business_name: string;
  business_username: string;
  product_name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  status: string;
  moderation_note: string | null;
  image_url: string | null;
  submitted_at: string;
}

const labels: Record<ProductStatusFilter, string> = {
  pending_review: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
  removed: 'Removed',
  all: 'All products',
};

export default function AdminMarketplaceTab() {
  const { writeAudit } = useAdminActions();
  const [filter, setFilter] = useState<ProductStatusFilter>('pending_review');
  const [products, setProducts] = useState<ModerationProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('admin_list_marketplace_products', {
      p_status: filter,
      p_limit: 100,
    });
    if (error) toast({ variant: 'destructive', title: 'Could not load products', description: error.message });
    else setProducts((data ?? []) as ModerationProduct[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const moderate = async (product: ModerationProduct, action: 'approve' | 'reject' | 'remove') => {
    const note = notes[product.product_id]?.trim() || null;
    if (action !== 'approve' && !note) {
      toast({ variant: 'destructive', title: 'Add a reason', description: 'The seller needs to know what must change.' });
      return;
    }
    setBusyId(product.product_id);
    try {
      const { error } = await (supabase as any).rpc('admin_moderate_product', {
        p_product_id: product.product_id,
        p_action: action,
        p_reason: note,
      });
      if (error) throw error;
      await writeAudit(`marketplace_product_${action}`, 'product', product.product_id, {
        product: product.product_name,
        business_id: product.business_id,
        reason: note,
      });
      toast({ title: action === 'approve' ? 'Product approved' : action === 'reject' ? 'Product rejected' : 'Product removed' });
      setNotes((current) => ({ ...current, [product.product_id]: '' }));
      await load();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Moderation failed', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminSection
      icon={ShoppingBag}
      title="Marketplace Products"
      eyebrow="Commerce moderation"
      description="Review submitted listings before they become publicly discoverable"
      actions={<div className="flex items-center gap-2"><Select value={filter} onValueChange={(value) => setFilter(value as ProductStatusFilter)}><SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>}
    >
      {loading ? <div className="py-14 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div> : products.length === 0 ? <div className="py-14 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No products match this filter</p></div> : <div className="divide-y divide-border">{products.map((product) => {
        const pending = product.status === 'pending_review';
        return <article key={product.product_id} className="grid gap-4 py-5 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <div className="aspect-[4/5] overflow-hidden rounded-md bg-muted">{product.image_url ? <img src={product.image_url} alt={product.product_name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><ImageOff className="h-6 w-6 text-muted-foreground" /></span>}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{product.product_name}</h3><Badge variant="outline">{product.status.replace('_', ' ')}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{product.business_name} · @{product.business_username} · {new Date(product.submitted_at).toLocaleString()}</p></div><p className="font-bold">{formatMoney(product.price_cents, product.currency.toUpperCase())}</p></div>{product.description && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{product.description}</p>}{product.moderation_note && !pending && <p className="mt-3 text-sm text-destructive">{product.moderation_note}</p>}{pending && <><label className="mt-4 block text-xs font-semibold" htmlFor={`note-${product.product_id}`}>Moderation note or rejection reason</label><textarea id={`note-${product.product_id}`} value={notes[product.product_id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [product.product_id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" maxLength={1000} placeholder="Required when rejecting" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busyId === product.product_id} onClick={() => void moderate(product, 'approve')}><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve product</Button><Button size="sm" variant="destructive" disabled={busyId === product.product_id} onClick={() => void moderate(product, 'reject')}><XCircle className="mr-1.5 h-4 w-4" />Reject</Button>{busyId === product.product_id && <Loader2 className="h-4 w-4 animate-spin self-center" />}</div></>}</div>
        </article>;
      })}</div>}
    </AdminSection>
  );
}
