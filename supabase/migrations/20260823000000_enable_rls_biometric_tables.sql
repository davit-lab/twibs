-- CRITICAL FIX: Enable Row Level Security on biometric/admin security
-- tables that were created without it. Without RLS enabled, Supabase
-- PostgREST exposes the table to anonymous and authenticated access
-- regardless of whether any policies exist.

ALTER TABLE public.admin_biometric_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_face_sessions ENABLE ROW LEVEL SECURITY;
