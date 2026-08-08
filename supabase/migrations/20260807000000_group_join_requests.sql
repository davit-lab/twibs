-- ============================================================
-- Group join requests
-- Private groups are visible to everyone, but joining requires
-- approval from an owner, admin, or moderator.
-- Self-contained / idempotent.
-- ============================================================

-- 1. Join requests table
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_join_requests
  DROP CONSTRAINT IF EXISTS group_join_requests_status_check;
ALTER TABLE public.group_join_requests
  ADD CONSTRAINT group_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'declined', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id
  ON public.group_join_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id
  ON public.group_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_status
  ON public.group_join_requests(status);

ALTER TABLE public.group_join_requests OWNER TO postgres;
ALTER TABLE public.group_join_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own join requests" ON public.group_join_requests;
CREATE POLICY "Users can view their own join requests"
ON public.group_join_requests FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Moderators can view requests for their groups" ON public.group_join_requests;
CREATE POLICY "Moderators can view requests for their groups"
ON public.group_join_requests FOR SELECT
USING (public.is_group_moderator_or_above(group_id));

DROP POLICY IF EXISTS "Users can create join requests" ON public.group_join_requests;
CREATE POLICY "Users can create join requests"
ON public.group_join_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own join requests" ON public.group_join_requests;
CREATE POLICY "Users can update their own join requests"
ON public.group_join_requests FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own join requests" ON public.group_join_requests;
CREATE POLICY "Users can delete their own join requests"
ON public.group_join_requests FOR DELETE
USING (user_id = auth.uid());

-- ============================================================
-- 2. Make private groups visible to everyone
-- (posts/members remain restricted to members)
-- ============================================================
DROP POLICY IF EXISTS "Public groups are visible to everyone" ON public.groups;
DROP POLICY IF EXISTS "Private groups are visible to members" ON public.groups;
DROP POLICY IF EXISTS "All groups are visible to everyone" ON public.groups;
CREATE POLICY "All groups are visible to everyone"
ON public.groups FOR SELECT
USING (true);

