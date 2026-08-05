-- ============================================================
-- Live location sharing inside conversations.
--
-- A user can start a live location session in a chat for a fixed
-- duration (15 min / 1 hour). Their device's geolocation is
-- written to live_location_sessions.current_lat/lng in near-real
-- time, and other participants see the marker move on a map.
-- An announcement message links to the session so the live map
-- appears inline in the thread.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.live_location_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_location_sessions_conversation
  ON public.live_location_sessions(conversation_id);
CREATE INDEX idx_live_location_sessions_user
  ON public.live_location_sessions(user_id);
CREATE INDEX idx_live_location_sessions_message
  ON public.live_location_sessions(message_id);

-- Announcement message that carries the map into the thread
ALTER TABLE public.messages
  ADD COLUMN location_session_id UUID REFERENCES public.live_location_sessions(id) ON DELETE CASCADE;

CREATE INDEX idx_messages_location_session ON public.messages(location_session_id)
  WHERE location_session_id IS NOT NULL;

-- RLS: only participants of the conversation can see the sessions in it
ALTER TABLE public.live_location_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view live locations in their conversations"
ON public.live_location_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = live_location_sessions.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Participants can start live location sharing"
ON public.live_location_sessions FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = live_location_sessions.conversation_id AND cp.user_id = auth.uid()
  )
);

-- Only the sharer can update their own session (positions + stop)
CREATE POLICY "Sharers can update their own live location"
ON public.live_location_sessions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sharers can delete their own live location"
ON public.live_location_sessions FOR DELETE
USING (auth.uid() = user_id);

-- Broadcast session updates so participants see the marker move
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_location_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_location_sessions;
  END IF;
END $$;
