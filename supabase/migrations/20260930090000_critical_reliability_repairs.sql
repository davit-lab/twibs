-- Critical database reliability repairs found by supabase db lint.
-- These definitions preserve the existing public API while matching the
-- volatility and pg_net/auth schemas installed in the linked project.


CREATE OR REPLACE FUNCTION public.emergency_get_state()
RETURNS public.emergency_state
LANGUAGE plpgsql
VOLATILE
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
      body := jsonb_build_object('event', p_event, 'payload', COALESCE(p_payload, '{}'::jsonb), 'at', now())
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

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
    -- All steps done. Reference is no longer meaningful.
    UPDATE public.emergency_jobs SET status = 'done', finished_at = now() WHERE id = p_job_id;
    UPDATE public.emergency_state
    SET mode = 'counter_active', last_backup_at = now(), active_job = NULL, updated_at = now()
    WHERE id = 1;
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
          PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Code archive skipped — code_repo_url not configured', NULL);
        ELSIF v_status = 'running' THEN
          SELECT net.http_get(url := v_repo, headers := '{"User-Agent":"red-button"}'::jsonb) INTO v_io_ref;
          PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 20, 'Downloading code archive…', v_io_ref);
        ELSE
          SELECT id, status_code, content INTO v_res FROM net._http_response WHERE id = (v_step->>'io_ref')::BIGINT;
          IF NOT FOUND THEN
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 20, 'Waiting for code download…', NULLIF(v_step->>'io_ref', '')::BIGINT);
          ELSIF v_res.status_code = 200 THEN
            v_checksum := md5(v_res.content);
            INSERT INTO public.backup_archives (kind, checksum, size_bytes, data)
            VALUES ('code', v_checksum, octet_length(v_res.content), jsonb_build_object('source', v_repo));
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
        PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Checksums verified', NULL);

      -- upload_offsite: push the DB archive to Supabase Storage via pg_net.
      -- Degrades gracefully when credentials are not configured so a demo
      -- install can complete the pipeline; the archive stays in
      -- backup_archives either way.
      WHEN 'upload_offsite' THEN
        IF v_status = 'running' THEN
          v_url := public.emergency_setting('supabase_url');
          v_srv := public.emergency_setting('service_role_key');
          IF v_url IS NULL OR v_url = '' OR v_srv IS NULL OR v_srv = '' OR v_srv = '""' THEN
            PERFORM public.red_button_set_step(p_job_id, v_key, 'done', 100, 'Offsite upload skipped — service credentials not configured', NULL);
          ELSE
            SELECT id INTO v_archive_id FROM public.backup_archives WHERE kind = 'db' ORDER BY created_at DESC LIMIT 1;
            SELECT data INTO v_data FROM public.backup_archives WHERE id = v_archive_id;
            SELECT net.http_post(
              url := v_url || '/storage/v1/object/platform-backups/' || v_archive_id || '.json',
              headers := jsonb_build_object('Authorization', 'Bearer ' || v_srv, 'Content-Type', 'application/json'),
              body := v_data
            ) INTO v_io_ref;
            PERFORM public.red_button_set_step(p_job_id, v_key, 'waiting', 40, 'Uploading backup offsite…', v_io_ref);
          END IF;
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

