import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  marketplaceKeys,
  type CartLine,
  type MarketplaceFilters,
  type MarketplaceAd,
  type MarketplaceProduct,
  type ProductCategory,
  type ProductDetail,
  type Review,
  type Storefront,
} from '@/lib/marketplace';

const PAGE_SIZE = 24;

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function useProductCategories() {
  return useQuery<ProductCategory[]>({
    queryKey: marketplaceKeys.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name, slug, sort_order')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ProductCategory[];
    },
    staleTime: 1000 * 60 * 30,
  });
}

// ---------------------------------------------------------------------------
// Search / browse
// ---------------------------------------------------------------------------

export function useMarketplaceSearch(filters: MarketplaceFilters, page = 0) {
  return useQuery<MarketplaceProduct[]>({
    queryKey: marketplaceKeys.search(filters, page),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_marketplace', {
        p_query: filters.query || null,
        p_category_id: filters.categoryId,
        p_fulfillment: filters.fulfillment,
        p_sort: filters.sort,
        p_min_cents: filters.minCents,
        p_max_cents: filters.maxCents,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as MarketplaceProduct[];
    },
    // Filters live in the query key, so an aborted keystroke can never paint
    // results that belong to a previous term.
    placeholderData: (prev) => prev,
  });
}

type MarketplaceAdPlacement = 'showcase' | 'product_grid';

function marketplaceSessionKey(): string {
  const storageKey = 'twibs_marketplace_ad_session';
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(storageKey, value);
    return value;
  } catch {
    return 'marketplace-session';
  }
}

export function useMarketplaceAds({
  enabled,
  placement = 'showcase',
  categoryId = null,
  search = '',
  limit = 3,
}: {
  enabled: boolean;
  placement?: MarketplaceAdPlacement;
  categoryId?: string | null;
  search?: string;
  limit?: number;
}) {
  const { user } = useAuth();
  const normalizedSearch = search.trim().slice(0, 80);
  return useQuery<MarketplaceAd[]>({
    queryKey: marketplaceKeys.sponsored(user?.id, placement, categoryId, normalizedSearch),
    queryFn: async () => {
      if (!user) return [];
      const marketplaceRpc = supabase.rpc.bind(supabase) as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await marketplaceRpc('get_marketplace_ads', {
        p_viewer_id: user.id,
        p_placement: placement,
        p_category_id: categoryId,
        p_search_context: normalizedSearch || null,
        p_session_key: marketplaceSessionKey(),
        p_limit: limit,
        p_frequency_cap: 3,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as MarketplaceAd[];
    },
    enabled: enabled && !!user,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

export function useProduct(productId: string | undefined) {
  return useQuery<ProductDetail>({
    queryKey: marketplaceKeys.product(productId),
    queryFn: async () => {
      if (!productId) throw new Error('Missing product');
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Product not found');

      const [images, variants, reviews, seller] = await Promise.all([
        supabase
          .from('product_images')
          .select('id, url, position')
          .eq('product_id', productId)
          .order('position'),
        supabase
          .from('product_variants')
          .select('*')
          .eq('product_id', productId)
          .order('position'),
        supabase
          .from('product_reviews')
          .select('id, author_id, rating, body, created_at')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('advertiser_accounts')
          .select('id, name, username, avatar_url, location')
          .eq('id', data.business_id)
          .maybeSingle(),
      ]);

      for (const result of [images, variants, reviews, seller]) if (result.error) throw result.error;

      const ratingAvg =
        reviews.data && reviews.data.length
          ? reviews.data.reduce((sum, r) => sum + r.rating, 0) / reviews.data.length
          : null;

      return {
        product_id: data.id,
        business_id: data.business_id,
        business_name: seller.data?.name ?? 'Business',
        business_username: seller.data?.username ?? null,
        name: data.name,
        description: data.description,
        price_cents: data.price_cents,
        currency: data.currency,
        fulfillment: data.fulfillment,
        image_url: images.data?.[0]?.url ?? null,
        rating_avg: ratingAvg,
        review_count: reviews.data?.length ?? 0,
        location: seller.data?.location ?? data.location,
        published_at: data.published_at,
        is_public: data.status === 'approved',
        category_id: data.category_id,
        tags: data.tags ?? [],
        shipping_price_cents: data.shipping_price_cents,
        free_shipping_threshold_cents: data.free_shipping_threshold_cents,
        inventory_tracking: data.inventory_tracking,
        moderation_note: data.moderation_note,
        product_status: data.status,
        images: (images.data ?? []).map((i) => ({ id: i.id, url: i.url, position: i.position ?? 0 })),
        variants: (variants.data ?? []).map((v) => ({
          id: v.id,
          product_id: v.product_id,
          name: v.name,
          value: v.value,
          sku: v.sku,
          price_cents: v.price_cents,
          inventory_count: v.inventory_count,
          unlimited_stock: v.unlimited_stock,
          is_active: v.is_active,
          position: v.position ?? 0,
        })),
      } satisfies ProductDetail;
    },
    enabled: !!productId,
  });
}

/**
 * Records a real view. Silent by design: an analytics write must never block or
 * break the page it is measuring, and only a signed-in shopper can be recorded
 * (the events policy pins user_id to the caller).
 *
 * business_id is passed in rather than looked up: the events policy requires it
 * to equal the product's real owner, and a view is only worth recording once the
 * product has loaded anyway.
 */
export function useRecordProductView(
  productId: string | undefined,
  businessId: string | undefined,
  isPublic: boolean
) {
  const { user } = useAuth();
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (!productId || !businessId || !user || !isPublic) return;
    if (recorded.current === productId) return;
    recorded.current = productId;
    void supabase
      .from('product_events')
      .insert({ product_id: productId, business_id: businessId, user_id: user.id, event_type: 'view' })
      .then(({ error }) => {
        if (error) recorded.current = null;
      });
  }, [productId, businessId, user, isPublic]);
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

export function useStorefront(businessId: string | undefined) {
  return useQuery<Storefront | null>({
    queryKey: marketplaceKeys.storefront(businessId),
    queryFn: async () => {
      if (!businessId) return null;
      const { data, error } = await supabase.rpc('get_business_storefront', {
        p_business_id: businessId,
      });
      if (error) throw error;
      return (data as unknown as Storefront | null) ?? null;
    },
    enabled: !!businessId,
  });
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export function useCartQuote(enabled: boolean) {
  const { user } = useAuth();
  return useQuery<CartLine[]>({
    queryKey: [...marketplaceKeys.cart(), user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cart_quote');
      if (error) throw error;
      return (data ?? []) as CartLine[];
    },
    enabled,
  });
}

export function useCartCount(enabled: boolean) {
  const { identity } = useActiveIdentity();
  const canShop = enabled && identity.type === 'personal';
  const { data } = useCartQuote(canShop);
  return canShop ? (data ?? []).reduce((sum, line) => sum + line.quantity, 0) : 0;
}

/**
 * Adds to the cart. Quantity is folded into the existing line rather than
 * inserting a duplicate, because the uniqueness rule keys on
 * (user, product, variant) and an expression index cannot be targeted by a
 * client-side upsert.
 */
export function useAddToCart() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      productId,
      variantId,
      quantity,
    }: {
      productId: string;
      variantId: string | null;
      quantity: number;
    }) => {
      if (!user) throw new Error('Sign in to add to your cart');
      const qty = Math.max(1, Math.floor(quantity));

      // The "no variant" line is a real case, and .is() needs a literal null,
      // so the two shapes are queried separately rather than unified.
      const base = supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', productId);
      const { data: existing, error: findError } = variantId
        ? await base.eq('variant_id', variantId)
        : await base.is('variant_id', null);
      if (findError) throw findError;

      const line = existing?.[0];
      if (line) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: line.quantity + qty })
          .eq('id', line.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('cart_items')
        .insert({ user_id: user.id, product_id: productId, variant_id: variantId, quantity: qty });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.cart() });
    },
  });
}

