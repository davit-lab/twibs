import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useProductCategories } from '@/hooks/useMarketplace';
import { emptyProductDraft, useCreateProduct, useUpdateProduct, useUploadProductImage, type ProductDraft, type SellerProduct } from '@/hooks/useBusinessStore';
import { ALLOWED_PRODUCT_TYPES, MAX_BYTES } from '@/hooks/useBusinessAssetUpload';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { formatMoney } from '@/lib/ads';
import { ProductGallery } from '@/components/marketplace/ProductGallery';
import { PRODUCT_IMAGE_LIMIT } from '@/lib/productMedia';

type Media = { id: string; url: string; file?: File; remoteId?: string; state: 'selected' | 'uploading' | 'uploaded' | 'failed'; error?: string };
type VariantDraft = ProductDraft['variants'][number] & { id?: string; sku?: string };
const steps = ['Photos', 'Details', 'Pricing & stock', 'Delivery', 'Preview'];
const cents = (value: string) => Math.max(0, Math.round(Number(value) * 100));
export function ProductEditorDialog({ open, onOpenChange, businessId, product }: { open: boolean; onOpenChange: (open: boolean) => void; businessId: string; product: SellerProduct | null }) {
  const { data: categories } = useProductCategories();
  const { data: limit = PRODUCT_IMAGE_LIMIT, error: limitError } = useQuery({ queryKey: ['product-media-limit'], queryFn: async () => { const { data, error } = await supabase.rpc('product_media_limit'); if (error) throw error; return data || PRODUCT_IMAGE_LIMIT; }, retry: 1, initialData: PRODUCT_IMAGE_LIMIT });
  const create = useCreateProduct(businessId); const update = useUpdateProduct(businessId); const upload = useUploadProductImage(businessId);
  const cache = useQueryClient();
  const [draft, setDraft] = useState<ProductDraft>(emptyProductDraft);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const mediaRef = useRef(media); mediaRef.current = media;
  const [productId, setProductId] = useState<string | null>(null);
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    mediaRef.current.forEach(m => { if (m.file) URL.revokeObjectURL(m.url); });
    setStep(0); setProductId(product?.id ?? null);
    setMedia(product?.images.map(i => ({ id: i.id, remoteId: i.id, url: i.url, state: 'uploaded' })) ?? []);
    setVariants(product?.variants.filter(v => v.is_active).map(v => ({ id: v.id, sku: v.sku ?? '', name: v.name, value: v.value, priceCents: v.price_cents, inventoryCount: v.inventory_count, unlimitedStock: v.unlimited_stock })) ?? []);
    setDraft(product ? { name: product.name, description: product.description ?? '', categoryId: product.category_id, tags: product.tags.join(', '), priceCents: product.price_cents, fulfillment: product.fulfillment, shippingPriceCents: product.shipping_price_cents, freeShippingThresholdCents: product.free_shipping_threshold_cents, inventoryTracking: product.inventory_tracking, status: product.status === 'approved' ? 'approved' : 'draft', variants: [] } : emptyProductDraft());
    // Query invalidation must not reset an in-progress editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, businessId]);
  useEffect(() => () => mediaRef.current.forEach(m => { if (m.file) URL.revokeObjectURL(m.url); }), []);
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  function add(files: FileList | null) {
    if (!files) return;
    const selected: Media[] = [];
    for (const file of Array.from(files)) {
      if (media.length + selected.length >= limit) { toast.error(`Use up to ${limit} photos`); break; }
      if (!ALLOWED_PRODUCT_TYPES.includes(file.type) || file.size > MAX_BYTES) { toast.error(`${file.name}: use JPG, PNG, WebP or AVIF up to 10MB`); continue; }
      selected.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file, state: 'selected' });
    }
    setMedia(previous => [...previous, ...selected]);
    if (input.current) input.current.value = '';
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= media.length || busy) return;
    setMedia(previous => { const next = [...previous]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  }
  async function remove(item: Media) {
    try {
      if (item.remoteId) { const { error } = await supabase.from('product_images').delete().eq('id', item.remoteId); if (error) throw error; const path = item.url.split('/object/public/product-images/')[1]; if (path) await supabase.storage.from('product-images').remove([decodeURIComponent(path)]); void cache.invalidateQueries({ queryKey: ['marketplace'] }); }
      if (item.file) URL.revokeObjectURL(item.url);
      setMedia(previous => previous.filter(m => m.id !== item.id));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove photo'); }
  }
  const problems = [draft.name.trim().length < 2 && 'Add a product name.', (!Number.isFinite(draft.priceCents) || draft.priceCents <= 0) && 'Enter a price above zero.', draft.inventoryTracking && variants.length === 0 && 'Add a stock option (use Standard for a product without options).', variants.some(v => !v.name.trim() || !v.value.trim() || (!v.unlimitedStock && (!Number.isInteger(v.inventoryCount) || v.inventoryCount! < 0))) && 'Complete each option and its stock quantity.'].filter(Boolean);
  async function save(submit: boolean) {
    if (problems.length || (submit && media.length === 0)) { toast.error(String(problems[0] || 'Add at least one product photo.')); return; }
    setBusy(true);
    try {
      let id = productId;
      if (!id) { id = await create.mutateAsync({ ...draft, status: 'draft', variants: [] }); setProductId(id); }
      // Keep the draft ID on failure: retry never creates another product.
      const savedVariants: VariantDraft[] = [];
      for (const [position, v] of variants.entries()) {
        const row = { product_id: id, name: v.name.trim(), value: v.value.trim(), price_cents: v.priceCents, inventory_count: v.unlimitedStock ? null : v.inventoryCount, unlimited_stock: v.unlimitedStock, position, ...(v.sku !== undefined ? { sku: v.sku } : {}) };
        const result = v.id ? await supabase.from('product_variants').update(row).eq('id', v.id).select('id').single() : await supabase.from('product_variants').insert(row).select('id').single();
        if (result.error) throw result.error;
        savedVariants.push({ ...v, id: result.data.id });
        setVariants(previous => previous.map((value, index) => index === position ? { ...value, id: result.data.id } : value));
      }
      const next = [...media]; let failed = false;
      for (const [position, item] of next.entries()) {
        if (item.remoteId) continue;
        next[position] = { ...item, state: 'uploading', error: undefined }; setMedia([...next]);
        try {
          const uploaded = await upload.mutateAsync({ productId: id, file: item.file!, position });
          next[position] = { ...item, remoteId: uploaded.id, state: 'uploaded' };
        } catch (error) { failed = true; next[position] = { ...item, state: 'failed', error: error instanceof Error ? error.message : 'Upload failed' }; }
        setMedia([...next]);
      }
      if (failed) { toast.error('Some photos failed. Your draft and successful uploads are saved. Retry the failed photos.'); return; }
      const ordered = await supabase.rpc('reorder_product_images', { p_product_id: id, p_ids: next.map(m => m.remoteId!) }); if (ordered.error) throw ordered.error;
      await update.mutateAsync({ productId: id, draft: { ...draft, variants: [], status: submit ? 'pending_review' : draft.status } });
      toast.success(submit ? 'Submitted for review. Approval is required before marketplace publication.' : 'Product saved');
      void cache.invalidateQueries({ queryKey: ['marketplace'] });
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save. Your selections are retained.'); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>{product ? 'Edit product' : 'Create a product'}</DialogTitle><DialogDescription>Build your listing, preview it, then submit for review.</DialogDescription></DialogHeader>
    <nav aria-label="Product creation steps" className="flex gap-4 overflow-x-auto border-b pb-3">{steps.map((name, i) => <button key={name} onClick={() => setStep(i)} aria-current={step === i ? 'step' : undefined} className={`shrink-0 text-xs font-semibold ${step === i ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}. {name}</button>)}</nav>
    <fieldset disabled={busy} className="min-w-0 space-y-5 py-3">
    {step === 0 && <><div className="flex items-end justify-between gap-4"><div><h3 className="font-semibold">Product photography</h3><p className="mt-1 text-sm text-muted-foreground">Add up to {limit} photos. The first image is your storefront cover.</p></div><span className="text-xs tabular-nums text-muted-foreground">{media.length}/{limit}</span></div>{limitError && <p className="text-xs text-amber-600">Using the standard {PRODUCT_IMAGE_LIMIT}-photo limit while server settings reconnect.</p>}<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{media.map((item, i) => <div key={item.id} draggable={!busy} onDragStart={() => { drag.current = i; }} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag.current !== null) move(drag.current, i); }} className="group overflow-hidden border bg-muted/20"><div className="relative"><img src={item.url} alt={`Product photo ${i + 1}`} className="aspect-[4/5] w-full object-cover" />{i === 0 && <span className="absolute left-2 top-2 bg-background px-2 py-1 text-[10px] font-semibold">Cover</span>}<button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => void remove(item)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center bg-background/90"><X className="h-3.5 w-3.5" /></button></div><div className="space-y-2 p-2"><p className="text-[11px]" role="status">{item.state === 'uploading' ? 'Uploading…' : item.state === 'failed' ? 'Upload failed' : item.state === 'uploaded' ? 'Uploaded' : 'Ready'}</p>{item.error && <p className="line-clamp-2 text-[10px] text-destructive">{item.error}</p>}<div className="flex items-center gap-2"><button type="button" aria-label={`Move photo ${i + 1} earlier`} onClick={() => move(i, i - 1)} disabled={i === 0} className="disabled:opacity-25"><ArrowLeft className="h-4 w-4" /></button><button type="button" aria-label={`Move photo ${i + 1} later`} onClick={() => move(i, i + 1)} disabled={i === media.length - 1} className="disabled:opacity-25"><ArrowRight className="h-4 w-4" /></button>{i > 0 && <button type="button" className="ml-auto text-[11px] font-semibold" onClick={() => move(i, 0)}>Make cover</button>}</div></div></div>)}{media.length < limit && <button type="button" onClick={() => input.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-2 border border-dashed text-sm font-semibold text-muted-foreground transition hover:border-foreground hover:text-foreground"><ImagePlus className="h-6 w-6" />Add photos</button>}</div><input ref={input} type="file" accept={ALLOWED_PRODUCT_TYPES.join(',')} multiple className="hidden" onChange={e => add(e.target.files)} /></>}
    {step === 1 && <><div><Label htmlFor="product-name">Product name</Label><Input id="product-name" value={draft.name} onChange={e => set('name', e.target.value)} maxLength={120} /></div><div><Label htmlFor="description">Description</Label><Textarea id="description" rows={5} value={draft.description} onChange={e => set('description', e.target.value)} maxLength={2000} /></div><div><Label htmlFor="category">Category</Label><select id="category" className="w-full rounded-md border bg-background p-2" value={draft.categoryId || ''} onChange={e => set('categoryId', e.target.value || null)}><option value="">Choose category</option>{categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><Label htmlFor="tags">Brand and search tags</Label><Input id="tags" value={draft.tags} onChange={e => set('tags', e.target.value)} placeholder="Brand, material, style (comma separated)" /></div></>}
    {step === 2 && <><div><Label htmlFor="price">Price · USD</Label><Input id="price" type="number" min="0.01" step="0.01" defaultValue={draft.priceCents / 100 || ''} onChange={e => set('priceCents', cents(e.target.value))} /></div><div className="flex items-center justify-between"><Label htmlFor="track">Track stock for each purchasable option</Label><Switch id="track" checked={draft.inventoryTracking} onCheckedChange={v => set('inventoryTracking', v)} /></div><p className="text-xs text-muted-foreground">Each row is one purchasable combination, such as “Black / M” or “Black / 256GB”. Its exact price and stock follow it into the order.</p>{variants.map((v, i) => <div key={i} className="grid grid-cols-2 gap-3 border-b pb-4 sm:grid-cols-3">{(['name', 'value', 'sku'] as const).map(key => <div key={key}><Label htmlFor={`${key}-${i}`}>{key === 'name' ? 'Option group' : key === 'value' ? 'Combination' : 'SKU'}</Label><Input id={`${key}-${i}`} value={v[key] ?? ''} onChange={e => setVariants(all => all.map((row, j) => j === i ? { ...row, [key]: e.target.value } : row))} /></div>)}<div><Label htmlFor={`stock-${i}`}>Quantity</Label><Input id={`stock-${i}`} type="number" min="0" step="1" value={v.inventoryCount ?? ''} onChange={e => setVariants(all => all.map((row, j) => j === i ? { ...row, inventoryCount: Number(e.target.value) } : row))} /></div><div><Label htmlFor={`override-${i}`}>Price override (USD)</Label><Input id={`override-${i}`} type="number" min="0" step="0.01" defaultValue={v.priceCents == null ? '' : v.priceCents / 100} onChange={e => setVariants(all => all.map((row, j) => j === i ? { ...row, priceCents: e.target.value === '' ? null : cents(e.target.value) } : row))} /></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.unlimitedStock} onChange={e => setVariants(all => all.map((row, j) => j === i ? { ...row, unlimitedStock: e.target.checked } : row))} />Unlimited stock</label><Button variant="ghost" size="sm" onClick={async () => { if (v.id) { const { error } = await supabase.from('product_variants').update({ is_active: false }).eq('id', v.id); if (error) { toast.error(error.message); return; } } setVariants(all => all.filter((_,j) => j !== i)); }}>Remove option</Button></div>)}<Button variant="outline" onClick={() => setVariants(all => [...all, { name: 'Option', value: '', sku: '', priceCents: null, inventoryCount: 0, unlimitedStock: false }])}>Add option</Button></>}
    {step === 3 && <><div><Label htmlFor="fulfillment">Fulfillment</Label><select id="fulfillment" className="w-full rounded-md border bg-background p-2" value={draft.fulfillment} onChange={e => set('fulfillment', e.target.value as ProductDraft['fulfillment'])}><option value="shipping">Shipping</option><option value="pickup">Pickup</option><option value="both">Shipping or pickup</option></select></div>{(draft.fulfillment === 'shipping' || draft.fulfillment === 'both') && <><div><Label htmlFor="shipping-price">Delivery price · USD</Label><Input id="shipping-price" type="number" min="0" step="0.01" defaultValue={draft.shippingPriceCents / 100} onChange={e => set('shippingPriceCents', cents(e.target.value))} /></div><div><Label htmlFor="free-shipping">Free delivery above · USD (optional)</Label><Input id="free-shipping" type="number" min="0" step="0.01" defaultValue={draft.freeShippingThresholdCents == null ? '' : draft.freeShippingThresholdCents / 100} onChange={e => set('freeShippingThresholdCents', e.target.value ? cents(e.target.value) : null)} /></div></>}</>}
    {step === 4 && <div className="grid gap-6 sm:grid-cols-2"><ProductGallery images={media} name={draft.name} /><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Customer preview</p><h2 className="mt-3 text-2xl font-bold">{draft.name || 'Product name'}</h2><p className="mt-2 text-xl">{formatMoney(draft.priceCents, 'USD')}</p><p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{draft.description}</p><div className="mt-4 flex flex-wrap gap-2">{variants.map((v,i) => <span className="rounded border px-2 py-1 text-xs" key={i}>{v.value || 'Option'} · {v.unlimitedStock ? 'In stock' : `${v.inventoryCount ?? 0} available`}</span>)}</div><p className="mt-4 text-xs text-muted-foreground">{draft.fulfillment === 'pickup' ? 'Pickup' : `Delivery ${formatMoney(draft.shippingPriceCents, 'USD')}`}</p>{problems.map(problem => <p key={String(problem)} className="mt-2 text-sm text-destructive">{problem}</p>)}</div></div>}
    </fieldset><DialogFooter className="flex-wrap gap-2"><Button variant="ghost" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>Back</Button><Button variant="outline" disabled={busy || !!problems.length} onClick={() => void save(false)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {media.some(m => m.state === 'failed') ? 'Retry & save' : 'Save draft / changes'}</Button>{step < steps.length - 1 ? <Button disabled={busy} onClick={() => setStep(step + 1)}>Continue</Button> : draft.status !== 'approved' && <Button disabled={busy || !!problems.length || !media.length} onClick={() => void save(true)}>Submit for review</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
