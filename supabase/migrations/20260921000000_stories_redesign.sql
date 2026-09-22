-- Stories v2: creative overlays + reactions.
--
-- Both changes are additive and migration-safe:
--   * stories.overlays          – JSON array of client-rendered creative elements
--                                 (text / stickers / draw strokes / css filter).
--                                 Existing stories get '[]' and keep rendering.
--   * story_likes.reaction      – which reaction a viewer tapped (default 'like').
--                                 Existing likes remain valid.
--
-- No RLS/policy changes, no table/column renames, no data movement.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS overlays JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.story_likes
  ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';