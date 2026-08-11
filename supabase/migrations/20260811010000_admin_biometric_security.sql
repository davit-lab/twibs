-- ============================================================================
-- Admin biometric / face-verification security layer
--
-- Implements the storage half of administrator face verification:
--   * admin_biometric_credentials   – enrolled facial template (embedding)
--   * verification_challenges       – one-time, expiring liveness challenges
--   * authentication_events         – append-only security event trail
--   * admin_webauthn_credentials    – passkey public keys (WebAuthn fallback)
--   * admin_face_sessions           – short-lived admin-grant records (revocable)
--
-- Security model:
--   * NONE of these tables have client-facing RLS policies. They can only be
--     read/written by the Supabase service role, which is used exclusively by
--     the `admin-face-verify` Edge Function. The browser never touches them.
--   * `authentication_events` is readable by staff and immutable by trigger.
--   * Verification decisions, threshold checks and biometric comparisons are
--     ALWAYS performed server-side in the Edge Function.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Feature flag: face authentication is opt-in.
--    Off by default so existing deployments are not affected until
--    an administrator enrolls a biometric identity and enables it.
-- ------------------------------------------------------------
INSERT INTO public.system_settings (key, value) VALUES
    ('face_auth_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. admin_biometric_credentials — the enrolled administrator identity.
--    `template` is a float8[] face-embedding (face-api ResNet-50, 128-d).
--    Only a single row is ever expected (the administrator).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_biometric_credentials (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id          UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    template          DOUBLE PRECISION[] NOT NULL,
    model_version     TEXT NOT NULL DEFAULT 'face-api-resnet50-v1',
    threshold_override DOUBLE PRECISION,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    version           INTEGER NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (admin_id)
);

CREATE INDEX IF NOT EXISTS idx_biometric_credentials_admin
  ON public.admin_biometric_credentials (admin_id);

-- No RLS policies: service-role only. Even an admin client cannot read the
-- raw biometric template through the PostgREST API.

-- ------------------------------------------------------------
-- 3. verification_challenges — one-time, short-lived liveness challenges.
--    Only the SHA-256 hash of the client nonce is stored; the raw nonce is
--    returned to the browser in memory and never persisted anywhere.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_challenges (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose          TEXT NOT NULL DEFAULT 'verify'
                     CHECK (purpose IN ('verify', 'enroll', 'webauthn_register', 'webauthn_auth')),
    challenge_hash   TEXT NOT NULL,                -- sha256(nonce)
    sequence         JSONB NOT NULL,               -- randomized instruction list
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    attempt_count    INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'blocked')),
    created_by       UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    ip_hash          TEXT,
    user_agent       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_challenges_expiry
  ON public.verification_challenges (expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_challenges_status
  ON public.verification_challenges (status);

-- No RLS policies: service-role only.

-- ------------------------------------------------------------
-- 4. authentication_events — append-only security trail.
--    ip_hash stores a SHA-256 hash of the IP, never the raw address,
--    so we can rate-limit and alert without storing PII unnecessarily.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authentication_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL,
    success     BOOLEAN NOT NULL DEFAULT false,
    ip_hash     TEXT,
    user_agent  TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authentication_events_type
  ON public.authentication_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authentication_events_ip
  ON public.authentication_events (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authentication_events_user
  ON public.authentication_events (user_id, created_at DESC);

ALTER TABLE public.authentication_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read auth security events" ON public.authentication_events;
CREATE POLICY "Staff can read auth security events" ON public.authentication_events
  FOR SELECT USING (public.is_staff());
-- No INSERT/UPDATE/DELETE policies: service-role / edge function only.

-- Guard triggers: security events are append-only, even for the table owner.
CREATE OR REPLACE FUNCTION public.prevent_auth_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'authentication events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS prevent_auth_event_update ON public.authentication_events;
CREATE TRIGGER prevent_auth_event_update
  BEFORE UPDATE ON public.authentication_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_auth_event_mutation();

DROP TRIGGER IF EXISTS prevent_auth_event_delete ON public.authentication_events;
CREATE TRIGGER prevent_auth_event_delete
  BEFORE DELETE ON public.authentication_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_auth_event_mutation();

-- ------------------------------------------------------------
-- 5. admin_webauthn_credentials — passkey public keys (fallback factor).
--    `credential_id` and `public_key` are stored base64url-encoded
--    so they can be returned directly to the WebAuthn API.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_webauthn_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    credential_id   TEXT NOT NULL UNIQUE,          -- base64url
    public_key      TEXT NOT NULL,                 -- base64url (subjectPublicKeyInfo / raw point)
    algorithm       INTEGER NOT NULL DEFAULT -7,    -- ES256
    counter         INTEGER NOT NULL DEFAULT 0,
    aaguid          TEXT,
    device_name     TEXT,
    transports      JSONB DEFAULT '[]'::jsonb,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_admin
  ON public.admin_webauthn_credentials (admin_id);

-- No RLS policies: service-role only.

-- ------------------------------------------------------------
-- 6. admin_face_sessions — short-lived, revocable admin grants.
--    `grant_token_hash` lets us revoke a grant server-side even though the
--    client only holds a signed JWT in memory.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_face_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id         UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    challenge_id     UUID REFERENCES public.verification_challenges(id) ON DELETE SET NULL,
    grant_token_hash TEXT NOT NULL,
    factor          TEXT NOT NULL DEFAULT 'face',  -- 'face' | 'passkey'
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_sessions_admin
  ON public.admin_face_sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_face_sessions_expiry
  ON public.admin_face_sessions (expires_at);

-- No RLS policies: service-role only.

-- ------------------------------------------------------------
-- 7. Helper: maintenance cleanup of stale challenges / expired grants.
--    Called periodically from the Edge Function (or manually by an admin).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_face_security()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  -- Purge challenges that have been expired/consumed for more than 7 days.
  DELETE FROM public.verification_challenges
  WHERE (expires_at < now() - interval '7 days'
         OR used_at IS NOT NULL AND used_at < now() - interval '7 days');
  v_deleted := v_deleted + ROW_COUNT;

  -- Soft-expire face sessions whose grant has lapsed.
  UPDATE public.admin_face_sessions
  SET revoked_at = now()
  WHERE revoked_at IS NULL AND expires_at < now();
  v_deleted := v_deleted + ROW_COUNT;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_face_security() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_face_security() TO authenticated;
