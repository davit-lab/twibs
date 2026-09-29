import { productThumbnail } from '@/lib/productMedia';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessAssetUpload } from '@/hooks/useBusinessAssetUpload';
import { marketplaceKeys } from '@/lib/marketplace';
import type { Database } from '@/integrations/supabase/types';

type Fulfillment = Database['public']['Enums']['fulfillment_mode'];

export interface SellerProduct {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  tags: string[];
  price_cents: number;
  currency: string;
  status: Database['public']['Enums']['product_status'];
  moderation_note: string | null;
  fulfillment: Fulfillment;
  shipping_price_cents: number;
  free_shipping_threshold_cents: number | null;
  inventory_tracking: boolean;
  created_at: string;
  images: { id: string; url: string; position: number }[];
  variants: {
    id: string;
    name: string;
    value: string;
    sku: string | null;
    price_cents: number | null;
    inventory_count: number | null;
    unlimited_stock: boolean;
    is_active: boolean;
  }[];
}

export interface ProductDraft {
  name: string;
  description: string;
  categoryId: string | null;
  tags: string;
  priceCents: number;
  fulfillment: Fulfillment;
  shippingPriceCents: number;
  freeShippingThresholdCents: number | null;
  inventoryTracking: boolean;
  // 'approved' is only ever set by a moderator, but a seller editing an
  // already-approved listing must send it back unchanged or it would demote
  // itself to a draft and vanish from the marketplace.
  status: 'draft' | 'pending_review' | 'approved';
  variants: {
    name: string;
    value: string;
    priceCents: number | null;
    inventoryCount: number | null;
    unlimitedStock: boolean;
  }[];
}

export const emptyProductDraft = (): ProductDraft => ({
  name: '',
  description: '',
  categoryId: null,
  tags: '',
  priceCents: 0,
  fulfillment: 'shipping',
  shippingPriceCents: 0,
  freeShippingThresholdCents: null,
  inventoryTracking: false,
  status: 'draft',
  variants: [],
});

/** Everything the seller's Store tab needs about one catalogue. */
export function useBusinessProducts(businessId: string | undefined, page = 0) {
  return useQuery<SellerProduct[]>({
    queryKey: ['marketplace', 'business-products', businessId, page],
    queryFn: async () => {
      if (!businessId) return [];
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false }).range(page * 24, page * 24 + 23);
      if (error) throw error;

      const ids = (data ?? []).map((p) => p.id);
      if (ids.length === 0) return [];

      // Images and variants are read in two round trips rather than an
      // embedded select, so a catalogue of any size costs the same 3 queries.
      const [images, variants] = await Promise.all([
        supabase.from('product_images').select('id, product_id, url, position').in('product_id', ids),
        supabase
          .from('product_variants')
          .select(
            'id, product_id, name, value, sku, price_cents, inventory_count, unlimited_stock, is_active'
          )
          .in('product_id', ids)
          .order('position'),
      ]);
      if (images.error) throw images.error;
      if (variants.error) throw variants.error;

      return (data ?? []).map((p) => ({
        id: p.id,
        business_id: p.business_id,
        name: p.name,
        description: p.description,
        category_id: p.category_id,
        tags: p.tags ?? [],
        price_cents: p.price_cents,
        currency: p.currency,
        status: p.status,
        moderation_note: p.moderation_note,
        fulfillment: p.fulfillment,
        shipping_price_cents: p.shipping_price_cents,
        free_shipping_threshold_cents: p.free_shipping_threshold_cents,
        inventory_tracking: p.inventory_tracking,
        created_at: p.created_at,
        images: (images.data ?? [])
          .filter((i) => i.product_id === p.id)
          .map((i) => ({ id: i.id, url: i.url, position: i.position ?? 0 }))
          .sort((a, b) => a.position - b.position),
        variants: (variants.data ?? [])
          .filter((v) => v.product_id === p.id)
          .map((v) => ({
            id: v.id,
            name: v.name,
            value: v.value,
            sku: v.sku,
            price_cents: v.price_cents,
            inventory_count: v.inventory_count,
            unlimited_stock: v.unlimited_stock,
            is_active: v.is_active,
          })),
      }));
    },
    enabled: !!businessId,
  });
}

function useInvalidateProducts(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'business-products', businessId] });
    // A seller's own listing changing must also refresh the browse surfaces.
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'search'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'storefront'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace', 'product'] });
  };
}

