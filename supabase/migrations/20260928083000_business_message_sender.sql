-- Business message sender identity
-- ----------------------------------------------------------------------------
-- Why this migration exists
--
-- 20260928060000_business_conversations.sql gave a *conversation* a business
-- identity, but it never recorded which identity actually sent a *message*.
-- `messages.sender_id` is always a user id, so a business reply and a personal
-- reply by the same human are byte-for-byte identical in the table. The only
-- way the client could tell them apart was to look at the conversation and
-- assume every message in a business thread came from the business -- which
-- silently relabelled the customer's own messages and made impersonation of
-- the business indistinguishable from a genuine business reply.
--
-- This adds an explicit, nullable `sender_business_id`:
--   NULL              -> a personal message (unchanged personal behaviour)
--   <business uuid>   -> sent *as* that business, by one of its members
--
-- The identity is a stored fact on the row, not a runtime inference.

-- ----------------------------------------------------------------------------
-- 1. Column
-- ----------------------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_business_id uuid
  REFERENCES public.advertiser_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.sender_business_id IS
  'Business identity this message was sent as. NULL means the message was sent as the personal account of sender_id. Set only for genuine members of that business.';

-- Supports "show me everything this business has said" and the render-time
-- identity lookup on the message list.
CREATE INDEX IF NOT EXISTS idx_messages_sender_business
  ON public.messages(sender_business_id)
  WHERE sender_business_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Backfill
-- ----------------------------------------------------------------------------
-- Only messages whose author is a member of the conversation's business can be
-- attributed to that business. A customer's messages are left NULL on purpose:
-- guessing would recreate the exact bug this column exists to remove.
--
-- Genuinely ambiguous history (an owner who is also a member of the business
-- they are talking to) is accepted as the business side, which matches the
-- product behaviour of the owner answering as the business.
UPDATE public.messages m
SET sender_business_id = c.business_id
FROM public.conversations c
WHERE c.id = m.conversation_id
  AND c.business_id IS NOT NULL
  AND m.sender_business_id IS NULL
  AND public.is_business_member_of(c.business_id, m.sender_id);

-- ----------------------------------------------------------------------------
-- 3. Hardened INSERT policy
-- ----------------------------------------------------------------------------
-- The old policy only checked `sender_id = auth.uid()` plus "am I somehow
-- attached to this thread". Once `sender_business_id` is a client-writable
-- column that is no longer enough: without this check any participant could
-- write `sender_business_id` and have their message render under the business
-- name, i.e. impersonate it. The business branch therefore asserts all three
-- of: the column matches this conversation's own business, the caller is a
-- member of *that* business, and the caller is the real sender.
--
-- The personal branch is byte-for-byte the previous behaviour, so personal DMs
-- and business DMs from customers are unaffected.
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;

CREATE POLICY "Users can send messages to their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
    )
    AND (
      CASE
        WHEN messages.sender_business_id IS NULL THEN EXISTS (
          SELECT 1
          FROM public.conversation_participants cp
          WHERE cp.conversation_id = messages.conversation_id
            AND (
              cp.user_id = auth.uid()
              OR public.is_business_member_of(cp.business_id, auth.uid())
            )
        )
        ELSE EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = messages.conversation_id
            AND c.business_id = messages.sender_business_id
            AND public.is_business_member_of(messages.sender_business_id, auth.uid())
        )
      END
    )
  );
