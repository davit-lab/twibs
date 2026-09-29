import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Megaphone, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import { useBusinessProducts } from '@/hooks/useBusinessStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/ads';

const STEPS = ['Destination', 'Audience', 'Placement', 'Budget', 'Review'] as const;

export default function MarketplaceCampaignWizard({ initialProductId }: { initialProductId?: string | null }) {
  const navigate = useNavigate();
  const { activeBusiness, accounts, switchToBusiness } = useBusiness();
  const business = activeBusiness ?? accounts[0] ?? null;
  const { data: products = [], isLoading } = useBusinessProducts(business?.id);
  const [step, setStep] = useState(0);
  const [destination, setDestination] = useState<'product' | 'store' | 'business'>(initialProductId ? 'product' : 'store');
  const [productId, setProductId] = useState(initialProductId ?? '');
  const [message, setMessage] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const [locations, setLocations] = useState('');
  const [languages, setLanguages] = useState('');
  const [placement, setPlacement] = useState<'showcase' | 'product_grid'>('showcase');
  const [budget, setBudget] = useState('10');
  const [days, setDays] = useState('7');
  const [daily, setDaily] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const liveProducts = products.filter((product) => product.status === 'approved');
  const selectedProduct = liveProducts.find((product) => product.id === productId);
  const cents = Math.round(Number(budget) * 100);
  const duration = Number.parseInt(days, 10);
  const totalBudgetCents = daily && Number.isInteger(duration) ? cents * duration : cents;
  const validDestination = destination !== 'product' || !!selectedProduct;
  const validBudget = Number.isFinite(cents) && cents >= 500 && Number.isInteger(duration) && duration >= 1 && duration <= 90;
  const previewImage = destination === 'product' ? selectedProduct?.images[0]?.url : business?.cover_url || business?.avatar_url;
  const previewTitle = destination === 'product' ? selectedProduct?.name : business?.name;

  const canContinue = step === 0 ? validDestination : step === 3 ? validBudget : true;

  const create = async () => {
    if (!business || !validDestination || !validBudget) return;
    setSubmitting(true);
    try {
      if (!activeBusiness) switchToBusiness(business.id);
      const end = new Date(Date.now() + duration * 86_400_000);
      const marketplaceRpc = supabase.rpc.bind(supabase) as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await marketplaceRpc('create_marketplace_campaign', {
        p_advertiser_id: business.id,
        p_destination_type: destination,
        p_product_id: destination === 'product' ? productId : null,
        p_name: `Marketplace: ${previewTitle || business.name}`,
        p_description: message.trim() || null,
        p_total_budget_cents: totalBudgetCents,
        p_budget_type: daily ? 'daily' : 'total',
        p_daily_budget_cents: daily ? cents : null,
        p_start_at: new Date().toISOString(),
        p_end_at: end.toISOString(),
        p_targeting: {
          automatic,
          locations: automatic ? [] : locations.split(',').map((value) => value.trim()).filter(Boolean),
          languages: automatic ? [] : languages.split(',').map((value) => value.trim()).filter(Boolean),
          interests: [],
        },
        p_marketplace_placement: placement,
      });
      if (error) throw error;
      const campaignId = data && typeof data === 'object' && 'id' in data && typeof data.id === 'string'
        ? data.id
        : null;
      if (!campaignId) throw new Error('Campaign was not created');
      const { error: submitError } = await supabase.rpc('submit_campaign', { p_campaign_id: campaignId });
      if (submitError) throw submitError;
      toast.success('Promotion submitted', { description: 'Payment and review status are shown in Advertising.' });
      navigate(`/ads/campaigns/${campaignId}`);
    } catch (error) {
      toast.error('Could not create promotion', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!business) {
    return <div className="border border-dashed border-border px-6 py-12 text-center"><Store className="mx-auto h-7 w-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">A Business account is required</h2><Button className="mt-4" onClick={() => navigate('/business/create')}>Create business</Button></div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Marketplace promotion</p>
        <h1 className="mt-1 text-2xl font-bold">Promote with {business.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Uses Twibs campaign review, funding and analytics.</p>
      </div>

      <ol className="flex gap-5 overflow-x-auto border-b border-border py-4" aria-label="Promotion steps">
        {STEPS.map((label, index) => <li key={label} className={cn('flex shrink-0 items-center gap-2 text-xs font-semibold', index === step ? 'text-foreground' : 'text-muted-foreground')}><span className={cn('grid h-5 w-5 place-items-center rounded-full border text-[10px]', index <= step && 'border-foreground')}>{index < step ? <Check className="h-3 w-3" /> : index + 1}</span>{label}</li>)}
      </ol>

      <div className="grid gap-8 py-7 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          {step === 0 && <DestinationStep destination={destination} setDestination={(value) => { setDestination(value); if (value !== 'product') setPlacement('showcase'); }} productId={productId} setProductId={setProductId} products={liveProducts} loading={isLoading} message={message} setMessage={setMessage} />}
          {step === 1 && <div className="space-y-5"><div><h2 className="text-lg font-bold">Choose your audience</h2><p className="mt-1 text-sm text-muted-foreground">Automatic targeting uses the existing Twibs delivery system. Manual targeting only uses broad location and language values.</p></div><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setAutomatic(true)} className={cn('border p-4 text-left', automatic ? 'border-foreground' : 'border-border')}><span className="font-semibold">Automatic</span><span className="mt-1 block text-xs text-muted-foreground">Let delivery find a relevant audience.</span></button><button type="button" onClick={() => setAutomatic(false)} className={cn('border p-4 text-left', !automatic ? 'border-foreground' : 'border-border')}><span className="font-semibold">Manual</span><span className="mt-1 block text-xs text-muted-foreground">Set broad location and language.</span></button></div>{!automatic && <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="market-locations">Locations</Label><Input id="market-locations" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Georgia, Tbilisi" /><p className="mt-1 text-xs text-muted-foreground">Separate multiple values with commas.</p></div><div><Label htmlFor="market-languages">Languages</Label><Input id="market-languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Georgian, English" /></div></div>}</div>}
          {step === 2 && <PlacementStep destination={destination} placement={placement} setPlacement={setPlacement} />}
          {step === 3 && <div className="space-y-5"><div><h2 className="text-lg font-bold">Budget and duration</h2><p className="mt-1 text-sm text-muted-foreground">Campaigns only deliver after the existing payment and review checks pass.</p></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="market-budget">{daily ? 'Daily budget (USD)' : 'Total budget (USD)'}</Label><Input id="market-budget" type="number" min="5" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></div><div><Label htmlFor="market-days">Duration (days)</Label><Input id="market-days" type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} /></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />Use a daily budget</label>{!validBudget && <p className="text-sm text-destructive">Enter at least $5 and a duration from 1 to 90 days.</p>}</div>}
          {step === 4 && <div className="space-y-5"><div><h2 className="text-lg font-bold">Review promotion</h2><p className="mt-1 text-sm text-muted-foreground">No charge is simulated here. Funding and moderation remain authoritative in Twibs Advertising.</p></div><dl className="divide-y divide-border border-y border-border text-sm"><ReviewRow label="Destination" value={destination === 'product' ? selectedProduct?.name || '' : destination === 'store' ? `${business.name} store` : business.name} /><ReviewRow label="Placement" value={placement === 'showcase' ? 'Sponsored showcase' : 'Product results grid'} /><ReviewRow label="Audience" value={automatic ? 'Automatic' : [locations, languages].filter(Boolean).join(' · ') || 'Broad'} />{daily && <ReviewRow label="Daily budget" value={formatMoney(cents, 'USD')} />}<ReviewRow label="Total budget" value={formatMoney(totalBudgetCents, 'USD')} /><ReviewRow label="Duration" value={`${duration} day${duration === 1 ? '' : 's'}`} /></dl></div>}
        </div>

        <aside aria-label="Promotion preview"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Marketplace preview</p><div className={cn('overflow-hidden bg-muted/20', placement === 'showcase' ? 'border border-border' : 'max-w-[13rem]')} >{previewImage ? <img src={previewImage} alt="" className={cn('w-full object-cover', placement === 'showcase' ? 'aspect-[16/10]' : 'aspect-[4/5] rounded-md')} /> : <div className={cn('grid place-items-center bg-muted', placement === 'showcase' ? 'aspect-[16/10]' : 'aspect-[4/5] rounded-md')}><Megaphone className="h-6 w-6 text-muted-foreground" /></div>}<div className="p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sponsored</p><p className="mt-2 font-bold">{previewTitle || 'Your promotion'}</p>{message && placement === 'showcase' && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{message}</p>}<p className="mt-3 text-xs font-semibold">{destination === 'product' ? 'Shop now →' : 'Visit store →'}</p></div></div></aside>
      </div>

      <div className="flex justify-between border-t border-border pt-5"><Button variant="ghost" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{step < STEPS.length - 1 ? <Button disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={submitting} onClick={() => void create()}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit promotion</Button>}</div>
    </div>
  );
}

function DestinationStep({ destination, setDestination, productId, setProductId, products, loading, message, setMessage }: { destination: 'product' | 'store' | 'business'; setDestination: (value: 'product' | 'store' | 'business') => void; productId: string; setProductId: (value: string) => void; products: ReturnType<typeof useBusinessProducts>['data'] extends infer T ? NonNullable<T> : never; loading: boolean; message: string; setMessage: (value: string) => void }) {
  return <div className="space-y-5"><div><h2 className="text-lg font-bold">What are you promoting?</h2><p className="mt-1 text-sm text-muted-foreground">Destination links are generated by Twibs and cannot be replaced with an arbitrary URL.</p></div><div className="grid grid-cols-3 gap-2">{(['product', 'store', 'business'] as const).map((value) => <button key={value} type="button" onClick={() => setDestination(value)} className={cn('border px-3 py-4 text-sm font-semibold capitalize', destination === value ? 'border-foreground bg-muted/40' : 'border-border')}>{value}</button>)}</div>{destination === 'product' && <div><Label>Live product</Label><Select value={productId} onValueChange={setProductId} disabled={loading}><SelectTrigger><SelectValue placeholder={loading ? 'Loading…' : 'Choose a product'} /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select>{!loading && products.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Publish and receive approval for a product before promoting it.</p>}</div>}<div><Label htmlFor="market-message">Campaign message</Label><Textarea id="market-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={4} placeholder="A short, useful reason to visit." /><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/300</p></div></div>;
}

function PlacementStep({ destination, placement, setPlacement }: { destination: 'product' | 'store' | 'business'; placement: 'showcase' | 'product_grid'; setPlacement: (value: 'showcase' | 'product_grid') => void }) {
  const gridAvailable = destination === 'product';
  return <div className="space-y-5"><div><h2 className="text-lg font-bold">Choose where it appears</h2><p className="mt-1 text-sm text-muted-foreground">Twibs applies the same budget, review and frequency rules to both placements.</p></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setPlacement('showcase')} className={cn('border p-4 text-left', placement === 'showcase' ? 'border-foreground bg-muted/30' : 'border-border')}><span className="font-semibold">Sponsored showcase</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Large editorial placement above Marketplace results.</span></button><button type="button" disabled={!gridAvailable} onClick={() => setPlacement('product_grid')} className={cn('border p-4 text-left disabled:cursor-not-allowed disabled:opacity-45', placement === 'product_grid' ? 'border-foreground bg-muted/30' : 'border-border')}><span className="font-semibold">Product results</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">A clearly labelled product card placed after organic listings.</span></button></div>{!gridAvailable && <p className="text-xs text-muted-foreground">Product results placement is available when the destination is a specific approved product.</p>}</div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}
