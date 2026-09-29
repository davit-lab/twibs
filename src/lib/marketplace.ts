import type { Database } from '@/integrations/supabase/types';

type Fulfillment = Database['public']['Enums']['fulfillment_mode'];
type ProductStatus = Database['public']['Enums']['product_status'];
type OrderStatus = Database['public']['Enums']['order_status'];
type PaymentStatus = Database['public']['Enums']['marketplace_payment_status'];

/** Row shape returned by search_marketplace(). */
export interface MarketplaceProduct {
  product_id: string;
  business_id: string;
  business_name: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  fulfillment: Fulfillment;
  image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  location: string | null;
  published_at: string | null;
  /** False for a seller's own draft, which RLS lets them see. Never shown to a shopper. */
  is_public: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  value: string;
  sku: string | null;
  price_cents: number | null;
  inventory_count: number | null;
  unlimited_stock: boolean;
  is_active: boolean;
  position: number;
}

export interface ProductDetail extends MarketplaceProduct {
  /** Needed to link to the seller's existing /business/:username page. */
  business_username: string | null;
  category_id: string | null;
  tags: string[];
  shipping_price_cents: number;
  free_shipping_threshold_cents: number | null;
  inventory_tracking: boolean;
  moderation_note: string | null;
  product_status: ProductStatus;
  images: { id: string; url: string; position: number }[];
  variants: ProductVariant[];
}

export interface CartLine {
  line_id: string;
  product_id: string;
  variant_id: string | null;
  business_id: string;
  business_name: string;
  product_name: string;
  variant_label: string | null;
  image_url: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  available_quantity: number | null;
  is_available: boolean;
  unavailable_reason: string | null;
  fulfillment: Fulfillment;
}

export interface Storefront {
  business_id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  location: string | null;
  is_store_enabled: boolean;
  tagline: string | null;
  about: string | null;
  hero_image_url: string | null;
  shipping_note: string | null;
  pickup_note: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  product_count: number;
  rating_avg: number | null;
  review_count: number;
}

export interface Review {
  id: string;
  author_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  author_name?: string;
  author_avatar?: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export interface MarketplaceAd {
  advertisement_id: string;
  campaign_id: string;
  destination_type: 'product' | 'store' | 'business';
  product_id: string | null;
  headline: string;
  description: string | null;
  cta: string;
  image_url: string | null;
  business_id: string;
  business_name: string;
  business_username: string;
  business_avatar_url: string | null;
  product_name: string | null;
  product_price_cents: number | null;
  product_currency: string | null;
  /** Public explanation produced by the delivery function; never contains private targeting data. */
  why_text: string | null;
  delivery_score: number | null;
}

export type MarketplaceSort = 'recent' | 'relevance' | 'price_asc' | 'price_desc' | 'rating';

export const MARKETPLACE_SORTS: { value: MarketplaceSort; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'relevance', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  shipping: 'Delivery',
  pickup: 'Collection',
  both: 'Delivery or collection',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  approved: 'Live',
  rejected: 'Rejected',
  removed: 'Removed',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Preparing',
  ready: 'Ready',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/**
 * Status a seller is allowed to move an order to next. Mirrors the state machine
 * in the RLS migration: a business drives fulfilment only, and can never assert
 * paid or refunded. The UI offers exactly these so it never presents a move the
 * database will reject.
 */
export const SELLER_NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ['processing'],
  processing: ['ready'],
  ready: ['shipped', 'completed'],
  shipped: ['completed'],
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};

export const PLATFORM_FEE_RATE = 0.2;

export interface MarketplaceFilters {
  query: string;
  categoryId: string | null;
  fulfillment: Fulfillment | null;
  sort: MarketplaceSort;
  minCents: number | null;
  maxCents: number | null;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
  query: '',
  categoryId: null,
  fulfillment: null,
  sort: 'recent',
  minCents: null,
  maxCents: null,
};

/** Stable cache keys, so two marketplace surfaces can't serve each other stale rows. */
export const marketplaceKeys = {
  search: (f: MarketplaceFilters, page: number) =>
    ['marketplace', 'search', f.query, f.categoryId, f.fulfillment, f.sort, f.minCents, f.maxCents, page] as const,
  categories: () => ['marketplace', 'categories'] as const,
  product: (id: string | undefined) => ['marketplace', 'product', id] as const,
  storefront: (id: string | undefined) => ['marketplace', 'storefront', id] as const,
  cart: () => ['marketplace', 'cart'] as const,
  saved: (id: string | undefined) => ['marketplace', 'saved', id] as const,
  sponsored: (
    id: string | undefined,
    placement: 'showcase' | 'product_grid',
    categoryId: string | null,
    search: string
  ) => ['marketplace', 'sponsored', id, placement, categoryId, search] as const,
};

/**
 * Stock as a shopper should read it. Inventory is only authoritative on a
 * variant, so a product without one is unlimited rather than "unknown".
 */
export function stockLabel(variant?: ProductVariant | null, productTracksInventory?: boolean): string {
  if (!productTracksInventory) return 'In stock';
  if (!variant) return 'In stock';
  if (variant.unlimited_stock) return 'In stock';
  if (variant.inventory_count === null) return 'In stock';
  if (variant.inventory_count <= 0) return 'Out of stock';
  if (variant.inventory_count <= 3) return `Only ${variant.inventory_count} left`;
  return 'In stock';
}

export function isPurchasable(
  variant: ProductVariant | null | undefined,
  productTracksInventory: boolean
): boolean {
  if (!productTracksInventory) return true;
  if (!variant) return false;
  if (variant.unlimited_stock) return true;
  return (variant.inventory_count ?? 0) > 0;
}
