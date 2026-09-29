-- Extend business attribution beyond posts to every author-bearing table.
--
-- WHY
-- Audit of the live schema showed only `posts` had a business_id. `reels`,
-- `stories`, `interest_posts`, `comments`, `stars`, `saves`, `reposts` and the
-- reel/story interaction tables are all `user_id`-only with
-- `user_id = auth.uid()` INSERT checks. That is precisely the reported bug:
-- switch to "codezero", publish a reel, and the content is stored and rendered
-- as the personal user, because there is nowhere to record the business.
--
-- APPROACH - reuse, do not invent
-- The `posts` implementation (20260928020000_post_business_attribution_rls.sql)
-- is the established pattern: a nullable business_id FK with ON DELETE SET
-- NULL, a single authoritative INSERT policy requiring BOTH row ownership AND
-- business membership, and a trigger that blocks re-attribution on UPDATE.
-- This migration generalises that pattern instead of creating a second system.
--
-- Two things are deliberately NOT done:
--
-- 1. Personal uniqueness is preserved exactly. `stars`, `saves`, `reposts`,
--    `reel_likes` and `story_likes` are UNIQUE on (content_id, user_id). If a
--    business_id column were simply added, starring a post as the business and
--    then as the personal account would collide, and every like-toggle query in
--    the app would need re-scoping. Instead the unconditional unique index is
--    replaced by two PARTIAL unique indexes (personal rows, business rows), so
--    personal dedup behaves byte-for-byte as before while a business can hold
--    its own independent interaction.
--
-- 2. `story_views` and `follows` are intentionally skipped. A story view
--    records who LOOKED, not who authored; `follows` is a personal social
--    relationship and business follows already live in `business_followers`.
--    `post_media` is skipped because it inherits ownership from its post.
--
-- service_role bypasses RLS, so administrative tooling is unaffected.

-- ============================================================================
-- 1. Columns
-- ============================================================================
-- content the business publishes or authors
ALTER TABLE public.reels           ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.stories         ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.interest_posts  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.comments        ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reel_comments   ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.story_replies   ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;

-- interactions the business performs under its own identity
ALTER TABLE public.stars           ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.saves           ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reposts         ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.reel_likes      ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.story_likes     ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reels_business          ON public.reels(business_id);
CREATE INDEX IF NOT EXISTS idx_stories_business        ON public.stories(business_id);
CREATE INDEX IF NOT EXISTS idx_interest_posts_business ON public.interest_posts(business_id);
CREATE INDEX IF NOT EXISTS idx_comments_business       ON public.comments(business_id);
CREATE INDEX IF NOT EXISTS idx_reel_comments_business  ON public.reel_comments(business_id);
CREATE INDEX IF NOT EXISTS idx_story_replies_business  ON public.story_replies(business_id);
CREATE INDEX IF NOT EXISTS idx_stars_business          ON public.stars(business_id);
CREATE INDEX IF NOT EXISTS idx_saves_business          ON public.saves(business_id);
CREATE INDEX IF NOT EXISTS idx_reposts_business        ON public.reposts(business_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_business     ON public.reel_likes(business_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_business    ON public.story_likes(business_id);

-- ============================================================================
-- 3. Reassignment guard (generic; generalises the posts-specific trigger)
-- ============================================================================
-- A policy alone cannot express "business_id unchanged", because WITH CHECK
-- only ever sees the NEW row. Comparing OLD to NEW is what actually prevents a
-- personal post being edited into an attributed one for a business the author
-- does not belong to.
CREATE OR REPLACE FUNCTION public.enforce_business_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.business_id IS NOT DISTINCT FROM OLD.business_id THEN
    RETURN NEW;
  END IF;

  IF NEW.business_id IS NOT NULL THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_business_member(NEW.business_id) THEN
      RAISE EXCEPTION 'You must be a member of this business to act on its behalf'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_business_attribution() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_business_attribution() FROM anon;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reels','stories','interest_posts','comments','reel_comments','story_replies',
    'stars','saves','reposts','reel_likes','story_likes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_enforce_business_attribution ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_enforce_business_attribution
         BEFORE UPDATE OF business_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.enforce_business_attribution()',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 4. Personal dedup preserved via split partial unique indexes
-- ============================================================================
-- Drops the unconditional (content, user) uniqueness and replaces it with:
--   * one personal row per (content, user)
--   * one business row per (content, business)
-- Existing personal rows all have business_id IS NULL, so they fall entirely
-- under the first index and can never collide or change meaning.
DO $$
DECLARE
  t       text;
  content text;
  tables  text[] := ARRAY['stars','saves','reposts','reel_likes','story_likes'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- resolve the content column name for this table
    -- (the table name is bound as a parameter; a bare identifier inside EXECUTE
    --  would be parsed as a SQL column, not a PL/pgSQL variable)
    EXECUTE
      'SELECT a.attname
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ''public'' AND c.relname = $1
          AND a.attname IN (''post_id'',''reel_id'',''story_id'')
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum LIMIT 1'
      INTO content USING t;

    -- the old unique may be a constraint or a bare index; drop whichever exists
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = format('public.%I', t)::regclass
         AND contype = 'u'
         AND pg_get_constraintdef(oid) ILIKE '%(%,%user_id%)%'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        t,
        (SELECT conname FROM pg_constraint
          WHERE conrelid = format('public.%I', t)::regclass
            AND contype = 'u'
            AND pg_get_constraintdef(oid) ILIKE '%(%,%user_id%)%'
          LIMIT 1)
      );
    ELSE
      EXECUTE format('DROP INDEX IF EXISTS public.%I', t || '_' || content || '_user_id_key');
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%I, user_id) WHERE business_id IS NULL',
      t || '_personal_uniq', t, content
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%I, business_id) WHERE business_id IS NOT NULL',
      t || '_business_uniq', t, content
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 5. INSERT policies: one authoritative policy per table
-- ============================================================================
-- Each combines (a) the pre-existing visibility/ownership rule and (b) the
-- business-membership rule. Reusing the original predicates deliberately
-- preserves security hardening from 20260806190000_security_hardening.sql
-- (e.g. comments/stars may only target a visible post).
--
-- There is exactly ONE insert policy per table, so the OR-permissive bypass
-- that was closed for posts in 20260928020000 cannot recur here.

