import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart, Loader2, MapPin, Package, Star, Store as StoreIcon, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/ads';
import { FULFILLMENT_LABELS, type MarketplaceProduct } from '@/lib/marketplace';

interface ProductCardProps {
  product: MarketplaceProduct;
  onSave?: (product: MarketplaceProduct) => void;
  saved?: boolean;
  saving?: boolean;
}

export default function ProductCard({ product, onSave, saved, saving }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { image_url, name, business_name, price_cents, currency, rating_avg, review_count, fulfillment, location } =
    product;
  const price = formatMoney(price_cents, (currency || 'usd').toUpperCase());
  const hasReviews = Boolean(review_count);

  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md">
      <Link
        to={`/marketplace/product/${product.product_id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {image_url && !imageFailed ? (
            <img
              src={image_url}
              alt={name}
              loading="lazy"
              decoding="async"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              onError={() => {
                setImageFailed(true);
                console.warn('[marketplace] product image failed to load', product.product_id);
              }}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <StoreIcon className="h-8 w-8" aria-hidden />
              <span className="text-xs">No image</span>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
            <span className="inline-flex max-w-[82%] items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur">
              {fulfillment === 'shipping' ? <Truck className="h-3 w-3" aria-hidden /> : <Package className="h-3 w-3" aria-hidden />}
              <span className="truncate">{FULFILLMENT_LABELS[fulfillment]}</span>
            </span>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <div className="min-h-[2.6rem]">
            <h3 className="line-clamp-2 text-[13px] font-semibold leading-5 text-foreground sm:text-sm">
              {name}
            </h3>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold tracking-tight">{price}</span>
            {hasReviews ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                <Star className="h-3 w-3 fill-foreground text-foreground" aria-hidden />
                {(rating_avg ?? 0).toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="space-y-1 border-t border-border/70 pt-2">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <StoreIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{business_name}</span>
            </p>
            {location && (
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 text-xs font-semibold">
            <span className="text-muted-foreground">
              {hasReviews ? `${review_count} review${review_count === 1 ? '' : 's'}` : 'New listing'}
            </span>
            <span className="inline-flex items-center gap-1 text-foreground">
              View
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>

      {onSave && (
        <button
          type="button"
          onClick={() => onSave(product)}
          aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
          aria-pressed={saved}
          disabled={saving}
          className={cn(
            'absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur transition',
            'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            saved ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Heart className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden />
          )}
        </button>
      )}
    </article>
  );
}

