-- Chat message media: image/voice/file uploads shared in conversations

-- Storage bucket for chat media (public read, uploads owned by user)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Chat media is publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their chat media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their chat media"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Attachments table, one row per file attached to a message
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'audio', 'file')),
  url TEXT NOT NULL,
  name TEXT,
  size BIGINT,
  mime_type TEXT,
  duration REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_attachments_message ON public.message_attachments(message_id);

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments in their conversations"
ON public.message_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_attachments.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can attach files to their messages"
ON public.message_attachments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_attachments.message_id
      AND m.sender_id = auth.uid()
      AND m.conversation_id = message_attachments.conversation_id
  )
);

CREATE POLICY "Users can delete their attachments"
ON public.message_attachments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_attachments.message_id AND m.sender_id = auth.uid()
  )
);

-- Broadcast attachment changes so participants see them in realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
  END IF;
END $$;
