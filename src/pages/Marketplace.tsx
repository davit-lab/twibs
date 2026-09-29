import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PackageCheck, Plus, Search, ShoppingBag, SlidersHorizontal, Store, X } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import ProductCard from '@/components/marketplace/ProductCard';
import MarketplaceSponsoredShowcase from '@/components/marketplace/MarketplaceSponsoredShowcase';
import MarketplaceSponsoredProductCard from '@/components/marketplace/MarketplaceSponsoredProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCartCount,
  useDebouncedValue,
  useMarketplaceSearch,
  useMarketplaceAds,
  useProductCategories,
} from '@/hooks/useMarketplace';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  FULFILLMENT_LABELS,
  MARKETPLACE_SORTS,
  type MarketplaceFilters,
} from '@/lib/marketplace';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;

export default function Marketplace() {
  const { user } = useAuth();
  const { accounts } = useBusiness();
  const sellerCta = accounts.length > 0 ? '/b?tab=store' : '/business/create';
  const [searchParams, setSearchParams] = useSearchParams();
  // Seeded from the URL so a tag or seller link lands on a real search.
  const [rawQuery, setRawQuery] = useState(() => searchParams.get('query') ?? '');
  const [filters, setFilters] = useState<MarketplaceFilters>(DEFAULT_MARKETPLACE_FILTERS);
  const [page, setPage] = useState(0);

  const debouncedQuery = useDebouncedValue(rawQuery, 300);
  const { data: categories } = useProductCategories();
  const cartCount = useCartCount(!!user);

  // A shopper only ever sees approved listings. RLS also lets a seller see their
  // own drafts, so they are filtered out here rather than leaked into a browse
  // surface for everyone else.
  const filtersWithQuery = useMemo<MarketplaceFilters>(
    () => ({ ...filters, query: debouncedQuery.trim() }),
    [filters, debouncedQuery]
  );
  const { data: sponsored = [] } = useMarketplaceAds({
    enabled: !!user,
    placement: 'showcase',
    categoryId: filters.categoryId,
    search: debouncedQuery,
    limit: 3,
  });
  const { data: gridSponsored = [] } = useMarketplaceAds({
    enabled: !!user,
    placement: 'product_grid',
    categoryId: filters.categoryId,
    search: debouncedQuery,
    limit: 1,
  });
  const { data, isLoading, isFetching, error, hasMore } = usePagedSearch(filtersWithQuery, page);

  const update = (patch: Partial<MarketplaceFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(0);
  };

  const hasActiveFilters =
    !!rawQuery ||
    filters.categoryId !== null ||
    filters.fulfillment !== null ||
    filters.minCents !== null ||
    filters.maxCents !== null;

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[90rem] px-4 py-5 lg:px-8 lg:py-8">
        <header className="mb-5 flex flex-col items-start gap-4 border-b border-border pb-5 lg:flex-row lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Marketplace</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Shop directly from businesses on Twibs.</p>
          </div>
          <nav aria-label="Marketplace account" className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
            {user && (
              <Link
                to="/orders"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PackageCheck className="h-4 w-4" aria-hidden />
                Orders
              </Link>
            )}
            {user && <CartLink count={cartCount} />}
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex"><Link to={sellerCta}><Plus className="mr-1.5 h-3.5 w-3.5" />Sell</Link></Button>
          </nav>
        </header>

        <div className="-mx-4 mb-7 border-b border-border bg-background/95 px-4 py-3 supports-[backdrop-filter]:backdrop-blur-sm lg:sticky lg:top-0 lg:z-10 lg:mx-0 lg:px-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={rawQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRawQuery(next);
                    setPage(0);
                    setSearchParams(next ? { query: next } : {}, { replace: true });
                  }}
                  placeholder="Search products and businesses"
                  aria-label="Search the marketplace"
                  className="pl-9"
                />
                {rawQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawQuery('');
                      setSearchParams({}, { replace: true });
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

              <Select
                value={filters.fulfillment ?? 'all'}
                onValueChange={(v) => update({ fulfillment: v === 'all' ? null : (v as MarketplaceFilters['fulfillment']) })}
              >
                <SelectTrigger className="w-[9.5rem] shrink-0" aria-label="Filter by fulfilment">
                  <SelectValue placeholder="Fulfilment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any fulfilment</SelectItem>
                  <SelectItem value="shipping">{FULFILLMENT_LABELS.shipping}</SelectItem>
                  <SelectItem value="pickup">{FULFILLMENT_LABELS.pickup}</SelectItem>
                  <SelectItem value="both">{FULFILLMENT_LABELS.both}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.sort} onValueChange={(v) => update({ sort: v as MarketplaceFilters['sort'] })}>
                <SelectTrigger className="w-[9rem] shrink-0 sm:w-[11rem]" aria-label="Sort results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACE_SORTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {categories && categories.length > 0 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                <CategoryChip
                  active={filters.categoryId === null}
                  onClick={() => update({ categoryId: null })}
                >
                  All
                </CategoryChip>
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    active={filters.categoryId === c.id}
                    onClick={() => update({ categoryId: c.id })}
                  >
                    {c.name}
                  </CategoryChip>
                ))}
              </div>
            )}
          </div>
        </div>

        <MarketplaceSponsoredShowcase ads={sponsored} />

        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4"><div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{hasActiveFilters ? 'Browse Marketplace' : 'Just listed'}</p><h2 className="mt-1 text-xl font-semibold">{hasActiveFilters ? 'Search results' : 'New arrivals'}</h2></div><div className="flex gap-2"><Input aria-label="Minimum price in USD" className="w-24 sm:w-28" type="number" min="0" step="0.01" placeholder="Min USD" onChange={e => update({ minCents: e.target.value ? Math.max(0,Math.round(Number(e.target.value)*100)) : null })} /><Input aria-label="Maximum price in USD" className="w-24 sm:w-28" type="number" min="0" step="0.01" placeholder="Max USD" onChange={e => update({ maxCents: e.target.value ? Math.max(0,Math.round(Number(e.target.value)*100)) : null })} /></div></div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <Skeleton className="aspect-square w-full" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Could not load products"
            body={(error as Error).message || 'Please try again.'}
          />
        ) : data.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No products match those filters' : 'No products yet'}
            body={
              hasActiveFilters
                ? 'Try a different search or clear the filters.'
                : 'Businesses have not listed anything for sale on Twibs yet.'
            }
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRawQuery('');
                    setSearchParams({}, { replace: true });
                    setFilters(DEFAULT_MARKETPLACE_FILTERS);
                    setPage(0);
                  }}
                >
                  <SlidersHorizontal className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Clear filters
                </Button>
              ) : (
                // Sellers arrive here looking for an upload button, so point them
                // straight at the Store tab that actually creates listings.
                <Button size="sm" asChild>
                  <Link to={sellerCta}>
                    <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {accounts.length > 0 ? 'List a product' : 'Open a business'}
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
              {data.flatMap((product, index) => {
                const cards = [<ProductCard key={product.product_id} product={product} />];
                if (index === 7 && gridSponsored[0]) {
                  cards.push(<MarketplaceSponsoredProductCard key={`ad-${gridSponsored[0].advertisement_id}`} ad={gridSponsored[0]} />);
                }
                return cards;
              })}
            </div>

            {(hasMore || page > 0) && (
              <div className="mt-6 flex justify-center gap-3"><Button variant="outline" onClick={() => setPage(p => Math.max(0,p-1))} disabled={page === 0 || isFetching}>Previous</Button>
                <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={isFetching || !hasMore}>
                  {isFetching ? 'Loading…' : 'Next page'}
                </Button>
              </div>
            )}
          </>
        )}

        {!user && data.length > 0 && (
          <p className="mt-8 rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            to save products and buy from businesses.
          </p>
        )}
      </div>
    </MainLayout>
  );
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      to="/cart"
      className="relative flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ShoppingBag className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
      <span className="sr-only">{count} items in cart</span>
    </Link>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Store className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * One page of results plus a "is there more" flag, so the grid can render a
 * single page at a time without a second round trip for the count.
 */
function usePagedSearch(filters: MarketplaceFilters, page: number) {
  const { data, isLoading, isFetching, error } = useMarketplaceSearch(filters, page);
  const items = useMemo(() => (data ?? []).filter((p) => p.is_public), [data]);
  return {
    data: items,
    isLoading,
    isFetching,
    error,
    hasMore: (data?.length ?? 0) === PAGE_SIZE,
  };
}