export function useUpdateCartQuantity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineId, quantity }: { lineId: string; quantity: number }) => {
      if (quantity <= 0) {
        const { error } = await supabase.from('cart_items').delete().eq('id', lineId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: Math.floor(quantity) })
        .eq('id', lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.cart() });
    },
  });
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase.from('cart_items').delete().eq('id', lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.cart() });
    },
  });
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

export function useIsSaved(productId: string | undefined, enabled: boolean) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: [...marketplaceKeys.saved(productId), user?.id],
    queryFn: async () => {
      if (!user || !productId) return false;
      const { data, error } = await supabase
        .from('saved_products')
        .select('id')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: enabled && !!user && !!productId,
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) => {
      if (!user) throw new Error('Sign in to save products');
      if (saved) {
        const { error } = await supabase
          .from('saved_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('saved_products')
        .insert({ user_id: user.id, product_id: productId });
      // A duplicate save is not a failure worth surfacing to the shopper.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['marketplace', 'saved'] });
    },
  });
}

/** Convenience wrapper: toggles a save and records the event. */
export function useSaveProduct(productId: string | undefined, businessId: string | undefined) {
  const { user } = useAuth();
  const { data: saved } = useIsSaved(productId, !!user);
  const toggle = useToggleSave();

  const onToggle = useCallback(() => {
    if (!productId || !user) return;
    toggle.mutate({ productId, saved: !!saved });
    if (!saved && businessId) {
      void supabase.from('product_events').insert({
        product_id: productId,
        business_id: businessId,
        user_id: user.id,
        event_type: 'save',
      });
    }
  }, [productId, businessId, user, saved, toggle]);

  return { saved: !!saved, onToggle, isPending: toggle.isPending };
}
