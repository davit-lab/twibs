import { useState } from 'react';
import {
  ExternalLink,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
  EyeOff,
  Megaphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProductEditorDialog } from '@/components/business/ProductEditorDialog';
import {
  useBusinessProducts,
  useDeleteProduct,
  useUpdateVariant,
  useUnpublishProduct,
  useStoreSettings,
  useSaveStoreSettings,
  type SellerProduct,
  type StoreSettingsDraft,
} from '@/hooks/useBusinessStore';
import { formatMoney } from '@/lib/ads';
import { PRODUCT_STATUS_LABELS, stockLabel } from '@/lib/marketplace';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  pending_review: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  draft: 'border-border bg-surface-2 text-muted-foreground',
  rejected: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  removed: 'border-border bg-surface-2 text-muted-foreground',
};

function StockEditor({ product }: { product: SellerProduct }) {
  const updateVariant = useUpdateVariant(product.business_id);
  const [rows, setRows] = useState<Record<string, { count: string; unlimited: boolean }>>({});

  if (!product.inventory_tracking) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Stock tracking is off for this product. Turn it on when editing the product to track quantities.
      </p>
    );
  }

  if (product.variants.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        This product cannot be purchased until you add a stock option. Add a variant (for example a size) to track
        quantities per option.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {product.variants.map((v) => {
        const draft = rows[v.id] ?? {
          count: v.unlimited_stock ? '' : String(v.inventory_count ?? 0),
          unlimited: v.unlimited_stock,
        };
        return (
          <div key={v.id} className="flex items-center gap-2 text-sm">
            <span className="w-28 flex-shrink-0 truncate text-muted-foreground">
              {v.name}: {v.value}
            </span>
            <Input
              className="h-8 w-20"
              inputMode="numeric"
              disabled={draft.unlimited}
              value={draft.count}
              onChange={(e) =>
                setRows((r) => ({ ...r, [v.id]: { ...draft, count: e.target.value.replace(/[^0-9]/g, '') } }))
              }
            />
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Switch
                checked={draft.unlimited}
                onCheckedChange={(checked) =>
                  setRows((r) => ({ ...r, [v.id]: { ...draft, unlimited: checked } }))
                }
              />
              unlimited
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8"
              disabled={updateVariant.isPending}
              onClick={() =>
                updateVariant.mutate(
                  {
                    variantId: v.id,
                    inventoryCount: draft.unlimited ? null : Number.parseInt(draft.count || '0', 10),
                    unlimitedStock: draft.unlimited,
                    priceCents: v.price_cents,
                  },
                  { onSuccess: () => toast.success('Stock updated'), onError: (e) => toast.error(e.message) }
                )
              }
            >
              Save
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function ProductRow({ product }: { product: SellerProduct }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removeProduct = useDeleteProduct(product.business_id);
  const unpublish = useUnpublishProduct(product.business_id);
  const cover = product.images[0];

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
          {cover ? (
            <img src={cover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{product.name}</p>
            <Badge className={cn('border text-[11px]', STATUS_TONE[product.status])}>
              {PRODUCT_STATUS_LABELS[product.status]}
            </Badge>
            {product.inventory_tracking && (
              <span className="text-[11px] text-muted-foreground">
                {product.variants.length > 0
                  ? `${product.variants.length} variant${product.variants.length > 1 ? 's' : ''}`
                  : 'untracked stock'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatMoney(product.price_cents, product.currency.toUpperCase())}
          </p>

          {product.status === 'rejected' && product.moderation_note && (
            <p className="mt-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
              Moderator: {product.moderation_note}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {product.status === 'approved' && (
              <Button size="sm" variant="ghost" className="h-8" asChild>
                <Link to={`/ads/new?marketplace=1&productId=${product.id}`} aria-label={`Promote ${product.name}`}>
                  <Megaphone className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Promote</span>
                </Link>
              </Button>
            )}
            {product.status === 'approved' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                asChild
              >
                <Link to={`/marketplace/product/${product.id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
          {(product.status === 'approved' || product.status === 'pending_review') && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground"
              disabled={unpublish.isPending}
              onClick={() =>
                unpublish.mutate(product.id, {
                  onSuccess: () => toast.success('Listing unpublished — submit it again to go live'),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <EyeOff className="h-3.5 w-3.5" />
              Unpublish
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <StockEditor product={product} />
        </div>
      )}

      <ProductEditorDialog
        open={editing}
        onOpenChange={(next) => {
          setEditing(next);
          if (!next) setEditing(false);
        }}
        businessId={product.business_id}
        product={product}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{product.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the listing and its photos. Past orders keep their record of what
              was bought, but the listing is gone. If you only want to stop selling it, withdraw it
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeProduct.mutate(product.id, {
                  onSuccess: () => {
                    toast.success('Product deleted');
                    setConfirmDelete(false);
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StoreSettingsPanel({ businessId }: { businessId: string }) {
  const { data, isLoading } = useStoreSettings(businessId);
  const save = useSaveStoreSettings(businessId);
  const [draft, setDraft] = useState<StoreSettingsDraft | null>(null);

  const current =
    draft ??
    data ?? {
      isStoreEnabled: false,
      tagline: '',
      about: '',
      heroImageUrl: null,
      shippingNote: '',
      pickupNote: '',
      city: '',
      region: '',
      country: '',
    };

  const set = <K extends keyof StoreSettingsDraft>(key: K, value: StoreSettingsDraft[K]) =>
    setDraft({ ...current, [key]: value });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Storefront</p>
          <p className="text-[11px] text-muted-foreground">
            Controls whether shoppers can see your catalogue, and the details shown on it.
          </p>
        </div>
        <Switch
          checked={current.isStoreEnabled}
          onCheckedChange={(v) => set('isStoreEnabled', v)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="s-city">City</Label>
          <Input id="s-city" value={current.city} onChange={(e) => set('city', e.target.value)} placeholder="Asmara" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-region">Region</Label>
          <Input id="s-region" value={current.region} onChange={(e) => set('region', e.target.value)} placeholder="Maekel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-country">Country</Label>
          <Input id="s-country" value={current.country} onChange={(e) => set('country', e.target.value)} placeholder="Eritrea" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="s-tag">Tagline</Label>
        <Input id="s-tag" value={current.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Handmade ceramics, made to order" maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="s-about">About your shop</Label>
        <Textarea id="s-about" rows={3} value={current.about} onChange={(e) => set('about', e.target.value)} maxLength={1000} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="s-ship">Shipping note</Label>
          <Input id="s-ship" value={current.shippingNote} onChange={(e) => set('shippingNote', e.target.value)} placeholder="Ships within 2 business days" maxLength={160} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-pick">Pickup note</Label>
          <Input id="s-pick" value={current.pickupNote} onChange={(e) => set('pickupNote', e.target.value)} placeholder="Collect from the shop" maxLength={160} />
        </div>
      </div>

      <Button
        onClick={() =>
          save.mutate(current, {
            onSuccess: () => toast.success('Storefront saved'),
            onError: (e) => toast.error(e.message),
          })
        }
        disabled={save.isPending}
      >
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save storefront
      </Button>
    </div>
  );
}

export function StoreTab({ businessId, businessUsername }: { businessId: string; businessUsername: string }) {
  const [page, setPage] = useState(0);
  const { data: products, isLoading, error, refetch } = useBusinessProducts(businessId, page);
  const [editorOpen, setEditorOpen] = useState(false);

  const visible = (products ?? []).filter((p) => p.status !== 'removed');
  const withdrawn = (products ?? []).filter((p) => p.status === 'removed');
  const live = visible.filter((p) => p.status === 'approved').length;
  const pending = visible.filter((p) => p.status === 'pending_review').length;

  const openCreate = () => setEditorOpen(true);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Store</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading your catalogue…'
              : visible.length === 0
                ? 'No products yet. Add your first listing to start selling.'
                : `${visible.length} product${visible.length > 1 ? 's' : ''} on this page · ${live} live${pending > 0 ? ` · ${pending} awaiting review` : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/ads/new?marketplace=1">
              <Megaphone className="h-4 w-4" />
              Promote store
            </Link>
          </Button>
          {live > 0 && (
            <Button variant="outline" asChild>
              <Link to={`/business/${businessUsername}`}>
                <LayoutGrid className="h-4 w-4" />
                Public profile
              </Link>
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New product
          </Button>
        </div>
      </div>

      <StoreSettingsPanel businessId={businessId} />
      {error && <Button variant="outline" onClick={() => void refetch()}>Could not load products · Retry</Button>}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-12 text-center">
          <Package className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nothing listed yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Products you create appear here. Save a draft while you work on it, then submit for review
            when it is ready to go live.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New product
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
        </div>
      )}

      {(page > 0 || products?.length === 24) && <div className="flex justify-between"><Button variant="outline" disabled={!page} onClick={() => setPage(page-1)}>Previous</Button><Button variant="outline" disabled={products?.length !== 24} onClick={() => setPage(page+1)}>Next</Button></div>}
      {withdrawn.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {withdrawn.length} taken down by moderation
          </summary>
          <div className="mt-3 space-y-2">
            {withdrawn.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-muted-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {stockLabel(null, p.inventory_tracking)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        businessId={businessId}
        product={null}
      />
    </div>
  );
}
