-- Re-point group FKs from auth.users(id) to public.profiles(user_id).
-- PostgREST needs FKs that reference profiles for embedded joins like
-- profiles!groups_creator_id_fkey. The rebuild referenced auth.users, which
-- made every embedded profile join fail with 400.

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_creator_id_fkey;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_user_id_fkey;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.group_posts DROP CONSTRAINT IF EXISTS group_posts_user_id_fkey;
ALTER TABLE public.group_posts
  ADD CONSTRAINT group_posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.group_post_likes DROP CONSTRAINT IF EXISTS group_post_likes_user_id_fkey;
ALTER TABLE public.group_post_likes
  ADD CONSTRAINT group_post_likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.group_post_comments DROP CONSTRAINT IF EXISTS group_post_comments_user_id_fkey;
ALTER TABLE public.group_post_comments
  ADD CONSTRAINT group_post_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Verify: each row should reference profiles(user_id)
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'groups_creator_id_fkey',
  'group_members_user_id_fkey',
  'group_posts_user_id_fkey',
  'group_post_likes_user_id_fkey',
  'group_post_comments_user_id_fkey'
)
ORDER BY conname;
