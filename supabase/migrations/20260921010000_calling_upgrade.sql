-- Calling system upgrade.
-- Extends call_sessions statuses to support the full call lifecycle
-- (cancelled, busy) and adds a human-readable ended_reason so the UI can
-- distinguish declined / cancelled / busy / no-answer / failed endings.

-- Widen the status CHECK constraint (additive: all previously valid values remain valid).
ALTER TABLE public.call_sessions DROP CONSTRAINT IF EXISTS call_sessions_status_check;
ALTER TABLE public.call_sessions
  ADD CONSTRAINT call_sessions_status_check
  CHECK (status IN ('ringing', 'accepted', 'declined', 'ended', 'missed', 'cancelled', 'busy'));

-- Reason the call finished; used by the end screen and call history.
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS ended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_call_sessions_receiver_ringing
  ON public.call_sessions (receiver_id)
  WHERE status = 'ringing';