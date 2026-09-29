-- Staff moderation for Marketplace products. Sellers still cannot approve,
-- reject or remove their own listing.

CREATE OR REPLACE FUNCTION public.guard_product_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      IF current_setting('role', true) <> 'service_role' AND NOT public.is_admin_or_moderator() THEN
        RAISE EXCEPTION 'Only moderation can set a product to %', NEW.status
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF NEW.status IN ('approved', 'pending_review') AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_marketplace_products(
  p_status text DEFAULT 'pending_review',
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  product_id uuid,
  business_id uuid,
  business_name text,
  business_username text,
  product_name text,
  description text,
  price_cents bigint,
  currency text,
  status text,
  moderation_note text,
  image_url text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending_review', 'approved', 'rejected', 'removed', 'all') THEN
    RAISE EXCEPTION 'Invalid product status';
  END IF;
  RETURN QUERY
  SELECT p.id, p.business_id, a.name, a.username, p.name, p.description,
    p.price_cents, p.currency, p.status::text, p.moderation_note,
    COALESCE(i.thumbnail_url, i.url), COALESCE(p.published_at, p.created_at)
  FROM public.products p
  JOIN public.advertiser_accounts a ON a.id = p.business_id
  LEFT JOIN LATERAL (
    SELECT pi.url, pi.thumbnail_url FROM public.product_images pi
    WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at LIMIT 1
  ) i ON true
  WHERE p_status = 'all' OR p.status::text = p_status
  ORDER BY COALESCE(p.published_at, p.created_at) DESC
  LIMIT greatest(1, least(p_limit, 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_product(
  p_product_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products;
  v_next public.product_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF p_action = 'approve' THEN
    IF v_product.status <> 'pending_review' THEN RAISE EXCEPTION 'Only submitted products can be approved'; END IF;
    v_next := 'approved';
  ELSIF p_action = 'reject' THEN
    IF v_product.status <> 'pending_review' THEN RAISE EXCEPTION 'Only submitted products can be rejected'; END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
    v_next := 'rejected';
  ELSIF p_action = 'remove' THEN
    IF v_product.status NOT IN ('approved', 'pending_review') THEN RAISE EXCEPTION 'This product cannot be removed'; END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A removal reason is required'; END IF;
    v_next := 'removed';
  ELSE
    RAISE EXCEPTION 'Unsupported moderation action';
  END IF;

  UPDATE public.products SET
    status = v_next,
    moderation_note = CASE WHEN v_next = 'approved' THEN NULL ELSE left(trim(p_reason), 1000) END,
    updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id, business_id)
  VALUES (
    v_product.created_by,
    'product_moderation',
    CASE WHEN v_next = 'approved' THEN 'Product approved' WHEN v_next = 'rejected' THEN 'Product needs changes' ELSE 'Product removed' END,
    CASE WHEN v_next = 'approved' THEN v_product.name || ' is now live in Marketplace' ELSE left(trim(p_reason), 1000) END,
    auth.uid(), 'product', v_product.id, v_product.business_id
  );
  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_marketplace_products(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_moderate_product(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_marketplace_products(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_product(uuid,text,text) TO authenticated;
