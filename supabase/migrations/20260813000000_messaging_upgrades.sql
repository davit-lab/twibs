-- ============================================================
-- Messaging upgrade pack:
--   * per-message read receipts (message_reads)
--   * message search (pg_trgm index + RPC)
--   * pinned messages (is_pinned / pinned_at + RPCs)
--   * forwarded messages (forwarded_from_message_id)
--   * message effects (effect column)
--   * scheduled messages (scheduled_messages + pg_cron dispatch)
--   * optimistic-send reconciliation (client_id)
-- ============================================================

-- ---------- Search index (pg_trgm) ----------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON public.messages USING gin (content gin_trgm_ops);

-- ---------- New columns on messages ----------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS effect TEXT
  CHECK (effect IS NULL OR effect IN ('confetti', 'fireworks', 'laser', 'fire', 'halo'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages(conversation_id) WHERE is_pinned = true;

-- ---------- message_reads table ----------
CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_user
  ON public.message_reads(user_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reads in their conversations" ON public.message_reads;
CREATE POLICY "Users can view reads in their conversations"
ON public.message_reads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.message_reads;
CREATE POLICY "Users can mark messages as read"
ON public.message_reads FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id AND cp.user_id = auth.uid()
  )
);

-- Backfill reads when a participant advances their last_read_at
CREATE OR REPLACE FUNCTION public.backfill_message_reads()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at AND NEW.last_read_at IS NOT NULL THEN
    INSERT INTO public.message_reads (message_id, user_id, read_at)
    SELECT m.id, NEW.user_id, NEW.last_read_at
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.sender_id != NEW.user_id
      AND m.created_at <= NEW.last_read_at
    ON CONFLICT (message_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_backfill_message_reads ON public.conversation_participants;
CREATE TRIGGER trigger_backfill_message_reads
AFTER UPDATE OF last_read_at ON public.conversation_participants
FOR EACH ROW EXECUTE FUNCTION public.backfill_message_reads();

-- Mark reads instantly for participants who already have the chat open
CREATE OR REPLACE FUNCTION public.mark_new_message_read()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.message_reads (message_id, user_id, read_at)
  SELECT NEW.id, cp.user_id, now()
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id != NEW.sender_id
    AND cp.last_read_at IS NOT NULL
    AND cp.last_read_at >= NEW.created_at
  ON CONFLICT (message_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_mark_new_message_read ON public.messages;
CREATE TRIGGER trigger_mark_new_message_read
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.mark_new_message_read();

-- RPC so the client can mark messages read up to a timestamp
CREATE OR REPLACE FUNCTION public.mark_message_reads_up_to(conv_id UUID, read_until TIMESTAMP WITH TIME ZONE)
RETURNS void AS $$
BEGIN
  INSERT INTO public.message_reads (message_id, user_id, read_at)
  SELECT m.id, auth.uid(), read_until
  FROM public.messages m
  WHERE m.conversation_id = conv_id
    AND m.sender_id != auth.uid()
    AND m.created_at <= read_until
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- Pin / unpin RPCs (participants only) ----------
CREATE OR REPLACE FUNCTION public.pin_message(message_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET is_pinned = true, pinned_at = now()
  WHERE id = message_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.unpin_message(message_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET is_pinned = false, pinned_at = NULL
  WHERE id = message_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- Message search RPC ----------
CREATE OR REPLACE FUNCTION public.search_conversation_messages(
  conv_id UUID,
  query TEXT,
  max_results INTEGER DEFAULT 50
)
RETURNS SETOF public.messages AS $$
BEGIN
  IF query IS NULL OR length(trim(query)) = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT m.*
    FROM public.messages m
    WHERE m.conversation_id = conv_id
      AND m.content ILIKE '%' || replace(query, '%', '\%') || '%'
    ORDER BY m.created_at DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- Scheduled messages ----------
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT,
  reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  attachments JSONB,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON public.scheduled_messages(status, send_at);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view scheduled messages in their conversations" ON public.scheduled_messages;
CREATE POLICY "Users can view scheduled messages in their conversations"
ON public.scheduled_messages FOR SELECT
USING (
  sender_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = scheduled_messages.conversation_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can schedule messages" ON public.scheduled_messages;
CREATE POLICY "Users can schedule messages"
ON public.scheduled_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = scheduled_messages.conversation_id AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update their scheduled messages"
ON public.scheduled_messages FOR UPDATE
USING (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can delete their scheduled messages"
ON public.scheduled_messages FOR DELETE
USING (sender_id = auth.uid());

-- Dispatch due scheduled messages into the live thread
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages()
RETURNS integer AS $$
DECLARE
  sm RECORD;
  inserted_id UUID;
  attachments_json JSONB;
  att RECORD;
BEGIN
  FOR sm IN
    SELECT * FROM public.scheduled_messages
    WHERE status = 'pending' AND send_at <= now()
    ORDER BY send_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO public.messages (conversation_id, sender_id, content, reply_to_message_id)
      VALUES (sm.conversation_id, sm.sender_id, COALESCE(sm.content, ''), sm.reply_to_message_id)
      RETURNING id INTO inserted_id;

      attachments_json := COALESCE(sm.attachments, '[]'::jsonb);
      IF jsonb_typeof(attachments_json) = 'array' AND jsonb_array_length(attachments_json) > 0 THEN
        FOR att IN SELECT * FROM jsonb_to_recordset(attachments_json)
          AS x(type text, url text, name text, size bigint, mime_type text, duration real)
        LOOP
          INSERT INTO public.message_attachments
            (message_id, conversation_id, type, url, name, size, mime_type, duration)
          VALUES
            (inserted_id, sm.conversation_id, att.type, att.url, att.name, att.size, att.mime_type, att.duration);
        END LOOP;
      END IF;

      UPDATE public.scheduled_messages SET status = 'sent' WHERE id = sm.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.scheduled_messages SET status = 'cancelled' WHERE id = sm.id;
    END;
  END LOOP;

  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule the dispatcher (runs every minute)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-dispatch') THEN
    PERFORM cron.schedule('scheduled-messages-dispatch', '* * * * *',
      'SELECT public.dispatch_scheduled_messages()');
  END IF;
END $$;

-- ---------- Realtime publication for message_reads ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
  END IF;
END $$;
