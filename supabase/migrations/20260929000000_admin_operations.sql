-- Operational admin controls for businesses, commerce, communities and health.

ALTER TABLE public.interest_categories
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_list_businesses(p_status text DEFAULT 'all', p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, name text, username text, account_type text, category text, status text, owner_id uuid, owner_name text, owner_username text, product_count bigint, order_count bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT a.id, a.name, a.username, a.account_type::text, a.category, a.status::text, a.user_id,
    p.display_name, p.username,
    (SELECT count(*) FROM public.products pr WHERE pr.business_id = a.id),
    (SELECT count(*) FROM public.orders o WHERE o.business_id = a.id), a.created_at
  FROM public.advertiser_accounts a LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE (p_status = 'all' OR a.status::text = p_status)
    AND (p_search IS NULL OR btrim(p_search) = '' OR a.name ILIKE '%' || btrim(p_search) || '%' OR a.username ILIKE '%' || btrim(p_search) || '%')
  ORDER BY a.created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 250);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_business_status(p_business_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF p_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF p_status = 'suspended' AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'a suspension reason is required'; END IF;
  UPDATE public.advertiser_accounts SET status = p_status::public.advertiser_status, updated_at = now()
  WHERE id = p_business_id RETURNING name INTO v_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'business not found'; END IF;
  PERFORM public.audit_action('business_' || p_status, 'business', p_business_id::text, jsonb_build_object('name', v_name, 'reason', p_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_orders(p_status text DEFAULT 'all', p_search text DEFAULT NULL, p_limit integer DEFAULT 150)
RETURNS TABLE (id uuid, order_number text, business_id uuid, business_name text, customer_id uuid, customer_name text, customer_username text, status text, payment_status text, fulfillment text, total_cents bigint, currency text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT o.id, o.order_number, o.business_id, a.name, o.customer_id, p.display_name, p.username,
    o.status::text, o.payment_status::text, o.fulfillment::text, o.total_cents, o.currency, o.created_at, o.updated_at
  FROM public.orders o JOIN public.advertiser_accounts a ON a.id = o.business_id
  LEFT JOIN public.profiles p ON p.user_id = o.customer_id
  WHERE (p_status = 'all' OR o.status::text = p_status)
    AND (p_search IS NULL OR btrim(p_search) = '' OR o.order_number ILIKE '%' || btrim(p_search) || '%' OR a.name ILIKE '%' || btrim(p_search) || '%' OR p.username ILIKE '%' || btrim(p_search) || '%')
  ORDER BY o.created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 300);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order text; v_payment text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF p_status NOT IN ('pending','paid','processing','ready','shipped','completed','cancelled','refunded') THEN RAISE EXCEPTION 'invalid order status'; END IF;
  SELECT order_number, payment_status::text INTO v_order, v_payment FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF p_status = 'refunded' AND v_payment NOT IN ('refunded', 'partially_refunded') THEN RAISE EXCEPTION 'payment must be refunded by the payment provider first'; END IF;
  UPDATE public.orders SET status = p_status::public.order_status, updated_at = now(),
    completed_at = CASE WHEN p_status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE id = p_order_id;
  PERFORM public.audit_action('order_status_changed', 'order', p_order_id::text, jsonb_build_object('order_number', v_order, 'status', p_status, 'note', p_note));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_interest_categories()
RETURNS TABLE (id uuid, name text, icon text, color text, active boolean, sort_order integer, follower_count bigint, post_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT c.id, c.name, c.icon, c.color, c.active, c.sort_order,
    (SELECT count(*) FROM public.user_interests ui WHERE ui.category_id = c.id),
    (SELECT count(*) FROM public.interest_posts ip WHERE ip.category_id = c.id)
  FROM public.interest_categories c ORDER BY c.sort_order, c.name;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_save_interest_category(p_id uuid DEFAULT NULL, p_name text DEFAULT NULL, p_icon text DEFAULT 'laptop', p_color text DEFAULT '#64748B', p_active boolean DEFAULT true, p_sort_order integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) < 2 THEN RAISE EXCEPTION 'name is too short'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.interest_categories(name, icon, color, active, sort_order) VALUES (btrim(p_name), p_icon, p_color, p_active, p_sort_order) RETURNING id INTO v_id;
    PERFORM public.audit_action('interest_category_created', 'interest_category', v_id::text, jsonb_build_object('name', btrim(p_name)));
  ELSE
    UPDATE public.interest_categories SET name = btrim(p_name), icon = p_icon, color = p_color, active = p_active, sort_order = p_sort_order WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'category not found'; END IF;
    PERFORM public.audit_action('interest_category_updated', 'interest_category', v_id::text, jsonb_build_object('name', btrim(p_name), 'active', p_active));
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_groups(p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, name text, slug text, privacy text, creator_id uuid, creator_name text, creator_username text, member_count integer, post_count integer, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT g.id, g.name, g.slug, g.privacy, g.creator_id, p.display_name, p.username, g.member_count, g.post_count, g.created_at
  FROM public.groups g LEFT JOIN public.profiles p ON p.user_id = g.creator_id
  WHERE p_search IS NULL OR btrim(p_search) = '' OR g.name ILIKE '%' || btrim(p_search) || '%' OR g.slug ILIKE '%' || btrim(p_search) || '%'
  ORDER BY g.created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 250);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_platform_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object(
    'database_bytes', pg_database_size(current_database()), 'users', (SELECT count(*) FROM public.profiles),
    'open_reports', (SELECT count(*) FROM public.reports WHERE status::text IN ('open','reviewing')),
    'active_stories', (SELECT count(*) FROM public.stories WHERE expires_at > now()), 'groups', (SELECT count(*) FROM public.groups),
    'businesses', (SELECT count(*) FROM public.advertiser_accounts),
    'pending_products', (SELECT count(*) FROM public.products WHERE status::text = 'pending_review'),
    'open_orders', (SELECT count(*) FROM public.orders WHERE status::text NOT IN ('completed','cancelled','refunded')),
    'failed_payments', (SELECT count(*) FROM public.orders WHERE payment_status::text = 'failed'), 'checked_at', now());
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_businesses(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_business_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_orders(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_order_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_interest_categories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_interest_category(uuid,text,text,text,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_groups(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_platform_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_businesses(text,text,integer), public.admin_set_business_status(uuid,text,text), public.admin_list_orders(text,text,integer), public.admin_set_order_status(uuid,text,text), public.admin_list_interest_categories(), public.admin_save_interest_category(uuid,text,text,text,boolean,integer), public.admin_list_groups(text,integer), public.admin_platform_health() TO authenticated;

