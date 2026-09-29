import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Store } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ProductCard from '@/components/marketplace/ProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarketplaceProduct } from '@/lib/marketplace';

export function PublicBusinessStore({ businessId }: { businessId: string }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['marketplace', 'business-public', businessId, page, query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_marketplace', {
        p_business_id: businessId,
        p_query: query.trim() || null,
        p_limit: 12,
        p_offset: page * 12,
      });
      if (error) throw error;
      return data as MarketplaceProduct[];
    },
    placeholderData: (previous) => previous,
  });

  return (
    <section aria-label="Business store">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Store</p>
          <h2 className="mt-1 text-xl font-bold">Products</h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            className="pl-9"
            placeholder="Search this store"
            aria-label="Search this store"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="aspect-[4/5] w-full rounded-md" />)}
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-sm font-semibold">Could not load this store.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : !data?.length ? (
        <div className="py-14 text-center">
          <Store className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <h3 className="mt-3 font-semibold">{query ? 'No matching products' : 'The store is getting ready'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{query ? 'Try a different search.' : 'Published products will appear here.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
          {data.map((product) => <ProductCard key={product.product_id} product={product} />)}
        </div>
      )}

      {(page > 0 || data?.length === 12) && (
        <div className="mt-8 flex justify-center gap-3 border-t border-border pt-5">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <Button variant="outline" disabled={data?.length !== 12} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      )}
    </section>
  );
}

export function BusinessReels({ businessId }: { businessId: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['business-public-reels', businessId],
    queryFn: async () => {
      const result = await supabase.from('reels').select('id,caption,thumbnail_url').eq('business_id', businessId).order('created_at', { ascending: false }).limit(24);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return isLoading ? <p>Loading reels…</p> : error ? <p>Could not load reels.</p> : !data?.length ? <p className="py-10 text-sm text-muted-foreground">No reels yet.</p> : <div className="grid grid-cols-3 gap-2">{data.map((reel) => <a key={reel.id} href={`/reels/${reel.id}`} className="aspect-[9/16] overflow-hidden rounded bg-muted">{reel.thumbnail_url && <img src={reel.thumbnail_url} alt={reel.caption || 'Business reel'} loading="lazy" className="h-full w-full object-cover" />}</a>)}</div>;
}
