-- Promote @sabuka17 to admin.
-- Runs as a one-off data change. Safe to re-run (ON CONFLICT DO NOTHING).
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::public.app_role
FROM public.profiles
WHERE username = 'sabuka17'
ON CONFLICT (user_id, role) DO NOTHING;
