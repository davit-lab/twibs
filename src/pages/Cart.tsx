import { CheckoutPanel } from '@/components/marketplace/CheckoutPanel';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Minus, Plus, ShieldCheck, ShoppingBag, Store, Trash2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCartQuote,
  useRemoveFromCart,
  useUpdateCartQuantity,
} from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/ads';
import { FULFILLMENT_LABELS, type CartLine } from '@/lib/marketplace';

export default function Cart() {
  const { identity } = useActiveIdentity();
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, error } = useCartQuote(!!user && identity.type === 'personal');
  const updateQuantity = useUpdateCartQuantity();
  const removeLine = useRemoveFromCart();
  const { toast } = useToast();
  const [fulfilment, setFulfilment] = useState<'shipping' | 'pickup'>('shipping');

  // Grouped by seller because that is how the server will split the order, and
  // because two sellers means two separate deliveries.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; lines: CartLine[] }>();
    for (const line of data ?? []) {
      const entry = map.get(line.business_id) ?? { name: line.business_name, lines: [] };
      entry.lines.push(line);
      map.set(line.business_id, entry);
    }
    return Array.from(map.entries());
  }, [data]);

  const unavailable = (data ?? []).filter((l) => !l.is_available);
  const available = (data ?? []).filter((l) => l.is_available);

  // Summed from the server's own line totals rather than recomputed from a local
  // price list, so the displayed figure is the one checkout will use.
  const subtotal = available.reduce((sum, l) => sum + l.line_total_cents, 0);

  // A pickup-only product cannot be delivered, and vice versa, so the choice is
  // only offered when the whole cart agrees on it.
  const fulfilmentOptions = useMemo(() => {
    if (available.length === 0) return ['shipping', 'pickup'] as const;
    const canShip = available.every((l) => l.fulfillment === 'shipping' || l.fulfillment === 'both');
    const canCollect = available.every((l) => l.fulfillment === 'pickup' || l.fulfillment === 'both');
    return [canShip ? 'shipping' : null, canCollect ? 'pickup' : null].filter(Boolean) as ('shipping' | 'pickup')[];
  }, [available]);

  if (identity.type === 'business') return <MainLayout><div className="mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-bold">Shopping uses your personal account</h1><p className="mt-3 text-sm text-muted-foreground">Switch to Personal to view your cart and make purchases.</p><Button asChild className="mt-4"><Link to="/b?tab=orders">Manage business orders</Link></Button></div></MainLayout>;
  if (authLoading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-4xl px-4 py-6">
          <Skeleton className="h-8 w-40" />
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-bold">Sign in to see your cart</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Your cart is tied to your account so it follows you between devices.
          </p>
          <Button className="mt-5" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-black tracking-tight">Your cart</h1>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Could not load your cart: {(error as Error).message}
          </p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-bold">Your cart is empty</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Find something from a business on Twibs.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/marketplace">Browse the marketplace</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <div className="space-y-5">
              {unavailable.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    {unavailable.length} item{unavailable.length > 1 ? 's' : ''} can no longer be bought
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {unavailable.map((l) => (
                      <li key={l.line_id}>
                        {l.product_name}
                        {l.variant_label ? ` (${l.variant_label})` : ''} — {l.unavailable_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {groups.map(([businessId, group]) => {
                const groupUnavailable = group.lines.some((l) => !l.is_available);
                return (
                  <section key={businessId} className="rounded-xl border border-border">
                    <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                      <Store className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <h2 className="text-sm font-bold">{group.name}</h2>
                    </header>
                    <ul>
                      {group.lines.map((line) => (
                        <CartRow
                          key={line.line_id}
                          line={line}
                          disabled={groupUnavailable}
                          busy={updateQuantity.isPending || removeLine.isPending}
                          onQuantity={(q) => {
                            updateQuantity.mutate(
                              { lineId: line.line_id, quantity: q },
                              {
                                onError: (e) =>
                                  toast({ title: 'Could not update', description: e.message }),
                              }
                            );
                          }}
                          onRemove={() => {
                            removeLine.mutate(line.line_id, {
                              onError: (e) => toast({ title: 'Could not remove', description: e.message }),
                            });
                          }}
                        />
                      ))}
                    </ul>
                    <CheckoutPanel businessId={businessId} lines={group.lines} />
                  </section>
                );
              })}
            </div>

            <aside className="h-fit rounded-xl border border-border p-4 lg:sticky lg:top-20">
              <h2 className="text-sm font-bold">Summary</h2>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-muted-foreground">at checkout</span>
                </div>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Your total is confirmed when you place the order, straight from the seller's
                current prices. Free-delivery thresholds are applied per seller.
              </p>

              {fulfilmentOptions.length > 0 && available.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="fulfilment" className="text-xs font-bold">
                    How would you like this order?
                  </Label>
                  <Select value={fulfilment} onValueChange={(v) => setFulfilment(v as 'shipping' | 'pickup')}>
                    <SelectTrigger id="fulfilment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fulfilmentOptions.includes('shipping') && (
                        <SelectItem value="shipping">Delivery</SelectItem>
                      )}
                      {fulfilmentOptions.includes('pickup') && (
                        <SelectItem value="pickup">Collection</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button asChild variant="outline" className="mt-4 w-full"><Link to="/orders">My orders</Link></Button>

              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Prices and stock are re-checked on the server when you check out.
              </p>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function CartRow({
  line,
  onQuantity,
  onRemove,
  busy,
  disabled,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const max = line.available_quantity ?? 10;
  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0',
        !line.is_available && 'opacity-60'
      )}
    >
      <Link
        to={`/marketplace/product/${line.product_id}`}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {line.image_url && (
          <img src={line.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to={`/marketplace/product/${line.product_id}`}
          className="line-clamp-1 text-sm font-semibold hover:underline"
        >
          {line.product_name}
        </Link>
        {line.variant_label && (
          <p className="text-xs text-muted-foreground">{line.variant_label}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {line.is_available ? FULFILLMENT_LABELS[line.fulfillment] : line.unavailable_reason}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center rounded-md border border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Decrease quantity of ${line.product_name}`}
            disabled={busy || !line.is_available || line.quantity <= 1}
            onClick={() => onQuantity(line.quantity - 1)}
          >
            <Minus className="h-3 w-3" aria-hidden />
          </Button>
          <span className="w-7 text-center text-xs font-bold tabular-nums">{line.quantity}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Increase quantity of ${line.product_name}`}
            disabled={busy || !line.is_available || line.quantity >= max}
            onClick={() => onQuantity(line.quantity + 1)}
          >
            <Plus className="h-3 w-3" aria-hidden />
          </Button>
        </div>

        <span className="w-20 text-right text-sm font-bold tabular-nums">
          {formatMoney(line.line_total_cents)}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${line.product_name} from cart`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
