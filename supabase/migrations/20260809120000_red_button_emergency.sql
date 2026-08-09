-- ============================================================
-- RED BUTTON — emergency lockdown & backup controller.
-- DB-backed worker (pg_cron) + real I/O pipeline:
--   dump DB -> archive code (GitHub tarball) -> verify checksums
--   -> upload offsite (Supabase Storage) -> flip LOCKED_DOWN flag
--   -> apply firewall rules (threat IPs + "You are nothing" rule)
-- Every step audits to admin_audit_logs. Failure -> RECOVERY + alert.
-- Prereqs: pgcrypto, pg_net, pg_cron (all preinstalled on Supabase).
-- Config (system_settings): admin_pin_hash, service_role_key,
--   supabase_url, code_repo_url, edge_provider, lockdown_ttl_minutes,
--   red_button_hour_limit, red_button_minute_limit, alert_webhook_url.
-- ============================================================

DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_net; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ------------------------------------------------------------
-- 1. Mode enum + singleton state
-- ------------------------------------------------------------
CREATE TYPE public.emergency_mode AS ENUM (
  'online', 'armed', 'backing_up', 'locked_down', 'counter_active', 'recovery'
);

CREATE TABLE IF NOT EXISTS public.emergency_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode public.emergency_mode NOT NULL DEFAULT 'online',
  locked_down_until TIMESTAMPTZ,
  last_backup_at TIMESTAMPTZ,
  blocked_attacks BIGINT NOT NULL DEFAULT 0,
  triggered_by UUID,
  active_job UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.emergency_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.emergency_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read emergency state" ON public.emergency_state;
CREATE POLICY "Staff can read emergency state" ON public.emergency_state
  FOR SELECT USING (public.is_staff());

-- ------------------------------------------------------------
-- 2. Job registry (real pipeline progress, polled by the UI)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','rolled_back')),
  triggered_by UUID,
  triggered_ip TEXT,
  steps JSONB NOT NULL,
  error_detail TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emergency_jobs_status ON public.emergency_jobs (status);

ALTER TABLE public.emergency_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read emergency jobs" ON public.emergency_jobs;
CREATE POLICY "Staff can read emergency jobs" ON public.emergency_jobs
  FOR SELECT USING (public.is_staff());

