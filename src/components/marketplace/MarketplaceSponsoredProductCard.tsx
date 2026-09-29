import { useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@/lib/ads';
import type { MarketplaceAd } from '@/lib/marketplace';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import SponsoredAdMenu from './SponsoredAdMenu';

export default function MarketplaceSponsoredProductCard({ ad }: { ad: MarketplaceAd }) {
  const rootRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const destination = ad.product_id ? `/marketplace/product/${ad.product_id}` : '/marketplace';
  useAdImpression(rootRef, ad, !hidden, 'marketplace');

  if (hidden) return null;

  return (
    <article ref={rootRef} className="group relative flex flex-col overflow-hidden" aria-label={`Sponsored product: ${ad.product_name || ad.headline}`}>
      <Link
        to={destination}
        onClick={() => void recordAdEvent(ad.campaign_id, ad.advertisement_id, 'click', 'marketplace')}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-muted">
          {ad.image_url ? (
            <img src={ad.image_url} alt={ad.product_name || ad.headline} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground"><ImageOff className="h-8 w-8" /></div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">Sponsored</span>
        </div>
        <div className="space-y-1 pt-2.5">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{ad.product_name || ad.headline}</h3>
          {ad.product_price_cents != null && <p className="pt-1 text-sm font-bold">{formatMoney(ad.product_price_cents, (ad.product_currency || 'USD').toUpperCase())}</p>}
          <p className="truncate text-xs text-muted-foreground">{ad.business_name}</p>
        </div>
      </Link>
      <div className="absolute right-1.5 top-1.5 rounded-full bg-background/90"><SponsoredAdMenu ad={ad} onDismiss={() => setHidden(true)} /></div>
    </article>
  );
}
