-- Business/account creation: correct HTTP semantics + a unified entry point.
--
-- WHY
-- create_business_account() raised every failure with a bare
--   RAISE EXCEPTION '<text>'
-- which carries SQLSTATE P0001. PostgREST maps P0001 to a generic HTTP 400, so
-- the client could not distinguish "you are not allowed" from "that username
-- is taken" from "the server blew up", and the UI had nothing actionable to
-- show the user.
--
-- This migration:
--   1. Re-implements create_business_account() with explicit SQLSTATEs:
--        42501 insufficient_privilege -> HTTP 403  (PERMISSION_DENIED)
--        P0002 no_data_found           -> HTTP 404  (NOT_FOUND)
--        23505 unique_violation        -> HTTP 409  (CONFLICT)
--        22023 invalid_parameter_value -> HTTP 400  (VALIDATION)
--      The signature and return type are unchanged, so every existing caller
--      keeps working and no client change is required to benefit.
--   2. Adds create_account(), a single dispatcher for all account types
--      (personal + business/creator/organization/project) so account creation
--      has one canonical entry point instead of one RPC per model.
--   3. Revokes the implicit PUBLIC/anon EXECUTE grant on the business RPCs.
--      Postgres grants EXECUTE to PUBLIC on every new function by default,
--      which meant `anon` could invoke SECURITY DEFINER business functions.
--      Each function is re-granted to `authenticated` only.
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION and REVOKE/GRANT are all re-runnable.

-- =============================================
-- Harden + keep signature stable
-- =============================================
-- CREATE OR REPLACE refuses to rename input parameters, and the exact input
-- names are part of the contract PostgREST uses to build /rpc payloads
-- (p_account_type, p_name, p_username, ...). Drop the old overload explicitly
-- so the signature + parameter names are always rebuilt exactly as specified.
-- A DROP is also safe when the function is absent, which keeps this re-runnable.
DROP FUNCTION IF EXISTS public.create_business_account(
  public.advertiser_account_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);

-- Remove any short/legacy 9-parameter variant of the same name so a single
-- unambiguous overload remains. Without this, PostgREST cannot resolve the
-- /rpc/create_business_account payload and raises PGRST203.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_business_account'
      AND array_length(p.proargtypes, 1) <> 10
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_business_account(
  p_account_type public.advertiser_account_type,
  p_name TEXT,
  p_username TEXT,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_goals TEXT[] DEFAULT '{}'
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.advertiser_accounts;
  v_user_id UUID := auth.uid();
BEGIN
  ------------------------------------------------------------------
  -- PERMISSION_DENIED (403)
  ------------------------------------------------------------------
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a business account'
      USING ERRCODE = '42501';
  END IF;

  ------------------------------------------------------------------
  -- VALIDATION (400)
  ------------------------------------------------------------------
  IF p_account_type IS NULL
     OR p_account_type NOT IN ('business', 'creator', 'organization', 'project') THEN
    RAISE EXCEPTION 'Choose a valid account type: business, creator, organization or project'
      USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Name must be 100 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF p_username IS NULL
     OR char_length(p_username) NOT BETWEEN 3 AND 30
     OR p_username !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers or underscores'
      USING ERRCODE = '22023';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF p_website IS NOT NULL AND p_website <> '' AND p_website !~ '^https?://' THEN
    RAISE EXCEPTION 'Website must start with http:// or https://'
      USING ERRCODE = '22023';
  END IF;

  IF p_goals IS NOT NULL AND cardinality(p_goals) > 10 THEN
    RAISE EXCEPTION 'Choose no more than 10 goals'
      USING ERRCODE = '22023';
  END IF;

  ------------------------------------------------------------------
  -- CONFLICT (409) - pre-checked for a clean message; the UNIQUE
  -- constraint on advertiser_accounts.username still guards the race.
  ------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.advertiser_accounts WHERE username = p_username) THEN
    RAISE EXCEPTION 'That username is already taken'
      USING ERRCODE = '23505';
  END IF;

  ------------------------------------------------------------------
  -- Delegate. Any residual failure from the shared creator is
  -- normalised to VALIDATION so no bare P0001/500 leaks to the client.
  ------------------------------------------------------------------
  BEGIN
    SELECT * INTO v_account
    FROM public.create_advertiser_account(
      p_account_type, p_name, p_username, p_category, p_description,
      p_avatar_url, p_cover_url, p_website, NULL, NULL, p_location
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'That username is already taken'
        USING ERRCODE = '23505';
    WHEN others THEN
      RAISE EXCEPTION '%', SQLERRM
        USING ERRCODE = '22023';
  END;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Could not create the account, please try again'
      USING ERRCODE = 'P0002';
  END IF;

  ------------------------------------------------------------------
  -- Seed the business scaffolding (owner membership, settings, wallet)
  ------------------------------------------------------------------
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_account.id, v_user_id, 'owner')
  ON CONFLICT (business_id, user_id) DO NOTHING;

  INSERT INTO public.business_settings (business_id, discovery_priority, quality_signals, audience_expansion)
  VALUES (v_account.id, 'normal', '{}'::jsonb, true)
  ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO public.business_balances (business_id, balance_cents, currency)
  VALUES (v_account.id, 0, 'USD')
  ON CONFLICT (business_id) DO NOTHING;

  -- RETURNING keeps the response row in sync with what was just written;
  -- otherwise the caller would receive the pre-update row (e.g. empty goals).
  UPDATE public.advertiser_accounts
  SET goals = COALESCE(p_goals, '{}'::text[])
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  RETURN v_account;
END;
$$;

