-- Create user_bans table for tracking suspensions
CREATE TABLE public.user_bans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  banned_by UUID NOT NULL,
  reason TEXT NOT NULL,
  banned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE, -- NULL means permanent
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_user_bans_user_id ON public.user_bans(user_id);
CREATE INDEX idx_user_bans_active ON public.user_bans(user_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all bans"
ON public.user_bans
FOR SELECT
USING (is_admin_or_moderator());

CREATE POLICY "Admins can create bans"
ON public.user_bans
FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update bans"
ON public.user_bans
FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Admins can delete bans"
ON public.user_bans
FOR DELETE
USING (is_admin());

-- Users can see if they are banned (to show ban message)
CREATE POLICY "Users can view their own bans"
ON public.user_bans
FOR SELECT
USING (user_id = auth.uid());

-- Function to check if user is currently banned
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Function to get active ban details
CREATE OR REPLACE FUNCTION public.get_active_ban(_user_id UUID)
RETURNS TABLE(reason TEXT, expires_at TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT reason, expires_at FROM public.user_bans
  WHERE user_id = _user_id
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1
$$;

-- Trigger for updated_at
CREATE TRIGGER update_user_bans_updated_at
BEFORE UPDATE ON public.user_bans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();