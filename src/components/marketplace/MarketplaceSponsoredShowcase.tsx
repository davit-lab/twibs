import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import { formatMoney } from '@/lib/ads';
import type { MarketplaceAd } from '@/lib/marketplace';
import { cn } from '@/lib/utils';
import SponsoredAdMenu from './SponsoredAdMenu';

export default function MarketplaceSponsoredShowcase({ ads }: { ads: MarketplaceAd[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (!ads.length) return null;

  const goTo = (next: number) => {
    const index = Math.max(0, Math.min(ads.length - 1, next));
    setActive(index);
    railRef.current?.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <section className="mb-9" aria-labelledby="sponsored-marketplace-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="sponsored-marketplace-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Sponsored
        </h2>
        {ads.length > 1 && (
          <div className="hidden items-center gap-1 sm:flex">
            <button type="button" onClick={() => goTo(active - 1)} disabled={active === 0} className="grid h-8 w-8 place-items-center border border-border disabled:opacity-35" aria-label="Previous sponsored item"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => goTo(active + 1)} disabled={active === ads.length - 1} className="grid h-8 w-8 place-items-center border border-border disabled:opacity-35" aria-label="Next sponsored item"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <div
        ref={railRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const rail = event.currentTarget;
          if (rail.clientWidth) setActive(Math.max(0, Math.min(ads.length - 1, Math.round(rail.scrollLeft / rail.clientWidth))));
        }}
      >
        {ads.map((ad) => <SponsoredSlide key={ad.advertisement_id} ad={ad} />)}
      </div>
      {ads.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-label={`Sponsored item ${active + 1} of ${ads.length}`}>
          {ads.map((ad, index) => <button key={ad.advertisement_id} type="button" onClick={() => goTo(index)} className={cn('h-1.5 transition-all', index === active ? 'w-6 bg-foreground' : 'w-1.5 bg-muted-foreground/35')} aria-label={`Show sponsored item ${index + 1}`} />)}
        </div>
      )}
    </section>
  );
}

function SponsoredSlide({ ad }: { ad: MarketplaceAd }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const destination = ad.destination_type === 'product' && ad.product_id
    ? `/marketplace/product/${ad.product_id}`
    : `/business/${ad.business_username}${ad.destination_type === 'store' ? '?tab=store' : ''}`;
  useAdImpression(ref, ad, true, 'marketplace');

  if (hidden) return null;

  return (
    <article ref={ref} className="w-full shrink-0 snap-center overflow-hidden border-y border-border bg-muted/25 sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] sm:border">
      <Link to={destination} onClick={() => void recordAdEvent(ad.campaign_id, ad.advertisement_id, 'click', 'marketplace')} className="block aspect-[16/10] overflow-hidden bg-muted sm:aspect-[16/7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
        {ad.image_url ? <img src={ad.image_url} alt={ad.product_name || ad.business_name} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-7 w-7" /></span>}
      </Link>
      <div className="flex flex-col justify-center px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {ad.business_avatar_url && <img src={ad.business_avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
            <span className="truncate text-xs font-semibold text-muted-foreground">{ad.business_name}</span>
          </div>
          <SponsoredAdMenu ad={ad} onDismiss={() => setHidden(true)} />
        </div>
        <h3 className="mt-3 line-clamp-2 text-xl font-bold leading-tight sm:text-2xl">{ad.headline}</h3>
        {ad.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{ad.description}</p>}
        {ad.product_price_cents != null && <p className="mt-3 text-sm font-bold">{formatMoney(ad.product_price_cents, (ad.product_currency || 'USD').toUpperCase())}</p>}
        <Link to={destination} onClick={() => void recordAdEvent(ad.campaign_id, ad.advertisement_id, 'click', 'marketplace')} className="mt-4 inline-flex w-fit items-center border-b border-foreground pb-0.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {ad.cta || 'Shop now'} <span aria-hidden className="ml-1">→</span>
        </Link>
      </div>
    </article>
  );
}