-- ------------------------------------------------------------
-- 3. Armings (per-session challenge phrase), rate limits,
--    threat IPs, firewall rules, WAF attack log, backup archive
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_armings (
  session_key TEXT PRIMARY KEY,
  phrase TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.emergency_armings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct armings access" ON public.emergency_armings;
CREATE POLICY "No direct armings access" ON public.emergency_armings
  FOR SELECT USING (false);

CREATE TABLE IF NOT EXISTS public.emergency_rate_limits (
  key TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_rate_limits_key_ts ON public.emergency_rate_limits (key, ts);

ALTER TABLE public.emergency_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct rate limit access" ON public.emergency_rate_limits;
CREATE POLICY "No direct rate limit access" ON public.emergency_rate_limits
  FOR SELECT USING (false);

CREATE TABLE IF NOT EXISTS public.threat_ips (
  ip INET PRIMARY KEY,
  reason TEXT,
  blocked_by UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.threat_ips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read threat ips" ON public.threat_ips;
CREATE POLICY "Staff can read threat ips" ON public.threat_ips
  FOR SELECT USING (public.is_staff());

CREATE TABLE IF NOT EXISTS public.emergency_firewall_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  rule TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.emergency_firewall_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read firewall rules" ON public.emergency_firewall_rules;
CREATE POLICY "Staff can read firewall rules" ON public.emergency_firewall_rules
  FOR SELECT USING (public.is_staff());

CREATE TABLE IF NOT EXISTS public.blocked_attacks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip INET,
  rule TEXT,
  source TEXT NOT NULL DEFAULT 'waf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocked_attacks_created ON public.blocked_attacks_log (created_at DESC);

ALTER TABLE public.blocked_attacks_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read blocked attacks" ON public.blocked_attacks_log;
CREATE POLICY "Staff can read blocked attacks" ON public.blocked_attacks_log
  FOR SELECT USING (public.is_staff());

CREATE TABLE IF NOT EXISTS public.backup_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  checksum TEXT,
  size_bytes BIGINT,
  data JSONB,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_archives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read backup archives" ON public.backup_archives;
CREATE POLICY "Staff can read backup archives" ON public.backup_archives
  FOR SELECT USING (public.is_staff());

-- ------------------------------------------------------------
-- 4. Default configuration
-- ------------------------------------------------------------
INSERT INTO public.system_settings (key, value) VALUES
  ('edge_provider',              '"supabase"'::jsonb),
  ('code_repo_url',              '"https://github.com/davit-lab/twibs/archive/refs/heads/main.tar.gz"'::jsonb),
  ('lockdown_ttl_minutes',       '120'::jsonb),
  ('red_button_hour_limit',      '3'::jsonb),
  ('red_button_minute_limit',    '1'::jsonb),
  ('alert_webhook_url',          '""'::jsonb),
  ('supabase_url',               '"https://mroudkddozvlpcxedank.supabase.co"'::jsonb),
  ('service_role_key',           '""'::jsonb),
  ('admin_pin_hash',             '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 5. Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emergency_get_state()
RETURNS public.emergency_state
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v public.emergency_state;
BEGIN
  SELECT * INTO v FROM public.emergency_state WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.emergency_state (id) VALUES (1);
    SELECT * INTO v FROM public.emergency_state WHERE id = 1;
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.emergency_set_mode(p_mode public.emergency_mode)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.emergency_state
  SET mode = p_mode, updated_at = now()
  WHERE id = 1;
END;
$$;

-- Direct append-only audit write (usable by the cron worker, where
-- auth.uid() is null and the is_staff()-gated audit_action() fails).
CREATE OR REPLACE FUNCTION public.emergency_audit(
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email TEXT;
BEGIN
  IF p_actor IS NULL THEN p_actor := auth.uid(); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_actor;
  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (p_actor, v_email, p_action, p_target_type, p_target_id, p_details);
END;
$$;

CREATE OR REPLACE FUNCTION public.emergency_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value #>> '{}' FROM public.system_settings WHERE key = p_key
$$;

-- Sliding-window rate limit, real Postgres I/O.
CREATE OR REPLACE FUNCTION public.emergency_check_rate_limit(p_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour_limit INT := COALESCE(NULLIF(public.emergency_setting('red_button_hour_limit'), ''), '3')::INT;
  v_minute_limit INT := COALESCE(NULLIF(public.emergency_setting('red_button_minute_limit'), ''), '1')::INT;
  v_hour_count INT;
  v_minute_count INT;
BEGIN
  DELETE FROM public.emergency_rate_limits WHERE ts < now() - interval '1 hour';

  SELECT count(*) INTO v_hour_count FROM public.emergency_rate_limits
  WHERE key = p_key AND ts >= now() - interval '1 hour';
  SELECT count(*) INTO v_minute_count FROM public.emergency_rate_limits
  WHERE key = p_key AND ts >= now() - interval '1 minute';

  IF v_hour_count >= v_hour_limit OR v_minute_count >= v_minute_limit THEN
    RAISE EXCEPTION 'rate limit exceeded: try again later' USING ERRCODE = 'P0004';
  END IF;

  INSERT INTO public.emergency_rate_limits (key) VALUES (p_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.emergency_send_alert(p_event TEXT, p_payload JSONB DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := public.emergency_setting('alert_webhook_url');
BEGIN
  IF v_url IS NULL OR v_url = '' THEN
    RETURN;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('event', p_event, 'payload', COALESCE(p_payload, '{}'::jsonb), 'at', now())::text
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

-- ------------------------------------------------------------
-- 6. Status / arming / trigger / rollback RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_red_button_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.emergency_state;
  v_job jsonb;
  v_threats INT;
  v_rules INT;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_state := public.emergency_get_state();

  IF v_state.active_job IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', j.id, 'status', j.status,
      'steps', j.steps, 'error_detail', j.error_detail,
      'created_at', j.created_at, 'finished_at', j.finished_at
    ) INTO v_job
    FROM public.emergency_jobs j WHERE j.id = v_state.active_job;
  END IF;

  SELECT count(*) INTO v_threats FROM public.threat_ips WHERE active = true;
  SELECT count(*) INTO v_rules FROM public.emergency_firewall_rules WHERE active = true;

  RETURN jsonb_build_object(
    'mode', v_state.mode,
    'locked_down_until', v_state.locked_down_until,
    'last_backup_at', v_state.last_backup_at,
    'blocked_attacks', v_state.blocked_attacks,
    'threat_count', v_threats,
    'firewall_rules_active', v_rules > 0,
    'active_job', v_job
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_red_button_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_red_button_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_red_button_begin_arming()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session TEXT := auth.jwt() ->> 'session_id';
  v_words TEXT[] := ARRAY['EMERALD','FALCON','SOVEREIGN','CRIMSON','VANQUISH','IRONCLAD','TEMPEST','SENTINEL'];
  v_phrase TEXT;
  v_expires TIMESTAMPTZ := now() + interval '2 minutes';
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_session IS NULL OR v_session = '' THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  v_phrase := v_words[1 + floor(random() * array_length(v_words, 1))::int] || '-'
           || v_words[1 + floor(random() * array_length(v_words, 1))::int] || '-'
           || v_words[1 + floor(random() * array_length(v_words, 1))::int];

  INSERT INTO public.emergency_armings (session_key, phrase, expires_at)
  VALUES (v_session, v_phrase, v_expires)
  ON CONFLICT (session_key) DO UPDATE
    SET phrase = EXCLUDED.phrase, expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('phrase', v_phrase, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_red_button_begin_arming() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_red_button_begin_arming() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_red_button_trigger(p_pin TEXT, p_phrase TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.emergency_state;
  v_hash TEXT;
  v_session TEXT := auth.jwt() ->> 'session_id';
  v_arming public.emergency_armings;
  v_job_id UUID;
  v_pending jsonb;
  v_repo TEXT;
  v_step jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.emergency_check_rate_limit('red_button:' || auth.uid());

  v_state := public.emergency_get_state();
  IF v_state.mode IN ('backing_up', 'locked_down', 'counter_active') THEN
    RAISE EXCEPTION 'lockdown already in progress' USING ERRCODE = 'P0004';
  END IF;

  v_hash := public.emergency_setting('admin_pin_hash');
  IF v_hash IS NULL OR v_hash = '' OR v_hash = '""' THEN
    RAISE EXCEPTION 'PIN not configured (set admin_pin_hash in system_settings)';
  END IF;
  IF NOT (crypt(p_pin, v_hash) = v_hash) THEN
    PERFORM public.emergency_audit('red_button_pin_failed', 'system', NULL, jsonb_build_object('ip', current_setting('request.headers', true)));
    RAISE EXCEPTION 'invalid PIN';
  END IF;

  SELECT * INTO v_arming FROM public.emergency_armings
  WHERE session_key = v_session AND expires_at > now();
  IF NOT FOUND OR v_arming.phrase <> p_phrase THEN
    RAISE EXCEPTION 'challenge phrase invalid or expired';
  END IF;
  DELETE FROM public.emergency_armings WHERE session_key = v_session;

  v_pending := jsonb_build_array(
    jsonb_build_object('key','dump_db','status','pending','pct',0,'detail',''),
    jsonb_build_object('key','archive_code','status','pending','pct',0,'detail',''),
    jsonb_build_object('key','verify_checksums','status','pending','pct',0,'detail',''),
    jsonb_build_object('key','upload_offsite','status','pending','pct',0,'detail',''),
    jsonb_build_object('key','flip_flag','status','pending','pct',0,'detail',''),
    jsonb_build_object('key','apply_firewall','status','pending','pct',0,'detail','')
  );

  INSERT INTO public.emergency_jobs (status, triggered_by, triggered_ip, steps)
  VALUES ('queued', auth.uid(), current_setting('request.headers', true), v_pending)
  RETURNING id INTO v_job_id;

  UPDATE public.emergency_state
  SET mode = 'backing_up', active_job = v_job_id, triggered_by = auth.uid(), updated_at = now()
  WHERE id = 1;

  PERFORM public.emergency_audit('red_button_trigger', 'job', v_job_id::text,
    jsonb_build_object('ip', current_setting('request.headers', true)));
  PERFORM public.emergency_send_alert('RED_BUTTON_TRIGGERED', jsonb_build_object('job_id', v_job_id));

  RETURN jsonb_build_object('job_id', v_job_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_red_button_trigger(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_red_button_trigger(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_red_button_rollback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_state public.emergency_state;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.emergency_check_rate_limit('red_button:' || auth.uid());

  v_state := public.emergency_get_state();
  IF v_state.mode NOT IN ('locked_down', 'counter_active', 'backing_up') THEN
    RAISE EXCEPTION 'platform is not in a locked state' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.emergency_state
  SET mode = 'recovery', locked_down_until = NULL, updated_at = now()
  WHERE id = 1;

  UPDATE public.threat_ips SET active = false WHERE active = true;
  UPDATE public.emergency_firewall_rules SET active = false WHERE active = true;
  UPDATE public.emergency_jobs
  SET status = 'rolled_back', finished_at = now()
  WHERE id = v_state.active_job AND status IN ('queued', 'running');

  PERFORM public.emergency_audit('red_button_rollback', 'job', v_state.active_job::text,
    jsonb_build_object('ip', current_setting('request.headers', true)));
  PERFORM public.emergency_send_alert('RED_BUTTON_ROLLED_BACK', jsonb_build_object('job_id', v_state.active_job));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_red_button_rollback() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_red_button_rollback() TO authenticated;

-- Resume normal operations after a recovery.
CREATE OR REPLACE FUNCTION public.admin_red_button_resume()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF public.emergency_get_state().mode <> 'recovery' THEN
    RAISE EXCEPTION 'platform is not in recovery mode' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.emergency_state SET mode = 'online', locked_down_until = NULL, updated_at = now() WHERE id = 1;
  PERFORM public.emergency_audit('red_button_resume', 'system', NULL,
    jsonb_build_object('ip', current_setting('request.headers', true)));
  PERFORM public.emergency_send_alert('RED_BUTTON_RESUMED', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_red_button_resume() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_red_button_resume() TO authenticated;

-- WAF integration: record a blocked attack (real counter source).
CREATE OR REPLACE FUNCTION public.emergency_register_attack(p_ip INET, p_rule TEXT DEFAULT NULL, p_source TEXT DEFAULT 'waf')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.blocked_attacks_log (ip, rule, source) VALUES (p_ip, p_rule, p_source);
  UPDATE public.emergency_state SET blocked_attacks = blocked_attacks + 1 WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.emergency_register_attack(INET, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emergency_register_attack(INET, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.emergency_add_threat_ip(p_ip INET, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.threat_ips (ip, reason, blocked_by, active)
  VALUES (p_ip, p_reason, auth.uid(), true)
  ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, active = true;
  PERFORM public.emergency_audit('red_button_add_threat_ip', 'ip', p_ip::text,
    jsonb_build_object('reason', p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.emergency_add_threat_ip(INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emergency_add_threat_ip(INET, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 7. Worker pipeline
-- ------------------------------------------------------------
-- Advance one step of a job. Returns true when the job is finished.
CREATE OR REPLACE FUNCTION public.red_button_advance_job(p_job_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.emergency_jobs;
  v_step jsonb;
  v_key TEXT;
  v_status TEXT;
  v_detail TEXT := '';
  v_io_ref BIGINT;
  v_archive_id UUID;
  v_checksum TEXT;
  v_data JSONB;
  v_url TEXT;
  v_repo TEXT;
  v_provider TEXT;
  v_done INT;
  v_total INT;
  v_srv TEXT;
  v_res RECORD;
BEGIN
  SELECT * INTO v_job FROM public.emergency_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status IN ('done', 'failed', 'rolled_back') THEN
    RETURN TRUE;
  END IF;

  -- Find the first step that is pending, running or waiting.
  SELECT s INTO v_step FROM jsonb_array_elements(v_job.steps) s
  WHERE s->>'status' IN ('pending', 'running', 'waiting')
  ORDER BY 1 LIMIT 1;

  IF v_step IS NULL THEN
    -- All steps done.
    UPDATE public.emergency_jobs SET status = 'done', finished_at = now() WHERE id = p_job_id;
    UPDATE public.emergency_state SET mode = 'counter_active', last_backup_at = now(), updated_at = now() WHERE id = 1;
    PERFORM public.emergency_audit('red_button_complete', 'job', p_job_id::text);
    PERFORM public.emergency_send_alert('RED_BUTTON_COUNTER_ACTIVE', jsonb_build_object('job_id', p_job_id));
    RETURN TRUE;
  END IF;

  v_key := v_step->>'key';
  v_status := v_step->>'status';

  -- Start running sync steps.
  IF v_status = 'pending' THEN
    PERFORM public.red_button_set_step(p_job_id, v_key, 'running', 5, 'Starting ' || v_key, NULL);
    v_step := jsonb_set(v_step, '{status}', '"running"'::jsonb);
    v_status := 'running';
  END IF;

  BEGIN
    CASE v_key
      -- dump_db: real snapshot of user content into backup_archives
      WHEN 'dump_db' THEN
        SELECT jsonb_build_object(
          'exported_at', now(),
          'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT user_id, username, display_name, avatar_url, bio, created_at, deleted_at FROM public.profiles) t), '[]'::jsonb),
          'posts',     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.posts) t), '[]'::jsonb),
          'comments',  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.comments) t), '[]'::jsonb),
          'reels',     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.reels) t), '[]'::jsonb),
          'messages',  COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.messages) t), '[]'::jsonb),
          'books',     COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.books) t), '[]'::jsonb),
          'stories',   COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.stories) t), '[]'::jsonb)
        ) INTO v_data;

        INSERT INTO public.backup_archives (kind, data, checksum, size_bytes)
        VALUES ('db', v_data, md5(v_data::text), octet_length(v_data::text))
        RETURNING id, checksum INTO v_archive_id, v_checksum;

        PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'DB snapshot checksum ' || left(v_checksum, 12) || '…', NULL);

      -- archive_code: fetch the repo tarball (real pg_net I/O)
      WHEN 'archive_code' THEN
        v_repo := public.emergency_setting('code_repo_url');
        IF v_repo IS NULL OR v_repo = '' OR v_repo = '""' THEN
          RAISE EXCEPTION 'code_repo_url not configured';
        END IF;
        IF v_status = 'running' THEN
          SELECT net.http_get(url := v_repo, headers := '{"User-Agent":"red-button"}'::jsonb) INTO v_io_ref;
          PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 20, 'Downloading code archive…', v_io_ref);
        ELSE
          SELECT id, status_code, body INTO v_res FROM net._http_response WHERE id = (v_step->>'io_ref')::BIGINT;
          IF NOT FOUND THEN
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 20, 'Waiting for code download…', NULL);
          ELSIF v_res.status_code = 200 THEN
            v_checksum := md5(v_res.body::bytea::text);
            INSERT INTO public.backup_archives (kind, checksum, size_bytes, data)
            VALUES ('code', v_checksum, octet_length(v_res.body::bytea), jsonb_build_object('source', v_repo));
            PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Code archive checksum ' || left(v_checksum, 12) || '…', NULL);
          ELSE
            RAISE EXCEPTION 'code download failed with HTTP %', v_res.status_code;
          END IF;
        END IF;

      -- verify_checksums: recompute md5 of stored archive and compare
      WHEN 'verify_checksums' THEN
        SELECT data, checksum INTO v_data, v_checksum FROM public.backup_archives WHERE kind = 'db' ORDER BY created_at DESC LIMIT 1;
        IF v_data IS NULL THEN
          RAISE EXCEPTION 'no db archive found';
        END IF;
        IF md5(v_data::text) <> v_checksum THEN
          RAISE EXCEPTION 'db archive checksum mismatch';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.backup_archives WHERE kind = 'code') THEN
          RAISE EXCEPTION 'no code archive found';
        END IF;
        PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Checksums verified', NULL);

      -- upload_offsite: push the DB archive to Supabase Storage via pg_net
      WHEN 'upload_offsite' THEN
        IF v_status = 'running' THEN
          v_url := public.emergency_setting('supabase_url');
          v_srv := public.emergency_setting('service_role_key');
          IF v_url IS NULL OR v_url = '' OR v_srv IS NULL OR v_srv = '' OR v_srv = '""' THEN
            RAISE EXCEPTION 'supabase_url or service_role_key not configured';
          END IF;
          SELECT id INTO v_archive_id FROM public.backup_archives WHERE kind = 'db' ORDER BY created_at DESC LIMIT 1;
          SELECT data INTO v_data FROM public.backup_archives WHERE id = v_archive_id;
          SELECT net.http_post(
            url := v_url || '/storage/v1/object/platform-backups/' || v_archive_id || '.json',
            headers := jsonb_build_object('Authorization', 'Bearer ' || v_srv, 'Content-Type', 'application/json'),
            body := v_data::text
          ) INTO v_io_ref;
          PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 40, 'Uploading backup offsite…', v_io_ref);
        ELSE
          SELECT id, status_code INTO v_res FROM net._http_response WHERE id = (v_step->>'io_ref')::BIGINT;
          IF NOT FOUND THEN
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 40, 'Waiting for upload…', NULL);
          ELSIF v_res.status_code >= 200 AND v_res.status_code < 300 THEN
            PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Backup stored offsite', NULL);
          ELSE
            RAISE EXCEPTION 'offsite upload failed with HTTP %', v_res.status_code;
          END IF;
        END IF;

      -- flip_flag: persist LOCKED_DOWN (DB is the source of truth)
      WHEN 'flip_flag' THEN
        UPDATE public.emergency_state
        SET mode = 'locked_down',
            locked_down_until = now() + (COALESCE(NULLIF(public.emergency_setting('lockdown_ttl_minutes'), ''), '120')::INT || ' minutes')::interval,
            updated_at = now()
        WHERE id = 1;
        PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Platform LOCKED_DOWN', NULL);

      -- apply_firewall: activate rules for threat IPs ("You are nothing")
      WHEN 'apply_firewall' THEN
        v_provider := COALESCE(NULLIF(public.emergency_setting('edge_provider'), ''), 'supabase');
        INSERT INTO public.emergency_firewall_rules (provider, name, rule)
        VALUES (v_provider, 'RED_BUTTON_LOCKDOWN', 'You are nothing');
        INSERT INTO public.emergency_firewall_rules (provider, name, rule)
        SELECT v_provider, 'THREAT_IP_BLOCK', 'deny all for ' || ip::text FROM public.threat_ips WHERE active = true;
        PERFORM public.emergency_audit('red_button_firewall', 'job', p_job_id::text,
          jsonb_build_object('provider', v_provider, 'rules', (SELECT count(*) FROM public.emergency_firewall_rules WHERE active = true)));
        PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Firewall rules applied', NULL);

      ELSE
        RAISE EXCEPTION 'unknown step %', v_key;
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.emergency_jobs
    SET status = 'failed', error_detail = SQLERRM, finished_at = now()
    WHERE id = p_job_id;
    UPDATE public.emergency_state SET mode = 'recovery', updated_at = now() WHERE id = 1;
    PERFORM public.emergency_audit('red_button_failed', 'job', p_job_id::text,
      jsonb_build_object('step', v_key, 'error', SQLERRM));
    PERFORM public.emergency_send_alert('RED_BUTTON_FAILED', jsonb_build_object('job_id', p_job_id, 'step', v_key, 'error', SQLERRM));
    RETURN TRUE;
  END;

  -- Recalculate done/total for the overall progress percentage.
  SELECT count(*) FILTER (WHERE s->>'status' = 'done'), count(*) INTO v_done, v_total
  FROM jsonb_array_elements((SELECT steps FROM public.emergency_jobs WHERE id = p_job_id)) s;

  UPDATE public.emergency_jobs
  SET status = 'running', locked_until = now() + interval '5 minutes'
  WHERE id = p_job_id;

  RETURN v_total > 0 AND v_done = v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.red_button_set_step(
  p_job_id UUID, p_key TEXT, p_status TEXT, p_pct INT, p_detail TEXT, p_io_ref BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.emergency_jobs SET steps = (
    SELECT jsonb_agg(
      CASE WHEN (s->>'key') = p_key THEN
        jsonb_build_object(
          'key', p_key,
          'status', p_status,
          'pct', p_pct,
          'detail', p_detail,
          'started_at', COALESCE(s->>'started_at', now()::text),
          'finished_at', CASE WHEN p_status IN ('done','failed') THEN now()::text ELSE s->>'finished_at' END,
          'io_ref', p_io_ref
        )
      ELSE s END
    )
    FROM jsonb_array_elements(steps) s
  ) WHERE id = p_job_id;
END;
$$;

-- Worker entry: claim + advance every queued/running job.
CREATE OR REPLACE FUNCTION public.red_button_worker_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.emergency_jobs;
  v_count INT := 0;
  v_finished boolean;
BEGIN
  FOR r IN
    SELECT * FROM public.emergency_jobs
    WHERE status IN ('queued', 'running')
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY created_at
  LOOP
    IF NOT pg_try_advisory_lock(hashtext('red_button:' || r.id)) THEN
      CONTINUE;
    END IF;
    BEGIN
      IF r.status = 'queued' THEN
        UPDATE public.emergency_jobs SET status = 'running', locked_until = now() + interval '5 minutes'
        WHERE id = r.id;
      END IF;
      v_finished := public.red_button_advance_job(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM pg_advisory_unlock(hashtext('red_button:' || r.id));
  END LOOP;
  RETURN v_count;
END;
$$;

-- Watchdog: expire a stale lockdown after the TTL and alert.
CREATE OR REPLACE FUNCTION public.red_button_watchdog_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.emergency_state;
BEGIN
  v_state := public.emergency_get_state();
  IF v_state.mode IN ('locked_down', 'counter_active')
     AND v_state.locked_down_until IS NOT NULL
     AND v_state.locked_down_until < now() THEN
    UPDATE public.emergency_state SET mode = 'recovery', locked_down_until = NULL, updated_at = now() WHERE id = 1;
    PERFORM public.emergency_audit('red_button_lockdown_expired', 'system', NULL);
    PERFORM public.emergency_send_alert('RED_BUTTON_LOCKDOWN_EXPIRED', jsonb_build_object('until', v_state.locked_down_until));
    RETURN 1;
  END IF;
  RETURN 0;
END;
$$;

-- ------------------------------------------------------------
-- 8. pg_cron schedules (real worker + watchdog, every minute)
-- ------------------------------------------------------------
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('red-button-worker'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.schedule('red-button-worker', '* * * * *', $cron$SELECT public.red_button_worker_tick()$cron$);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('red-button-watchdog'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.schedule('red-button-watchdog', '* * * * *', $cron$SELECT public.red_button_watchdog_tick()$cron$);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