export function useCreateProduct(businessId: string | undefined) {
  const { user } = useAuth();
  const invalidate = useInvalidateProducts(businessId);

  return useMutation({
    mutationFn: async (draft: ProductDraft) => {
      if (!user) throw new Error('Sign in to create a product');
      if (!businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('products')
        .insert({
          business_id: businessId,
          created_by: user.id,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          category_id: draft.categoryId,
          tags: draft.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
          price_cents: draft.priceCents,
          fulfillment: draft.fulfillment,
          shipping_price_cents: draft.shippingPriceCents,
          free_shipping_threshold_cents: draft.freeShippingThresholdCents,
          inventory_tracking: draft.inventoryTracking,
          status: draft.status,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (draft.variants.length > 0) {
        const { error: vErr } = await supabase.from('product_variants').insert(
          draft.variants.map((v, i) => ({
            product_id: data.id,
            name: v.name.trim(),
            value: v.value.trim(),
            price_cents: v.priceCents,
            inventory_count: v.unlimitedStock ? null : v.inventoryCount,
            unlimited_stock: v.unlimitedStock,
            position: i,
          }))
        );
        if (vErr) throw vErr;
      }
      return data.id;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);

  return useMutation({
    mutationFn: async ({ productId, draft }: { productId: string; draft: ProductDraft }) => {
      const { error } = await supabase
        .from('products')
        .update({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          category_id: draft.categoryId,
          tags: draft.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
          price_cents: draft.priceCents,
          fulfillment: draft.fulfillment,
          shipping_price_cents: draft.shippingPriceCents,
          free_shipping_threshold_cents: draft.freeShippingThresholdCents,
          inventory_tracking: draft.inventoryTracking,
          status: draft.status,
        })
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProduct(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/**
 * Unpublishes a live listing back to draft.
 *
 * Deliberately NOT `status = 'removed'`: guard_product_moderation() reserves
 * `removed` for moderation takedowns and raises for any seller. A seller
 * stopping a listing is `approved -> draft`, which keeps it editable and
 * preserves its order history. Going live again means re-submitting for review.
 */
export function useUnpublishProduct(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .update({ status: 'draft' })
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateVariant(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async ({
      variantId,
      inventoryCount,
      unlimitedStock,
      priceCents,
    }: {
      variantId: string;
      inventoryCount: number | null;
      unlimitedStock: boolean;
      priceCents: number | null;
    }) => {
      const { error } = await supabase
        .from('product_variants')
        .update({
          inventory_count: unlimitedStock ? null : inventoryCount,
          unlimited_stock: unlimitedStock,
          price_cents: priceCents,
        })
        .eq('id', variantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAddVariant(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async ({
      productId,
      name,
      value,
      priceCents,
      inventoryCount,
      unlimitedStock,
      position,
    }: {
      productId: string;
      name: string;
      value: string;
      priceCents: number | null;
      inventoryCount: number | null;
      unlimitedStock: boolean;
      position: number;
    }) => {
      const { error } = await supabase.from('product_variants').insert({
        product_id: productId,
        name: name.trim(),
        value: value.trim(),
        price_cents: priceCents,
        inventory_count: unlimitedStock ? null : inventoryCount,
        unlimited_stock: unlimitedStock,
        position,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteVariant(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async (variantId: string) => {
      const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Uploads a product image, then records it. Storage is written first because
 * the row stores the resulting public URL — and if the row insert fails, the
 * object is removed again so the bucket does not accumulate orphans.
 */
export function useUploadProductImage(businessId: string | undefined) {
  const { upload } = useBusinessAssetUpload();
  const invalidate = useInvalidateProducts(businessId);

  return useMutation({
    mutationFn: async ({ productId, file, position }: { productId: string; file: File; position: number }) => {
      if (!businessId) throw new Error('No business selected');
      const url = await upload({ kind: 'product', file, businessId });
      let thumbnailUrl = url;
      try {
        const thumbnail = await productThumbnail(file);
        thumbnailUrl = await upload({ kind: 'product', file, blob: thumbnail, businessId });
      } catch (error) {
        // The original is already durable and valid. A browser-specific local
        // thumbnail failure must not discard the seller's product photo.
        console.warn('[marketplace] thumbnail generation failed; using original', error);
      }
      const path = decodeURIComponent(url.split('/object/public/product-images/')[1] ?? '');

      const { data, error } = await supabase
        .from('product_images')
        .insert({ product_id: productId, storage_path: path, url, position, thumbnail_url: thumbnailUrl }).select('id').single();
      if (error) {
        const thumbnailPath = decodeURIComponent(thumbnailUrl.split('/object/public/product-images/')[1] ?? '');
        await supabase.storage.from('product-images').remove([...new Set([path, thumbnailPath].filter(Boolean))]).then(() => undefined, () => undefined);
        throw error;
      }
      return { id: data.id, url };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteProductImage(businessId: string | undefined) {
  const invalidate = useInvalidateProducts(businessId);
  return useMutation({
    mutationFn: async ({ imageId, storagePath }: { imageId: string; storagePath: string }) => {
      const { error } = await supabase.from('product_images').delete().eq('id', imageId);
      if (error) throw error;
      if (storagePath) {
        await supabase.storage
          .from('product-images')
          .remove([storagePath])
          .then(() => undefined, () => undefined);
      }
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export interface StoreSettingsDraft {
  isStoreEnabled: boolean;
  tagline: string;
  about: string;
  heroImageUrl: string | null;
  shippingNote: string;
  pickupNote: string;
  city: string;
  region: string;
  country: string;
}

export function useStoreSettings(businessId: string | undefined) {
  return useQuery<StoreSettingsDraft | null>({
    queryKey: ['marketplace', 'store-settings', businessId],
    queryFn: async () => {
      if (!businessId) return null;
      const { data, error } = await supabase
        .from('business_store_settings')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        isStoreEnabled: data.is_store_enabled,
        tagline: data.tagline ?? '',
        about: data.about ?? '',
        heroImageUrl: data.hero_image_url,
        shippingNote: data.shipping_note ?? '',
        pickupNote: data.pickup_note ?? '',
        city: data.city ?? '',
        region: data.region ?? '',
        country: data.country ?? '',
      };
    },
    enabled: !!businessId,
  });
}

export function useSaveStoreSettings(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: StoreSettingsDraft) => {
      if (!businessId) throw new Error('No business selected');
      const { error } = await supabase.from('business_store_settings').upsert(
        {
          business_id: businessId,
          is_store_enabled: draft.isStoreEnabled,
          tagline: draft.tagline.trim() || null,
          about: draft.about.trim() || null,
          hero_image_url: draft.heroImageUrl,
          shipping_note: draft.shippingNote.trim() || null,
          pickup_note: draft.pickupNote.trim() || null,
          city: draft.city.trim() || null,
          region: draft.region.trim() || null,
          country: draft.country.trim() || null,
        }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['marketplace', 'store-settings', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['marketplace', 'storefront'] });
    },
  });
}
