-- Owner-only permanent deletion of a conversation ("Delete chat").
--
-- Groups/communities record an owner_id; DMs never do, so a DM can never be
-- deleted for everyone. Foreign-key cascades clean up participants, messages,
-- attachments, reactions and live-location sessions automatically.

CREATE OR REPLACE FUNCTION public.delete_conversation(conv_id UUID)
RETURNS void AS $$
DECLARE
  conv_owner UUID;
BEGIN
  SELECT owner_id INTO conv_owner FROM public.conversations WHERE id = conv_id;

  IF conv_owner IS NULL THEN
    RAISE EXCEPTION 'This conversation cannot be deleted';
  END IF;

  IF conv_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the owner can delete this conversation';
  END IF;

  DELETE FROM public.conversations WHERE id = conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.delete_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_conversation(UUID) TO authenticated;
