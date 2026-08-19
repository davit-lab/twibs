-- Mention notifications: when a post or comment contains @username,
-- notify the mentioned user (ignoring self-mentions).
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS TRIGGER AS $$
DECLARE
  mention_username TEXT;
  mentioned_user_id UUID;
  author_name TEXT;
  post_owner_id UUID;
  target_post_id UUID;
BEGIN
  SELECT display_name INTO author_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  IF author_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'comments' THEN
    target_post_id := NEW.post_id;
  ELSE
    target_post_id := NEW.id;
  END IF;

  FOR mention_username IN
    SELECT DISTINCT lower((m.match)[2])
    FROM (
      SELECT regexp_matches(NEW.content, '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,30})', 'g') AS match
    ) m
  LOOP
    SELECT user_id INTO mentioned_user_id
    FROM public.profiles
    WHERE lower(username) = mention_username
    LIMIT 1;

    IF mentioned_user_id IS NOT NULL AND mentioned_user_id <> NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
      VALUES (
        mentioned_user_id,
        'mention',
        author_name || ' mentioned you in a ' ||
          CASE WHEN TG_TABLE_NAME = 'comments' THEN 'comment' ELSE 'post' END,
        LEFT(NEW.content, 100),
        NEW.user_id,
        'post',
        target_post_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_notify_mention_on_post ON public.posts;
CREATE TRIGGER trigger_notify_mention_on_post
AFTER INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_mention();

DROP TRIGGER IF EXISTS trigger_notify_mention_on_comment ON public.comments;
CREATE TRIGGER trigger_notify_mention_on_comment
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_mention();
