-- Message replies: each message may reference the message it replies to
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id);

-- Verification: uncomment and run after applying
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'reply_to_message_id';
