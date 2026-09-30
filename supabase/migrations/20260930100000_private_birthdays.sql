-- Birthday is required during email registration but must never be part of the
-- public profile row, which is readable by other users.
CREATE TABLE IF NOT EXISTS public.profile_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_private_birth_date_floor CHECK (birth_date >= date '1900-01-01')
);

ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their private profile data" ON public.profile_private;
CREATE POLICY "Users can view their private profile data"
  ON public.profile_private FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their private profile data" ON public.profile_private;
CREATE POLICY "Users can update their private profile data"
  ON public.profile_private FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  new_username text;
  v_birth_date date;
BEGIN
  base_username := lower(split_part(COALESCE(NEW.email, ''), '@', 1));
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '_', 'g');

  IF base_username = '' THEN
    base_username := 'user';
  ELSIF char_length(base_username) < 3 THEN
    base_username := base_username || lpad('', 3 - char_length(base_username), '_');
  END IF;

  base_username := left(base_username, 21);
  new_username := base_username || '_' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, new_username, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  IF NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '') IS NOT NULL THEN
    BEGIN
      v_birth_date := (NEW.raw_user_meta_data->>'date_of_birth')::date;
    EXCEPTION WHEN invalid_datetime_format THEN
      RAISE EXCEPTION 'invalid date of birth';
    END;

    IF v_birth_date < date '1900-01-01' OR v_birth_date > current_date - interval '13 years' THEN
      RAISE EXCEPTION 'account holder must be at least 13 years old';
    END IF;

    INSERT INTO public.profile_private (user_id, birth_date)
    VALUES (NEW.id, v_birth_date);
  END IF;

  RETURN NEW;
END;
$$;