-- reels ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create reels" ON public.reels;
CREATE POLICY "Authors can create reels for themselves or their business"
  ON public.reels FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- stories -------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create stories" ON public.stories;
CREATE POLICY "Authors can create stories for themselves or their business"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- interest_posts ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create interest posts" ON public.interest_posts;
CREATE POLICY "Authors can create interest posts for themselves or their business"
  ON public.interest_posts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- comments ------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create comments" ON public.comments;
CREATE POLICY "Authors can comment for themselves or their business"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
    AND EXISTS (
      SELECT 1 FROM public.posts
       WHERE posts.id = comments.post_id
         AND public.is_post_visible(posts.*)
    )
  );

-- reel_comments -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can comment" ON public.reel_comments;
CREATE POLICY "Authors can comment on reels for themselves or their business"
  ON public.reel_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- story_replies -------------------------------------------------------------
DROP POLICY IF EXISTS "Users can reply to visible stories" ON public.story_replies;
CREATE POLICY "Authors can reply to stories for themselves or their business"
  ON public.story_replies FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
    AND public.is_story_visible(story_id)
    AND char_length(btrim(content)) > 0
    AND char_length(content) <= 500
  );

-- stars ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can star posts" ON public.stars;
CREATE POLICY "Authors can star posts for themselves or their business"
  ON public.stars FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
    AND EXISTS (
      SELECT 1 FROM public.posts
       WHERE posts.id = stars.post_id
         AND public.is_post_visible(posts.*)
    )
  );

-- saves ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can save posts" ON public.saves;
CREATE POLICY "Authors can save posts for themselves or their business"
  ON public.saves FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- reposts -------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can repost" ON public.reposts;
CREATE POLICY "Authors can repost for themselves or their business"
  ON public.reposts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- reel_likes ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can like reels" ON public.reel_likes;
CREATE POLICY "Authors can like reels for themselves or their business"
  ON public.reel_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
  );

-- story_likes ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can like visible stories" ON public.story_likes;
CREATE POLICY "Authors can like stories for themselves or their business"
  ON public.story_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (business_id IS NULL OR public.is_business_member(business_id))
    AND public.is_story_visible(story_id)
  );
