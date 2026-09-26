import { useState } from 'react';
import { useBusinessBilling, useCreditBusinessBalance } from '@/hooks/useBusinessData';
import { useBusiness } from '@/contexts/BusinessContext';
import { MetricCard, EmptyState } from '@/components/business/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/lib/ads';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Loader2, Info } from 'lucide-react';

const PRESETS = [5, 25, 100];

export function BillingTab({ businessId }: { businessId: string }) {
  const { data: billing, isLoading, isError } = useBusinessBilling(businessId);
  const credit = useCreditBusinessBalance(businessId);
  const { isOwner } = useBusiness();
  const { toast } = useToast();
  const [amount, setAmount] = useState('25');

  if (isLoading)
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  if (isError || !billing)
    return <EmptyState title="Could not load billing" description="Something went wrong while fetching your wallet." />;

  const cents = Math.max(0, Math.round(parseFloat(amount) * 100 || 0));

  const fund = async () => {
    if (!cents) return;
    try {
      await credit.mutateAsync(cents);
      toast({ title: 'Test funds added', description: `${formatMoney(cents)} added to your wallet.` });
      setAmount('25');
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not add funds',
        description: err instanceof Error ? err.message : 'Something went wrong.',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-primary/25 bg-primary/5">
          <CardContent className="p-5">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              Balance
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{formatMoney(billing.balance_cents, billing.currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Test wallet · no real money</p>
          </CardContent>
        </Card>
        <MetricCard label="Total credited" value={formatMoney(billing.total_credited_cents)} />
        <MetricCard label="Total spent" value={formatMoney(billing.total_spent_cents)} />
      </div>

      {isOwner && (
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Twibs is in test mode. These are <strong>test funds</strong> — they let you run promotions without real
                payments and are clearly listed as test in your ledger.
              </span>
            </div>
            <Label htmlFor="fund-wallet">Add test funds (USD)</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="fund-wallet"
                  type="number"
                  min={1}
                  step="1"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button onClick={fund} disabled={!cents || credit.isPending} className="gap-1.5">
                {credit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownCircle className="h-4 w-4" />}
                Add funds
              </Button>
              <div className="flex gap-1.5">
                {PRESETS.map((p) => (
                  <Button key={p} size="sm" variant="outline" onClick={() => setAmount(String(p))}>
                    ${p}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-2xl border border-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Transaction history</p>
        </div>
        {billing.transactions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {billing.transactions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={
                    t.kind === 'credit'
                      ? 'text-emerald-600'
                      : t.kind === 'refund'
                      ? 'text-sky-600'
                      : 'text-muted-foreground'
                  }
                >
                  {t.kind === 'credit' ? (
                    <ArrowDownCircle className="h-4 w-4" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description || t.kind}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()} · {t.kind}
                  </p>
                </div>
                <span
                  className={
                    t.kind === 'credit'
                      ? 'text-sm font-semibold tabular-nums text-emerald-600'
                      : t.kind === 'refund'
                      ? 'text-sm font-semibold tabular-nums text-sky-600'
                      : 'text-sm font-medium tabular-nums text-muted-foreground'
                  }
                >
                  {t.kind === 'credit' ? '+' : ''}
                  {formatMoney(t.amount_cents, t.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}