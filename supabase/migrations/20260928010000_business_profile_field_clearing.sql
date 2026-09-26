-- Allow business profile fields to be cleared (removed), not just replaced.
--
-- PROBLEM
-- public.update_business_profile built its UPDATE with COALESCE() for every
-- column:
--     avatar_url = COALESCE(p_avatar_url, avatar_url)
--     description = COALESCE(NULLIF(trim(p_description), ''), description)
-- That conflates "argument not supplied" with "argument explicitly NULL", so a
-- caller could never remove a profile picture, a cover, a bio, a website or a
-- location -- the old value was always kept. The profile editor therefore had
-- no way to implement the required "change / remove" behaviour.
--
-- FIX
-- 1. Add p_clear_avatar / p_clear_cover booleans. Media needs an explicit flag
--    because NULL is already overloaded to mean "leave unchanged".
-- 2. For the genuinely optional text columns, adopt the intuitive editor
--    contract: NULL = leave unchanged, '' = clear, anything else = set.
-- 3. name and username keep their existing hard validation (they are NOT NULL
--    and an empty value is rejected up front), so they can never be blanked.
-- 4. goals keeps COALESCE: an empty array is a valid state, not a clear.
--
-- Unchanged: the auth check, the can_admin_business gate, and the "username is
-- already taken" guard all still run first, so this only widens what an
-- already-authorised owner/admin can do.

-- The previous 10-argument overload MUST be dropped. CREATE OR REPLACE keys on
-- the argument list, so redefining with two extra booleans silently *adds* an
-- overload instead of replacing it. Leaving both in place makes every PostgREST
-- call to this name ambiguous.
DROP FUNCTION IF EXISTS public.update_business_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.update_business_profile(
  p_business_id UUID,
  p_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_cover_url TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_goals TEXT[] DEFAULT NULL,
  p_clear_avatar BOOLEAN DEFAULT FALSE,
  p_clear_cover BOOLEAN DEFAULT FALSE
)
RETURNS public.advertiser_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.advertiser_accounts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_business(p_business_id) THEN
    RAISE EXCEPTION 'You must be an owner or admin of this business' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NOT NULL AND (trim(p_name) = '' OR char_length(p_name) > 100) THEN
    RAISE EXCEPTION 'Name is invalid' USING ERRCODE = '22023';
  END IF;

  IF p_username IS NOT NULL AND (
     char_length(p_username) < 3 OR char_length(p_username) > 30 OR p_username !~ '^[a-zA-Z0-9_]+$') THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only letters, numbers or underscores'
      USING ERRCODE = '22023';
  END IF;

  IF p_username IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.advertiser_accounts
    WHERE username = p_username AND id <> p_business_id
  ) THEN
    RAISE EXCEPTION 'That username is already taken' USING ERRCODE = '23505';
  END IF;

  IF p_website IS NOT NULL AND p_website <> '' AND p_website !~ '^https?://' THEN
    RAISE EXCEPTION 'Website must start with http:// or https://' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advertiser_accounts SET
    name        = COALESCE(NULLIF(trim(p_name), ''), name),
    username    = COALESCE(NULLIF(trim(p_username), ''), username),
    -- NULL keeps the current value, '' clears it, otherwise set (trimmed).
    category    = CASE WHEN p_category    IS NULL THEN category    WHEN trim(p_category)    = '' THEN NULL ELSE trim(p_category)    END,
    description = CASE WHEN p_description IS NULL THEN description WHEN trim(p_description) = '' THEN NULL ELSE trim(p_description) END,
    website     = CASE WHEN p_website     IS NULL THEN website     WHEN trim(p_website)     = '' THEN NULL ELSE trim(p_website)     END,
    location    = CASE WHEN p_location    IS NULL THEN location    WHEN trim(p_location)    = '' THEN NULL ELSE trim(p_location)    END,
    -- Media: an explicit clear wins, otherwise a supplied URL wins, otherwise keep.
    avatar_url  = CASE
                    WHEN COALESCE(p_clear_avatar, FALSE) THEN NULL
                    WHEN p_avatar_url IS NOT NULL THEN p_avatar_url
                    ELSE avatar_url
                  END,
    cover_url   = CASE
                    WHEN COALESCE(p_clear_cover, FALSE) THEN NULL
                    WHEN p_cover_url IS NOT NULL THEN p_cover_url
                    ELSE cover_url
                  END,
    goals       = COALESCE(p_goals, goals),
    updated_at  = now()
  WHERE id = p_business_id
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Business not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

-- Keep EXECUTE grants aligned with the new signature.
REVOKE ALL ON FUNCTION public.update_business_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_business_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_business_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN) TO authenticated;
