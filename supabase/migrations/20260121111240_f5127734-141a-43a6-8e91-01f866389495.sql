-- Create call_sessions table for WebRTC signaling
CREATE TABLE public.call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'declined', 'ended', 'missed')),
  sdp_offer TEXT,
  sdp_answer TEXT,
  caller_ice_candidates JSONB DEFAULT '[]'::jsonb,
  receiver_ice_candidates JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for call_sessions
CREATE POLICY "Users can view calls they're part of"
  ON public.call_sessions
  FOR SELECT
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can create calls"
  ON public.call_sessions
  FOR INSERT
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Participants can update calls"
  ON public.call_sessions
  FOR UPDATE
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Callers can delete their calls"
  ON public.call_sessions
  FOR DELETE
  USING (caller_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_call_sessions_conversation ON public.call_sessions(conversation_id);
CREATE INDEX idx_call_sessions_participants ON public.call_sessions(caller_id, receiver_id);
CREATE INDEX idx_call_sessions_status ON public.call_sessions(status) WHERE status = 'ringing';

-- Enable realtime for call signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;

-- Create trigger for updated_at
CREATE TRIGGER update_call_sessions_updated_at
  BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();