-- ============================================================================
-- ADD business_id TO NOTIFICATIONS
-- ============================================================================
-- This migration adds the business_id column to notifications for identity-scoped
-- notification queries (personal vs business inbox).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_identity
  ON public.notifications(user_id, business_id, created_at DESC);

-- Backfill existing notifications with business_id from related conversations
-- where applicable (e.g., message notifications)
UPDATE public.notifications n
SET business_id = c.business_id
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE n.target_type = 'conversation'
  AND n.target_id = m.conversation_id
  AND n.business_id IS NULL
  AND c.business_id IS NOT NULL;

-- Also backfill for order-related notifications
UPDATE public.notifications n
SET business_id = o.business_id
FROM public.orders o
WHERE n.target_type = 'order'
  AND n.target_id = o.id
  AND n.business_id IS NULL
  AND o.business_id IS NOT NULL;

-- Also backfill for product-related notifications
UPDATE public.notifications n
SET business_id = p.business_id
FROM public.products p
WHERE n.target_type = 'product'
  AND n.target_id = p.id
  AND n.business_id IS NULL
  AND p.business_id IS NOT NULL;