-- ============================================================
-- 3. Request to join (public groups join instantly, private
-- groups create a pending request)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_to_join_group(target_group_id UUID)
RETURNS TEXT AS $$
DECLARE
  g_privacy TEXT;
  existing_status TEXT;
  current_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT privacy INTO g_privacy
  FROM public.groups
  WHERE id = target_group_id;

  IF g_privacy IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  SELECT role INTO current_role
  FROM public.group_members
  WHERE group_id = target_group_id AND user_id = auth.uid();

  IF current_role IS NOT NULL THEN
    RAISE EXCEPTION 'You are already a member of this group';
  END IF;

  IF g_privacy = 'public' THEN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (target_group_id, auth.uid(), 'member');
    RETURN 'joined';
  END IF;

  SELECT status INTO existing_status
  FROM public.group_join_requests
  WHERE group_id = target_group_id AND user_id = auth.uid();

  IF existing_status = 'pending' THEN
    RETURN 'requested';
  ELSIF existing_status = 'approved' THEN
    RAISE EXCEPTION 'Your join request was already approved';
  END IF;

  -- declined / cancelled: allow the user to apply again
  INSERT INTO public.group_join_requests (group_id, user_id, status)
  VALUES (target_group_id, auth.uid(), 'pending')
  ON CONFLICT (group_id, user_id) DO UPDATE
  SET status = 'pending', created_at = now(), handled_at = NULL, handled_by = NULL;

  RETURN 'requested';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.request_to_join_group OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_to_join_group(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_to_join_group(UUID) TO authenticated, anon;

-- ============================================================
-- 4. Approve / decline / cancel requests
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_group_join_request(request_id UUID)
RETURNS void AS $$
DECLARE
  g_id UUID;
  u_id UUID;
  r_status TEXT;
BEGIN
  SELECT group_id, user_id, status INTO g_id, u_id, r_status
  FROM public.group_join_requests
  WHERE id = request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;

  IF NOT public.is_group_moderator_or_above(g_id) THEN
    RAISE EXCEPTION 'Only group owners, admins, or moderators can approve join requests';
  END IF;

  IF r_status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been handled';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (g_id, u_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  UPDATE public.group_join_requests
  SET status = 'approved', handled_at = now(), handled_by = auth.uid()
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.approve_group_join_request OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_group_join_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_group_join_request(UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.decline_group_join_request(request_id UUID)
RETURNS void AS $$
DECLARE
  g_id UUID;
  r_status TEXT;
BEGIN
  SELECT group_id, status INTO g_id, r_status
  FROM public.group_join_requests
  WHERE id = request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;

  IF NOT public.is_group_moderator_or_above(g_id) THEN
    RAISE EXCEPTION 'Only group owners, admins, or moderators can decline join requests';
  END IF;

  IF r_status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been handled';
  END IF;

  UPDATE public.group_join_requests
  SET status = 'declined', handled_at = now(), handled_by = auth.uid()
  WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.decline_group_join_request OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decline_group_join_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_group_join_request(UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.cancel_group_join_request(request_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.group_join_requests
  SET status = 'cancelled', handled_at = now(), handled_by = auth.uid()
  WHERE id = request_id AND user_id = auth.uid() AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.cancel_group_join_request OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_group_join_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_group_join_request(UUID) TO authenticated, anon;

-- ============================================================
-- 5. join_group can no longer be used to join private groups
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_group(target_group_id UUID)
RETURNS void AS $$
DECLARE
  g_privacy TEXT;
BEGIN
  SELECT privacy INTO g_privacy FROM public.groups WHERE id = target_group_id;

  IF g_privacy = 'private' THEN
    RAISE EXCEPTION 'Private groups require approval to join';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = target_group_id AND user_id = auth.uid()
  ) THEN
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (target_group_id, auth.uid(), 'member');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

ALTER FUNCTION public.join_group OWNER TO postgres;

-- ============================================================
-- 6. Notify moderators of new requests, and notify requesters
-- when their request is approved or declined
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_group_join_request()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
  group_name TEXT;
  rec RECORD;
BEGIN
  -- A new / re-submitted pending request: notify the group staff
  IF NEW.status = 'pending' THEN
    SELECT display_name INTO actor_name FROM public.profiles WHERE user_id = NEW.user_id;
    actor_name := COALESCE(actor_name, 'Someone');

    SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;
    group_name := COALESCE(group_name, 'a group');

    FOR rec IN
      SELECT user_id
      FROM public.group_members
      WHERE group_id = NEW.group_id
        AND role IN ('owner', 'admin', 'moderator')
        AND user_id <> NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
      VALUES (
        rec.user_id,
        'system',
        actor_name || ' requested to join ' || group_name,
        'Review this request to let them in',
        NEW.user_id,
        'group',
        NEW.group_id
      );
    END LOOP;

    RETURN NEW;
  END IF;

  -- The requester's pending request was approved or declined
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'declined') THEN
    SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;
    group_name := COALESCE(group_name, 'a group');

    INSERT INTO public.notifications (user_id, type, title, body, actor_id, target_type, target_id)
    VALUES (
      NEW.user_id,
      'system',
      CASE WHEN NEW.status = 'approved'
        THEN 'Your request to join ' || group_name || ' was approved'
        ELSE 'Your request to join ' || group_name || ' was declined' END,
      CASE WHEN NEW.status = 'approved'
        THEN 'You can now join the group'
        ELSE 'The group owners declined your request' END,
      NEW.handled_by,
      'group',
      NEW.group_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;

DROP TRIGGER IF EXISTS notify_on_group_join_request_trigger ON public.group_join_requests;
CREATE TRIGGER notify_on_group_join_request_trigger
AFTER INSERT OR UPDATE ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_group_join_request();

-- ============================================================
-- 7. Verification
-- ============================================================
SELECT proname, proowner::regrole AS owner
FROM pg_proc
WHERE proname IN (
  'request_to_join_group',
  'approve_group_join_request',
  'decline_group_join_request',
  'cancel_group_join_request',
  'join_group'
)
ORDER BY proname;