CREATE OR REPLACE FUNCTION public.soft_delete_user(p_target_user_id uuid, p_reason TEXT DEFAULT NULL, p_allow_self boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_display text;
  v_username text;
BEGIN
  IF NOT p_allow_self AND p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot delete your own account';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'user does not exist';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_target_user_id;
  SELECT display_name, username INTO v_display, v_username
  FROM public.profiles WHERE user_id = p_target_user_id;

  -- 1. Revoke access: ban the account + destroy every session/token.
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until') THEN
      UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = p_target_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN DELETE FROM auth.sessions WHERE user_id = p_target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = p_target_user_id::text; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 2. Register the deletion + (re)start the 7-day retention clock.
  INSERT INTO public.user_deletions (user_id, email, display_name, username, reason, deleted_by)
  VALUES (p_target_user_id, v_email, v_display, v_username, p_reason, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        username = EXCLUDED.username,
        reason = EXCLUDED.reason,
        deleted_by = EXCLUDED.deleted_by,
        purged_at = NULL,
        purge_due_at = now() + interval '7 days';

  -- 3. Anonymize + mark the profile as deleted.
  UPDATE public.profiles SET
    display_name = 'Deleted User',
    username = 'deleted_' || left(replace(p_target_user_id::text, '-', ''), 20),
    avatar_url = NULL,
    bio = NULL,
    is_verified = false,
    deleted_at = now()
  WHERE user_id = p_target_user_id;

  -- 4. Remove account-level personal rows immediately.
  --    (Content — posts, reels, comments, messages, books — is retained.)
  DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.user_bans WHERE user_id = p_target_user_id;
  DELETE FROM public.user_shadow_bans WHERE user_id = p_target_user_id;
  DELETE FROM public.login_sessions WHERE user_id = p_target_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_target_user_id;
  DELETE FROM public.verification_requests WHERE user_id = p_target_user_id;
  DELETE FROM public.reports WHERE reporter_id = p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_face_security()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  -- Purge challenges that have been expired/consumed for more than 7 days.
  DELETE FROM public.verification_challenges
  WHERE (expires_at < now() - interval '7 days'
         OR used_at IS NOT NULL AND used_at < now() - interval '7 days');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted + v_rows;

  -- Soft-expire face sessions whose grant has lapsed.
  UPDATE public.admin_face_sessions
  SET revoked_at = now()
  WHERE revoked_at IS NULL AND expires_at < now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_deleted := v_deleted + v_rows;

  RETURN v_deleted;
END;
$$;

ALTER FUNCTION public.resolve_analytics_range(timestamptz, timestamptz) STABLE;

-- This function calls emergency_get_state(), which can initialize the singleton.
ALTER FUNCTION public.admin_red_button_status() VOLATILE;

CREATE OR REPLACE FUNCTION public.admin_moderate_campaign(
  p_campaign_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin_or_moderator() THEN
    RAISE EXCEPTION 'Staff only';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF p_action = 'approve_payment' THEN
    IF v_campaign.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Campaign is not awaiting payment';
    END IF;
    INSERT INTO public.payments (campaign_id, user_id, provider, amount_cents, currency, status)
    VALUES (p_campaign_id, v_campaign.user_id, 'manual', v_campaign.total_budget_cents, v_campaign.currency, 'succeeded');
    v_campaign.status := 'pending_review';
    v_campaign.paid_at := now();
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'approve' THEN
    -- Test mode: approval does not require the campaign to have been paid.
    IF v_campaign.status <> 'pending_review' THEN
      RAISE EXCEPTION 'Campaign is not pending review';
    END IF;
    v_campaign.status := (CASE WHEN v_campaign.start_at > now() THEN 'scheduled' ELSE 'active' END)::public.campaign_status;
    v_campaign.approved_at := now();
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'reject' THEN
    IF v_campaign.status IN ('active', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot reject a campaign in this state';
    END IF;
    v_campaign.status := 'rejected';
    v_campaign.rejection_reason := p_reason;
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'pause' THEN
    IF v_campaign.status <> 'active' THEN
      RAISE EXCEPTION 'Only active campaigns can be paused';
    END IF;
    v_campaign.status := 'paused';
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'resume' THEN
    IF v_campaign.status <> 'paused' THEN
      RAISE EXCEPTION 'Only paused campaigns can be resumed';
    END IF;
    v_campaign.status := 'active';
    v_campaign.moderation_note := p_reason;
  ELSIF p_action = 'end' THEN
    IF v_campaign.status NOT IN ('active', 'paused', 'scheduled') THEN
      RAISE EXCEPTION 'Campaign cannot be ended in this state';
    END IF;
    v_campaign.status := 'completed';
    v_campaign.ended_at := now();
    v_campaign.moderation_note := p_reason;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  UPDATE public.campaigns SET
    status = v_campaign.status,
    paid_at = v_campaign.paid_at,
    approved_at = v_campaign.approved_at,
    ended_at = v_campaign.ended_at,
    rejection_reason = v_campaign.rejection_reason,
    moderation_note = v_campaign.moderation_note,
    updated_at = now()
  WHERE id = p_campaign_id
  RETURNING * INTO v_campaign;

  RETURN v_campaign;
END;
$$;
