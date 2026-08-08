-- Account change limits: username and display name changes are limited per
-- calendar month and enforced server-side. Password changes are unlimited.

-- Track usage counts per user / change type / month.
CREATE TABLE IF NOT EXISTS public.account_change_counts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('username', 'display_name', 'password')),
  period TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, change_type, period)
);

ALTER TABLE public.account_change_counts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_account_change_counts_user
  ON public.account_change_counts(user_id);

-- Atomically record a change for the current user, enforcing the monthly cap.
-- Raises when the limit for that month is already reached.
CREATE OR REPLACE FUNCTION public.record_account_change(p_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_period TEXT := to_char(now(), 'YYYY-MM');
  v_count INT;
BEGIN
  v_limit := CASE p_type
    WHEN 'username' THEN 1
    WHEN 'display_name' THEN 2
    ELSE -1
  END;

  IF v_limit < 0 THEN
    RAISE EXCEPTION 'Invalid account change type';
  END IF;

  INSERT INTO public.account_change_counts (user_id, change_type, period, count)
  VALUES (auth.uid(), p_type, v_period, 1)
  ON CONFLICT (user_id, change_type, period)
  DO UPDATE SET count = public.account_change_counts.count + 1
    WHERE public.account_change_counts.count < v_limit
  RETURNING count INTO v_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monthly limit reached for % changes', p_type;
  END IF;
END;
$$;

-- Report used / remaining / total allowance for the current user this month.
CREATE OR REPLACE FUNCTION public.get_account_change_usage()
RETURNS TABLE (change_type TEXT, used INT, remaining INT, change_limit INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits AS (
    SELECT 'username'::TEXT AS change_type, 1 AS change_limit
    UNION ALL SELECT 'display_name', 2
  )
  SELECT
    l.change_type,
    COALESCE(c.count, 0)::INT AS used,
    GREATEST(l.change_limit - COALESCE(c.count, 0), 0)::INT AS remaining,
    l.change_limit
  FROM limits l
  LEFT JOIN public.account_change_counts c
    ON c.user_id = auth.uid()
    AND c.change_type = l.change_type
    AND c.period = to_char(now(), 'YYYY-MM');
$$;

-- Server-side enforcement: name / username edits on profiles cannot bypass the
-- monthly cap. Admins and moderators are exempt.
CREATE OR REPLACE FUNCTION public.handle_profile_name_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_moderator() THEN
    RETURN NEW;
  END IF;

  IF NEW.username IS DISTINCT FROM OLD.username THEN
    PERFORM public.record_account_change('username');
  END IF;

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    PERFORM public.record_account_change('display_name');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_name_change ON public.profiles;
CREATE TRIGGER trg_profile_name_change
  BEFORE UPDATE OF username, display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_name_change();
