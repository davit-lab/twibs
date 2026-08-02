-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM (
  'follow',
  'follow_request',
  'follow_accepted',
  'star',
  'mention',
  'message',
  'comment',
  'system'
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  actor_id UUID,
  target_type TEXT,
  target_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- Function to create notification on follow
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  notif_type public.notification_type;
  notif_title TEXT;
BEGIN
  -- Get actor's display name
  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.follower_id;

  -- Determine notification type based on status
  IF NEW.status = 'pending' THEN
    notif_type := 'follow_request';
    notif_title := actor_name || ' wants to follow you';
  ELSIF NEW.status = 'accepted' THEN
    -- Check if this is a new follow or an accepted request
    IF OLD IS NULL OR OLD.status = 'pending' THEN
      IF OLD IS NULL THEN
        notif_type := 'follow';
        notif_title := actor_name || ' started following you';
      ELSE
        -- This is an accepted request, notify the requester
        notif_type := 'follow_accepted';
        INSERT INTO public.notifications (user_id, type, title, actor_id, target_type, target_id)
        VALUES (NEW.follower_id, 'follow_accepted', 'Your follow request was accepted', NEW.following_id, 'profile', NEW.following_id);
        
        notif_type := 'follow';
        notif_title := actor_name || ' started following you';
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Create notification for the user being followed
  INSERT INTO public.notifications (user_id, type, title, actor_id, target_type, target_id)
  VALUES (NEW.following_id, notif_type, notif_title, NEW.follower_id, 'profile', NEW.follower_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_notify_on_follow
AFTER INSERT OR UPDATE ON public.follows
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_follow();

-- Function to create notification on star
CREATE OR REPLACE FUNCTION public.notify_on_star()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  post_owner_id UUID;
BEGIN
  -- Get actor's display name
  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Get post owner
  SELECT user_id INTO post_owner_id
  FROM public.posts
  WHERE id = NEW.post_id;

  -- Don't notify if user stars their own post
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Create notification
  INSERT INTO public.notifications (user_id, type, title, actor_id, target_type, target_id)
  VALUES (post_owner_id, 'star', actor_name || ' starred your post', NEW.user_id, 'post', NEW.post_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_notify_on_star
AFTER INSERT ON public.stars
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_star();

-- Function to create notification on new message
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  recipient_id UUID;
BEGIN
  -- Get sender's display name
  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  -- Get the other participant in the conversation
  SELECT user_id INTO recipient_id
  FROM public.conversation_participants
  WHERE conversation_id = NEW.conversation_id
  AND user_id != NEW.sender_id
  LIMIT 1;

  IF recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create notification
  INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
  VALUES (recipient_id, 'message', 'New message from ' || actor_name, LEFT(NEW.content, 100), NEW.sender_id, 'conversation', NEW.conversation_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_notify_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_message();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;