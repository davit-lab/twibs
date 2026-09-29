import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { commerceAction } from '@/hooks/useCommerce';
import { useAuth } from '@/contexts/AuthContext';
import { formatMoney } from '@/lib/ads';
import type { CartLine } from '@/lib/marketplace';
import { toast } from 'sonner';
type Quote = { subtotal: number; shipping: number; total: number; currency: string; ready: boolean; valid: boolean };
export function CheckoutPanel({ businessId, lines }: { businessId: string; lines: CartLine[] }) {
  const { user } = useAuth(); const navigate = useNavigate();
  const options = (['shipping','pickup'] as const).filter(method => lines.every(line => line.fulfillment === method || line.fulfillment === 'both'));
  const [choice, setChoice] = useState<'shipping' | 'pickup'>(options[0] ?? 'shipping');
  const method = options.includes(choice) ? choice : options[0];
  const [address, setAddress] = useState({ name: '', line1: '', city: '', postal_code: '', country: '' });
  const [busy, setBusy] = useState(false); const [requestId] = useState(() => crypto.randomUUID());
  const { data: quote, error, refetch } = useQuery({ queryKey: ['checkout-quote',user?.id,businessId,method,lines], enabled: !!method, queryFn: async () => { const { data,error } = await supabase.rpc('get_business_checkout_quote', { p_business_id: businessId, p_fulfillment: method! }); if(error) throw error; return data as unknown as Quote; } });
  async function checkout() { setBusy(true); try { const data = await commerceAction({ action: 'checkout',businessId,requestId,fulfillment:method,address:method === 'shipping' ? address : null }); window.location.assign(data.url); } catch(e) { toast.error((e as Error).message, { action: { label: 'My orders', onClick: () => navigate('/orders') } }); void refetch(); } finally { setBusy(false); } }
  return <div className="space-y-3 border-t p-4"><div className="flex items-center justify-between"><Label htmlFor={`method-${businessId}`}>Fulfillment</Label><select id={`method-${businessId}`} className="rounded border bg-background p-2 text-sm" value={method || ''} onChange={e => setChoice(e.target.value as typeof choice)}>{options.map(value => <option key={value} value={value}>{value === 'shipping' ? 'Delivery' : 'Pickup'}</option>)}</select></div>{!options.length && <p className="text-sm text-destructive">These items require different fulfillment methods. Check out compatible items together.</p>}{method === 'shipping' && <div className="grid gap-3 sm:grid-cols-2">{Object.keys(address).map(key => <div key={key}><Label htmlFor={`${businessId}-${key}`}>{({ name:'Recipient', line1:'Street address', city:'City', postal_code:'Postal code', country:'Country' })[key]}</Label><Input id={`${businessId}-${key}`} value={address[key as keyof typeof address]} onChange={e => setAddress(current => ({ ...current,[key]: e.target.value }))} /></div>)}</div>}{error ? <button className="text-sm text-destructive" onClick={() => void refetch()}>Could not quote this order. Retry</button> : quote ? <><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{formatMoney(quote.subtotal,quote.currency)}</dd><dt>Delivery</dt><dd className="text-right">{formatMoney(quote.shipping,quote.currency)}</dd><dt>Tax / additional fees</dt><dd className="text-right">{formatMoney(0,quote.currency)}</dd><dt className="font-semibold">Total</dt><dd className="text-right font-bold">{formatMoney(quote.total,quote.currency)}</dd></dl>{!quote.ready && <p className="text-xs text-muted-foreground">This business has not completed payment setup.</p>}<Button className="w-full" disabled={busy || !quote.ready || !quote.valid || !method || (method === 'shipping' && Object.values(address).some(value => !value.trim()))} onClick={() => void checkout()}>{busy ? 'Opening secure checkout…' : 'Pay this business with Stripe'}</Button><p className="text-[11px] text-muted-foreground">Each business is paid separately. Prices and inventory are checked again before payment. Pending payments can be resumed in My orders.</p></> : method && <p className="text-sm" role="status">Calculating total…</p>}</div>;
}
