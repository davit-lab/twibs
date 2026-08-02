-- Create call_blocks table for blocking users from calling
CREATE TABLE public.call_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE public.call_blocks ENABLE ROW LEVEL SECURITY;

-- Users can view their own blocks
CREATE POLICY "Users can view their call blocks"
ON public.call_blocks FOR SELECT
USING (blocker_id = auth.uid());

-- Users can block others
CREATE POLICY "Users can block others from calling"
ON public.call_blocks FOR INSERT
WITH CHECK (blocker_id = auth.uid());

-- Users can unblock
CREATE POLICY "Users can unblock"
ON public.call_blocks FOR DELETE
USING (blocker_id = auth.uid());

-- Add do_not_disturb column to user_preferences
ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS do_not_disturb BOOLEAN DEFAULT false;

-- Add index for faster lookups
CREATE INDEX idx_call_blocks_blocked ON public.call_blocks(blocked_id);
CREATE INDEX idx_call_blocks_blocker ON public.call_blocks(blocker_id);