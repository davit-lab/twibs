import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin, Star, Store as StoreIcon, Loader2 } from 'lucide-react';
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

  return (
    <article className="group relative flex flex-col overflow-hidden">
      <Link
        to={`/marketplace/product/${product.product_id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-muted">
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
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <StoreIcon className="h-8 w-8" aria-hidden />
              <span className="sr-only">No image</span>
            </div>
          )}

          {fulfillment !== 'shipping' && (
            <span className="absolute left-2 top-2 rounded-lg bg-background/85 px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {FULFILLMENT_LABELS[fulfillment]}
            </span>
          )}
        </div>

        <div className="space-y-1 pt-2.5">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{name}</h3>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-sm font-bold">
              {formatMoney(price_cents, (currency || 'usd').toUpperCase())}
            </span>
            {review_count ? (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-primary text-primary" aria-hidden />
                {(rating_avg ?? 0).toFixed(1)}
                <span className="text-muted-foreground/70">({review_count})</span>
              </span>
            ) : null}
          </div>

          <p className="truncate text-xs text-muted-foreground">{business_name}</p>

          {location && (
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {location}
            </p>
          )}
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
            'absolute right-2 top-2 rounded-lg bg-background/85 p-1.5 transition-colors',
            'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
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
