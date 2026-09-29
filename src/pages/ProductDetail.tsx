import { ProductGallery } from '@/components/marketplace/ProductGallery';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Heart,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Store,
  Truck,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { useAddToCart, useProduct, useRecordProductView, useSaveProduct } from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/ads';
import {
  FULFILLMENT_LABELS,
  PRODUCT_STATUS_LABELS,
  isPurchasable,
  stockLabel,
  type ProductVariant,
} from '@/lib/marketplace';

export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>();
  const { user } = useAuth();
  const { identity } = useActiveIdentity();
  const { accounts, switchToBusiness } = useBusiness();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: product, isLoading, error } = useProduct(productId);
  const { saved, onToggle, isPending: saving } = useSaveProduct(product?.product_id, product?.business_id);
  const addToCart = useAddToCart();

  const [imageIndex, setImageIndex] = useState(0);
  // Variants arrive as a flat list of name/value pairs ("Size: M"), so the
  // picker groups them into one choice per dimension.
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setImageIndex(0);
    setQuantity(1);
    setChoices({});
  }, [productId]);

  const groups = useMemo(() => {
    const variants = product?.variants.filter(v => v.is_active) ?? [];
    return variants.length ? [['Option', variants] as [string, ProductVariant[]]] : [];
  }, [product]);

  const selectedVariant = useMemo<ProductVariant | null>(() => {
    if (!product || groups.length === 0) return null;
    for (const [name, variants] of groups) {
      const picked = variants.find((v) => v.id === choices[name]);
      if (!picked) return null;
    }
    return groups[0][1].find((v) => v.id === choices[groups[0][0]]) ?? null;
  }, [groups, choices]);

  const needsChoice = groups.length > 0;
  const choiceComplete = groups.every(([name, variants]) =>
    variants.some((v) => v.id === choices[name])
  );

  const trackedWithVariant = !!product?.inventory_tracking && product.variants.length > 0;
  const purchasable = product
    ? product.is_public && identity.type === 'personal' && isPurchasable(product.inventory_tracking ? selectedVariant : null, product.inventory_tracking) &&
      (!needsChoice || choiceComplete)
    : false;

  const available = selectedVariant
    ? selectedVariant.unlimited_stock || !product?.inventory_tracking
      ? null
      : (selectedVariant.inventory_count ?? 0)
    : null;

  useRecordProductView(product?.product_id, product?.business_id, product?.is_public ?? false);

  const price = product
    ? selectedVariant?.price_cents ?? product.price_cents
    : 0;
  const managesProductBusiness = !!product && accounts.some((account) => account.id === product.business_id);

  const handleAdd = async (buyNow = false) => {
    if (!product) return;
    if (!user) {
      toast({ title: 'Sign in to buy', description: 'You need an account to add items to a cart.' });
      return;
    }
    if (needsChoice && !choiceComplete) {
      toast({ title: 'Choose an option', description: 'Pick the options for this product first.' });
      return;
    }
    if (trackedWithVariant && !selectedVariant) {
      toast({ title: 'Choose an option', description: 'This product is sold in variants.' });
      return;
    }
    if (!purchasable) {
      toast({ title: 'Out of stock', description: 'This option is not available right now.' });
      return;
    }
    try {
      await addToCart.mutateAsync({
        productId: product.product_id,
        variantId: selectedVariant?.id ?? null,
        quantity,
      });
      toast({ title: 'Added to cart', description: product.name });
      if (buyNow) navigate('/cart');
    } catch (e) {
      toast({ title: 'Could not add to cart', description: (e as Error).message });
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-4">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !product) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <Store className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-bold">Product not available</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            It may have been removed, or the link may be wrong.
          </p>
          <Button variant="outline" className="mt-5" asChild>
            <Link to="/marketplace">Back to marketplace</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const images = product.images.length ? product.images : [];
  const maxQuantity = available ?? 10;

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <Link
          to="/marketplace"
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Marketplace
        </Link>

        <div className="grid gap-8 md:grid-cols-2">
          <ProductGallery images={images} name={product.name} />

          <div>
            {!product.is_public && (
              <p className="mb-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Only you can see this listing — it is {PRODUCT_STATUS_LABELS[product.product_status].toLowerCase()}.
                {product.moderation_note ? ` ${product.moderation_note}` : ''}
              </p>
            )}

            <h1 className="text-2xl font-black tracking-tight">{product.name}</h1>

            {product.business_username ? (
              <Link
                to={`/business/${product.business_username}`}
                className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                <Store className="h-3.5 w-3.5" aria-hidden />
                {product.business_name}
              </Link>
            ) : (
              <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                <Store className="h-3.5 w-3.5" aria-hidden />
                {product.business_name}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-2xl font-black">
                {formatMoney(price, product.currency.toUpperCase())}
              </span>
              {selectedVariant?.price_cents != null && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatMoney(product.price_cents, product.currency.toUpperCase())}
                </span>
              )}
              {product.review_count > 0 && (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
                  {(product.rating_avg ?? 0).toFixed(1)}
                  <span>({product.review_count})</span>
                </span>
              )}
            </div>

            {product.location && (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden />
                {product.location}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" aria-hidden />
              <span>{FULFILLMENT_LABELS[product.fulfillment]}</span>
              {product.shipping_price_cents > 0 && (
                <span>· {formatMoney(product.shipping_price_cents, product.currency.toUpperCase())} delivery</span>
              )}
              {product.free_shipping_threshold_cents != null && (
                <span>· free over {formatMoney(product.free_shipping_threshold_cents, product.currency.toUpperCase())}</span>
              )}
            </div>

            {groups.map(([name, variants]) => (
              <div key={name} className="mt-5">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variants.map((v) => {
                    const out = !isPurchasable(v, product.inventory_tracking);
                    const active = choices[name] === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={out}
                        onClick={() => setChoices((prev) => ({ ...prev, [name]: v.id }))}
                        aria-pressed={active}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          active
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-foreground hover:border-primary/40',
                          out && 'cursor-not-allowed opacity-40 hover:border-border'
                        )}
                      >
                        {v.name === 'Option' ? v.value : `${v.name}: ${v.value}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <p
              className={cn(
                'mt-4 text-sm font-semibold',
                purchasable || !product.inventory_tracking ? 'text-emerald-500' : 'text-muted-foreground'
              )}
            >
              {product.inventory_tracking
                ? stockLabel(selectedVariant, product.inventory_tracking)
                : 'In stock'}
            </p>

            {managesProductBusiness ? (
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => {
                  switchToBusiness(product.business_id);
                  navigate('/messages');
                }}
              >
                Open business inbox
              </Button>
            ) : (
              <Button variant="outline" className="mt-4 w-full" asChild>
                <Link to={`/messages?business=${product.business_id}&product=${product.product_id}`}>Message business</Link>
              </Button>
            )}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-border">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
                <span className="w-10 text-center text-sm font-bold tabular-nums" aria-live="polite">
                  {quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              <Button
                className="flex-1"
                onClick={() => void handleAdd()}
                disabled={!purchasable || addToCart.isPending}
              >
                {addToCart.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Add to cart
              </Button>

              <Button
                variant="outline"
                size="icon"
                aria-label={saved ? 'Remove from saved' : 'Save product'}
                aria-pressed={saved}
                onClick={onToggle}
                disabled={saving}
              >
                <Heart className={cn('h-4 w-4', saved && 'fill-primary text-primary')} aria-hidden />
              </Button>
            </div>

            <Button className="mt-3 w-full" variant="outline" disabled={!purchasable || addToCart.isPending} onClick={() => void handleAdd(true)}>Buy now</Button>
            {identity.type === 'business' && <p className="mt-2 text-xs text-muted-foreground">Switch to Personal to shop.</p>}
            {product.description && (
              <div className="mt-6 border-t border-border pt-5">
                <h2 className="text-sm font-bold">Description</h2>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </div>
            )}

            {product.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/marketplace?query=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Prices and stock are confirmed on your account at checkout.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
