-- ============================================================
-- Fix: Red Button pipeline stalls at one step.
--
-- Two bugs in red_button_advance_job:
--   1. When an async step (code download / offsite upload) had no
--      pg_net response ready yet, the function re-wrote the step
--      with io_ref = NULL, permanently losing the request id, so the
--      step could never resolve and the job stalled forever.
--   2. Every tick stamped locked_until = now() + 5 minutes, so the
--      pipeline only advanced one step every 5 minutes (looked frozen).
--
-- Fix: preserve the pending io_ref while waiting, and clear the lock
-- so each cron tick (1/min) advances the next step.
-- ============================================================

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
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 20, 'Waiting for code download…', NULLIF(v_step->>'io_ref', '')::BIGINT);
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
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 40, 'Waiting for upload…', NULLIF(v_step->>'io_ref', '')::BIGINT);
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

  -- Leave the job unlocked so the next cron tick can advance the next
  -- step immediately. The advisory lock in the worker prevents races.
  UPDATE public.emergency_jobs
  SET status = 'running', locked_until = NULL
  WHERE id = p_job_id;

  RETURN v_total > 0 AND v_done = v_total;
END;
$$;