-- =============================================
-- Unified account creation entry point
-- One RPC for every account type. `personal` accounts are advertising
-- identities only; business-like types get the full business scaffolding
-- (owner membership row, settings, wallet) so every business in the product
-- is a real team regardless of which screen created it.
-- =============================================
DROP FUNCTION IF EXISTS public.create_account(
  public.advertiser_account_type, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);

CREATE OR REPLACE FUNCTION public.create_account(
  p_account_type public.advertiser_account_type,
  p_name TEXT,
  p_username TEXT,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_goals TEXT[] DEFAULT '{}',
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.advertiser_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create an account'
      USING ERRCODE = '42501';
  END IF;

  IF p_account_type = 'personal' THEN
    RETURN public.create_advertiser_account(
      p_account_type, p_name, p_username, p_category, p_description,
      p_avatar_url, p_cover_url, p_website, p_contact_email, p_contact_phone, p_location
    );
  END IF;

  v_account := public.create_business_account(
    p_account_type, p_name, p_username, p_category, p_description,
    p_avatar_url, p_cover_url, p_website, p_location, p_goals
  );

  -- create_business_account intentionally keeps a stable 10-argument signature
  -- (it is the public /rpc contract), so contact details are applied here.
  IF (p_contact_email IS NOT NULL AND p_contact_email <> '')
     OR (p_contact_phone IS NOT NULL AND p_contact_phone <> '') THEN
    UPDATE public.advertiser_accounts
    SET contact_email = COALESCE(NULLIF(p_contact_email, ''), contact_email),
        contact_phone = COALESCE(NULLIF(p_contact_phone, ''), contact_phone)
    WHERE id = v_account.id
    RETURNING * INTO v_account;
  END IF;

  RETURN v_account;
END;
$$;

-- =============================================
-- Grants: authenticated only (drop the implicit PUBLIC/anon default)
-- =============================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_business_account', 'create_account', 'get_business_accounts',
        'update_business_profile', 'update_business_settings',
        'get_business_overview', 'get_business_insights', 'get_business_audience',
        'get_business_billing', 'get_business_campaigns', 'get_business_profile',
        'credit_business_balance', 'add_business_member',
        'update_business_member_role', 'remove_business_member',
        'create_business_campaign', 'create_boost_campaign',
        'submit_boost_campaign', 'is_business_member', 'get_business_role',
        'can_manage_business_campaigns', 'can_admin_business', 'can_follow_business'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
