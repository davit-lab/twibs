-- Anonymous confession wall — replaces "Popular now" on the desktop feed.
-- Confessions are stored WITHOUT an author (no user_id), so nobody can be
-- traced. The "Guess" mechanic counts how many people think they know who
-- wrote each confession.

CREATE TABLE public.confessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  guess_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;

-- Anyone (including signed-out) can read the wall.
CREATE POLICY "confessions are public to read"
  ON public.confessions FOR SELECT
  USING (true);

-- Signed-in users can drop anonymous confessions.
CREATE POLICY "authenticated users can confess"
  ON public.confessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Increment guess_count atomically (bypasses RLS via SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.increment_confession_guess(confession_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.confessions
  SET guess_count = guess_count + 1
  WHERE id = confession_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_confession_guess(UUID) TO authenticated;
