-- ============================================================
-- Keep message notifications in sync with edits and unsends.
--
-- Problem: notifications for messages were created once at
-- INSERT with a body preview (LEFT(content, 100)). When the
-- sender edited or unsent (deleted) a message, the recipient's
-- notification still showed the stale, unedited preview.
--
-- Fix:
--   1. Link each message notification to its message via a new
--      message_id column (FK with ON DELETE CASCADE, so unsending
--      a message automatically removes its notifications).
--   2. notify_on_message now records message_id on insert.
--   3. New AFTER UPDATE trigger replaces the notification body
--      with the edited content, so the unedited preview is gone.
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE INDEX idx_notifications_message_id
  ON public.notifications(message_id)
  WHERE message_id IS NOT NULL;

-- Track the originating message when creating the notification
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  rec RECORD;
BEGIN
  SELECT display_name INTO actor_name FROM public.profiles WHERE user_id = NEW.sender_id;
  actor_name := COALESCE(actor_name, 'Someone');

  FOR rec IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id != NEW.sender_id
      AND cp.muted = false
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id, message_id)
    VALUES (rec.user_id, 'message', 'New message from ' || actor_name, LEFT(NEW.content, 100), NEW.sender_id, 'conversation', NEW.conversation_id, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- When a message is edited, replace the unedited preview in its
-- notifications with the edited content.
CREATE OR REPLACE FUNCTION public.sync_message_notification_on_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    UPDATE public.notifications
    SET body = LEFT(NEW.content, 100)
    WHERE message_id = OLD.id AND type = 'message';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_sync_message_notification_on_edit
AFTER UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_message_notification_on_edit();
