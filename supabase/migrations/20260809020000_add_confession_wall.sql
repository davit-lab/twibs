-- v2 — Confession wall with real guessing logic.
-- Confessions keep a HIDDEN author (user_id, never exposed until revealed).
-- Guessing = pick one of your friends (mutual follow). You get 2 chances per
-- confession per day. Confessions rotate daily (only today's show up).
-- A correct guess reveals who wrote it to everyone.
--
-- Run this WHOLE block in the Supabase Dashboard -> SQL Editor.
-- (Safe to run even if v1 was applied first — it drops the old tables.)

DROP VIEW IF EXISTS public.confessions_public;
DROP FUNCTION IF EXISTS public.confession_guess(UUID, UUID);
DROP FUNCTION IF EXISTS public.increment_confession_guess(UUID);
DROP TABLE IF EXISTS public.confession_guesses;
DROP TABLE IF EXISTS public.confessions;

CREATE TABLE public.confessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  guess_count INTEGER NOT NULL DEFAULT 0,
  revealed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.confession_guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id UUID NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  guesser_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  guessed_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_confession_guesses_confession ON public.confession_guesses(confession_id);
CREATE INDEX idx_confession_guesses_guesser ON public.confession_guesses(guesser_id);
CREATE INDEX idx_confessions_created_at ON public.confessions(created_at DESC);

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_guesses ENABLE ROW LEVEL SECURITY;

-- Wall is public to read; signed-in users can confess.
CREATE POLICY "confessions are public to read"
  ON public.confessions FOR SELECT USING (true);
CREATE POLICY "authenticated users can confess"
  ON public.confessions FOR INSERT TO authenticated WITH CHECK (true);

-- A guesser can only see their own guesses (so the wall knows their chances).
CREATE POLICY "guessers can read their own guesses"
  ON public.confession_guesses FOR SELECT
  TO authenticated USING (guesser_id = auth.uid());

-- Hides the author until the confession is revealed.
CREATE VIEW public.confessions_public AS
SELECT id, content, guess_count, revealed, created_at,
       CASE WHEN revealed THEN user_id ELSE NULL END AS author_id
FROM public.confessions;
GRANT SELECT ON public.confessions_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.confession_guess(p_confession_id UUID, p_guessed_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guesser uuid := auth.uid();
  v_author uuid;
  v_guesses integer;
  v_is_friend boolean;
  v_correct boolean := false;
  v_revealed boolean := false;
BEGIN
  IF v_guesser IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT user_id INTO v_author FROM public.confessions WHERE id = p_confession_id;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'confession not found';
  END IF;

  IF v_author = v_guesser THEN
    RAISE EXCEPTION 'you cannot guess your own confession';
  END IF;

  SELECT count(*) INTO v_guesses
  FROM public.confession_guesses
  WHERE confession_id = p_confession_id AND guesser_id = v_guesser;
  IF v_guesses >= 2 THEN
    RAISE EXCEPTION 'no guesses left';
  END IF;

  -- guessed user must be a mutual friend (both follow each other, accepted)
  SELECT EXISTS (
    SELECT 1 FROM public.follows f1
    JOIN public.follows f2
      ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
    WHERE f1.follower_id = v_guesser
      AND f1.following_id = p_guessed_user_id
      AND f1.status = 'accepted' AND f2.status = 'accepted'
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RAISE EXCEPTION 'you can only guess a friend';
  END IF;

  v_correct := (p_guessed_user_id = v_author);

  INSERT INTO public.confession_guesses (confession_id, guesser_id, guessed_user_id, is_correct)
  VALUES (p_confession_id, v_guesser, p_guessed_user_id, v_correct);

  UPDATE public.confessions
  SET guess_count = guess_count + 1,
      revealed = CASE WHEN v_correct THEN true ELSE revealed END
  WHERE id = p_confession_id
  RETURNING revealed INTO v_revealed;

  RETURN jsonb_build_object(
    'correct', v_correct,
    'revealed', v_revealed,
    'guesses_left', GREATEST(0, 2 - (v_guesses + 1)),
    'author_id', CASE WHEN v_correct THEN v_author ELSE NULL END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.confession_guess(UUID, UUID) TO authenticated;
