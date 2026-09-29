import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Truck,
  X,
} from 'lucide-react';
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
  const [rawQuery, setRawQuery] = useState(() => searchParams.get('query') ?? '');
  const [filters, setFilters] = useState<MarketplaceFilters>(DEFAULT_MARKETPLACE_FILTERS);
  const [page, setPage] = useState(0);

  const debouncedQuery = useDebouncedValue(rawQuery, 300);
  const { data: categories } = useProductCategories();
  const cartCount = useCartCount(!!user);

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

  const updateSearch = (next: string) => {
    setRawQuery(next);
    setPage(0);
    setSearchParams(next.trim() ? { query: next } : {}, { replace: true });
  };

  const clearFilters = () => {
    setRawQuery('');
    setSearchParams({}, { replace: true });
    setFilters(DEFAULT_MARKETPLACE_FILTERS);
    setPage(0);
  };

  const selectedCategory = categories?.find((category) => category.id === filters.categoryId);
  const sortLabel = MARKETPLACE_SORTS.find((sort) => sort.value === filters.sort)?.label ?? 'Newest';
  const hasActiveFilters =
    !!rawQuery.trim() ||
    filters.categoryId !== null ||
    filters.fulfillment !== null ||
    filters.minCents !== null ||
    filters.maxCents !== null ||
    filters.sort !== DEFAULT_MARKETPLACE_FILTERS.sort;
  const resultTitle = rawQuery.trim()
    ? `Results for "${rawQuery.trim()}"`
    : selectedCategory
      ? selectedCategory.name
      : 'New arrivals';

  return (
    <MainLayout>
      <main className="mx-auto w-full max-w-[82rem] px-4 pb-28 pt-3 sm:px-5 lg:px-8 lg:pb-10 lg:pt-6">
        <header className="space-y-3">
          <div className="max-w-[calc(100%-5.75rem)] sm:max-w-none">
            <h1 className="text-[1.55rem] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              Marketplace
            </h1>
            <p className="mt-0.5 max-w-xl text-[13px] leading-5 text-muted-foreground sm:text-sm">
              Products from Twibs businesses, with delivery, pickup, and order tracking.
            </p>
          </div>

          <section
            aria-label="Marketplace tools"
            className="rounded-2xl border border-border bg-card/70 p-2.5 shadow-sm"
          >
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={rawQuery}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Search products or stores"
                  aria-label="Search the marketplace"
                  className="h-10 rounded-xl border-border/80 bg-background pl-9 pr-9 text-[14px]"
                />
                {rawQuery && (
                  <button
                    type="button"
                    onClick={() => updateSearch('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            <nav aria-label="Marketplace account" className="mt-2 grid grid-cols-3 gap-2">
              {user && (
                <HeaderLink to="/orders" label="Orders" icon={<PackageCheck className="h-4 w-4" aria-hidden />} />
              )}
              {user && <CartLink count={cartCount} />}
              <Button asChild className={cn('h-9 rounded-xl px-2 text-xs font-semibold', !user && 'col-span-3')}>
                <Link to={sellerCta}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {accounts.length > 0 ? 'List' : 'Sell'}
                </Link>
              </Button>
            </nav>

            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
              <Select
                value={filters.fulfillment ?? 'all'}
                onValueChange={(value) => update({ fulfillment: value === 'all' ? null : (value as MarketplaceFilters['fulfillment']) })}
              >
                <SelectTrigger className="h-9 rounded-xl text-xs sm:text-sm" aria-label="Filter by fulfilment">
                  <Truck className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue placeholder="Fulfilment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any fulfilment</SelectItem>
                  <SelectItem value="shipping">{FULFILLMENT_LABELS.shipping}</SelectItem>
                  <SelectItem value="pickup">{FULFILLMENT_LABELS.pickup}</SelectItem>
                  <SelectItem value="both">{FULFILLMENT_LABELS.both}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.sort} onValueChange={(value) => update({ sort: value as MarketplaceFilters['sort'] })}>
                <SelectTrigger className="h-9 rounded-xl text-xs sm:text-sm" aria-label="Sort results">
                  <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACE_SORTS.map((sort) => (
                    <SelectItem key={sort.value} value={sort.value}>
                      {sort.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <PriceInput
                label="Minimum price"
                placeholder="Min"
                onChange={(value) => update({ minCents: value })}
              />
              <PriceInput
                label="Maximum price"
                placeholder="Max"
                onChange={(value) => update({ maxCents: value })}
              />
            </div>
          </section>

          {categories && categories.length > 0 && (
            <div className="-mx-4 overflow-x-auto border-y border-border/80 px-4 py-1.5 [scrollbar-width:none] sm:mx-0 sm:border-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2">
                <CategoryChip active={filters.categoryId === null} onClick={() => update({ categoryId: null })}>
                  All
                </CategoryChip>
                {categories.map((category) => (
                  <CategoryChip
                    key={category.id}
                    active={filters.categoryId === category.id}
                    onClick={() => update({ categoryId: category.id })}
                  >
                    {category.name}
                  </CategoryChip>
                ))}
              </div>
            </div>
          )}
        </header>

        <MarketplaceSponsoredShowcase ads={sponsored} />

        <section className="mt-6" aria-labelledby="marketplace-results-title">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="marketplace-results-title" className="truncate text-xl font-bold tracking-tight">
                {hasActiveFilters ? resultTitle : 'New arrivals'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isFetching && !isLoading ? 'Refreshing products...' : `${data.length} shown on this page`}
              </p>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={clearFilters}>
                <X className="mr-1.5 h-4 w-4" aria-hidden />
                Clear
              </Button>
            )}
          </div>

          {hasActiveFilters && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {rawQuery.trim() && <ActivePill label={rawQuery.trim()} onClear={() => updateSearch('')} />}
              {selectedCategory && <ActivePill label={selectedCategory.name} onClear={() => update({ categoryId: null })} />}
              {filters.fulfillment && (
                <ActivePill label={FULFILLMENT_LABELS[filters.fulfillment]} onClear={() => update({ fulfillment: null })} />
              )}
              {filters.sort !== DEFAULT_MARKETPLACE_FILTERS.sort && (
                <ActivePill label={sortLabel} onClear={() => update({ sort: DEFAULT_MARKETPLACE_FILTERS.sort })} />
              )}
              {filters.minCents !== null && <ActivePill label={`From $${filters.minCents / 100}`} onClear={() => update({ minCents: null })} />}
              {filters.maxCents !== null && <ActivePill label={`To $${filters.maxCents / 100}`} onClear={() => update({ maxCents: null })} />}
            </div>
          )}

          {isLoading ? (
            <ProductSkeletonGrid />
          ) : error ? (
            <EmptyState
              title="Could not load products"
              body={(error as Error).message || 'Refresh and try again.'}
              action={<Button size="sm" variant="outline" onClick={() => window.location.reload()}>Refresh</Button>}
            />
          ) : data.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'No products match that search' : 'No products yet'}
              body={
                hasActiveFilters
                  ? 'Try fewer filters or a shorter product name.'
                  : 'When businesses publish approved products, they will appear here.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Clear filters
                  </Button>
                ) : (
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {data.flatMap((product, index) => {
                  const cards = [<ProductCard key={product.product_id} product={product} />];
                  if (index === 7 && gridSponsored[0]) {
                    cards.push(<MarketplaceSponsoredProductCard key={`ad-${gridSponsored[0].advertisement_id}`} ad={gridSponsored[0]} />);
                  }
                  return cards;
                })}
              </div>

              {(hasMore || page > 0) && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={page === 0 || isFetching}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                    Previous
                  </Button>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    Page {page + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={isFetching || !hasMore}
                  >
                    {isFetching ? 'Loading' : 'Next'}
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {!user && data.length > 0 && (
          <p className="mt-8 rounded-xl border border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
            <Link to="/auth" className="font-semibold text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>{' '}
            to save products, checkout, and message businesses.
          </p>
        )}
      </main>
    </MainLayout>
  );
}

function HeaderLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      to="/cart"
      className="relative inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
      aria-label={`Cart, ${count} items`}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden />
      <span className="truncate">Cart</span>
      {count > 0 && (
        <span className="grid min-w-4 place-items-center rounded-full bg-foreground px-1 py-0.5 text-[9px] font-bold text-background">
          {count}
        </span>
      )}
    </Link>
  );
}

function PriceInput({
  label,
  placeholder,
  onChange,
}: {
  label: string;
  placeholder: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
        $
      </span>
      <Input
        aria-label={label}
        className="h-9 rounded-xl pl-6 text-xs sm:text-sm"
        inputMode="decimal"
        min="0"
        step="0.01"
        type="number"
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value ? Math.max(0, Math.round(Number(event.target.value) * 100)) : null);
        }}
      />
    </label>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition sm:text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function ActivePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function ProductSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Store className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function usePagedSearch(filters: MarketplaceFilters, page: number) {
  const { data, isLoading, isFetching, error } = useMarketplaceSearch(filters, page);
  const items = useMemo(() => (data ?? []).filter((product) => product.is_public), [data]);
  return {
    data: items,
    isLoading,
    isFetching,
    error,
    hasMore: (data?.length ?? 0) === PAGE_SIZE,
  };
}
