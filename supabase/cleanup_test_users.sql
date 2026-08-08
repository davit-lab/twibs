-- ============================================================
-- Cleanup: remove test users created during development/testing
-- Project: mroudkddozvlpcxedank
-- Run this in Supabase Dashboard -> SQL Editor
-- (this is a one-off manual script, NOT a migration)
-- ============================================================

BEGIN;

-- Test users to remove:
--   testauthor_1786184874678@example.com (Test Author)
--   receiver_1786186049015@example.com
--   receiver_1786186152201@example.com
--   receiver_1786186357201@example.com
--   receiver_1786186426223@example.com
--   receiver_1786186501832@example.com
--   receiver_1786186540735@example.com
--   testmore1786100671@example.com
--   testmore1786100681@example.com
CREATE TEMP TABLE tu AS
SELECT unnest(ARRAY[
  'ae9b2983-80fb-4b1a-b9fb-d2b4cae7a5f6',
  'd5d94f2f-dd97-4c0c-ba35-0d7102fc61d5',
  'f2e73231-5ba6-46c1-9cc1-4a0d460389b7',
  'd4ddb3f2-df53-471d-8fd4-fb81c847f38d',
  '0bbb61d6-7c1f-419e-9f64-0701f94d7249',
  'd0ef9fa5-0bd6-435e-8b31-c0c07f6bc345',
  '1901b064-60f4-4657-8e2d-4d0861401321',
  '8eab2715-c9b2-42ab-b2e8-21abcf4895ee',
  '0050f843-7599-4d89-b616-b58d37451973'
])::uuid AS user_id;

-- 1) Messaging
DELETE FROM message_attachments
WHERE conversation_id IN (SELECT p.conversation_id FROM conversation_participants p WHERE p.user_id IN (SELECT user_id FROM tu))
   OR message_id IN (SELECT id FROM messages WHERE sender_id IN (SELECT user_id FROM tu));

DELETE FROM message_reactions
WHERE user_id IN (SELECT user_id FROM tu)
   OR message_id IN (
     SELECT id FROM messages
     WHERE sender_id IN (SELECT user_id FROM tu)
        OR conversation_id IN (SELECT p.conversation_id FROM conversation_participants p WHERE p.user_id IN (SELECT user_id FROM tu))
   );

DELETE FROM messages
WHERE sender_id IN (SELECT user_id FROM tu)
   OR conversation_id IN (SELECT p.conversation_id FROM conversation_participants p WHERE p.user_id IN (SELECT user_id FROM tu));

-- 2) Posts + children
DELETE FROM comment_votes
WHERE comment_id IN (
  SELECT id FROM comments
  WHERE user_id IN (SELECT user_id FROM tu)
     OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM tu))
);

DELETE FROM comments
WHERE parent_id IN (
  SELECT id FROM comments
  WHERE user_id IN (SELECT user_id FROM tu)
     OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM tu))
);

DELETE FROM comments
WHERE user_id IN (SELECT user_id FROM tu)
   OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM post_media
WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM stars
WHERE user_id IN (SELECT user_id FROM tu)
   OR post_id IN (SELECT id FROM posts WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM posts WHERE user_id IN (SELECT user_id FROM tu);

-- 3) Books / chapters / purchases / reading
DELETE FROM chapters
WHERE book_id IN (SELECT id FROM books WHERE author_id IN (SELECT user_id FROM tu));

DELETE FROM book_purchases
WHERE book_id IN (SELECT id FROM books WHERE author_id IN (SELECT user_id FROM tu))
   OR author_id IN (SELECT user_id FROM tu)
   OR buyer_id IN (SELECT user_id FROM tu);

DELETE FROM reading_progress
WHERE user_id IN (SELECT user_id FROM tu)
   OR book_id IN (SELECT id FROM books WHERE author_id IN (SELECT user_id FROM tu));

DELETE FROM user_library
WHERE user_id IN (SELECT user_id FROM tu)
   OR book_id IN (SELECT id FROM books WHERE author_id IN (SELECT user_id FROM tu));

DELETE FROM books WHERE author_id IN (SELECT user_id FROM tu);

-- 4) Stories / reels + children
DELETE FROM story_views
WHERE viewer_id IN (SELECT user_id FROM tu)
   OR story_id IN (SELECT id FROM stories WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM stories WHERE user_id IN (SELECT user_id FROM tu);

DELETE FROM reel_comment_likes
WHERE user_id IN (SELECT user_id FROM tu)
   OR comment_id IN (SELECT id FROM reel_comments WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM reel_comments
WHERE user_id IN (SELECT user_id FROM tu)
   OR reel_id IN (SELECT id FROM reels WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM reel_likes
WHERE user_id IN (SELECT user_id FROM tu)
   OR reel_id IN (SELECT id FROM reels WHERE user_id IN (SELECT user_id FROM tu));

DELETE FROM reels WHERE user_id IN (SELECT user_id FROM tu);

-- 5) Interest posts
DELETE FROM interest_post_comments WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM interest_post_likes
WHERE user_id IN (SELECT user_id FROM tu)
   OR post_id IN (SELECT id FROM interest_posts WHERE user_id IN (SELECT user_id FROM tu));
DELETE FROM interest_posts WHERE user_id IN (SELECT user_id FROM tu);

-- 6) Library / collections
DELETE FROM library_comments WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM library_likes WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM library_items WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM collection_items
WHERE collection_id IN (SELECT id FROM collections WHERE user_id IN (SELECT user_id FROM tu));
DELETE FROM collections WHERE user_id IN (SELECT user_id FROM tu);

-- 7) Reading / user-account tables
DELETE FROM reading_logs WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM reading_streaks WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM reading_badges WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM user_interests WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM user_roles WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM user_preferences WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM login_sessions WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM subscriptions WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM author_earnings WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM author_stripe_accounts WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM live_location_sessions WHERE user_id IN (SELECT user_id FROM tu);

-- 8) Social / calls / notifications
DELETE FROM follows
WHERE follower_id IN (SELECT user_id FROM tu)
   OR following_id IN (SELECT user_id FROM tu);

DELETE FROM call_blocks
WHERE blocker_id IN (SELECT user_id FROM tu)
   OR blocked_id IN (SELECT user_id FROM tu);

DELETE FROM call_sessions
WHERE caller_id IN (SELECT user_id FROM tu)
   OR receiver_id IN (SELECT user_id FROM tu);

DELETE FROM notifications
WHERE user_id IN (SELECT user_id FROM tu)
   OR actor_id IN (SELECT user_id FROM tu);

DELETE FROM user_bans
WHERE user_id IN (SELECT user_id FROM tu)
   OR banned_by IN (SELECT user_id FROM tu);

-- 9) Conversations: drop test-user participants, then any conversation
--    owned by a test user or left with zero participants
DELETE FROM conversation_participants WHERE user_id IN (SELECT user_id FROM tu);

DELETE FROM conversations
WHERE owner_id IN (SELECT user_id FROM tu)
   OR NOT EXISTS (
     SELECT 1 FROM conversation_participants p WHERE p.conversation_id = conversations.id
   );

-- 10) Profiles + auth accounts
DELETE FROM profiles WHERE user_id IN (SELECT user_id FROM tu);
DELETE FROM auth.users WHERE id IN (SELECT user_id FROM tu);

COMMIT;

-- Optional sanity check afterwards (should return 0 rows):
-- SELECT id, email FROM auth.users
-- WHERE id IN ('ae9b2983-80fb-4b1a-b9fb-d2b4cae7a5f6','d5d94f2f-dd97-4c0c-ba35-0d7102fc61d5',
--   'f2e73231-5ba6-46c1-9cc1-4a0d460389b7','d4ddb3f2-df53-471d-8fd4-fb81c847f38d',
--   '0bbb61d6-7c1f-419e-9f64-0701f94d7249','d0ef9fa5-0bd6-435e-8b31-c0c07f6bc345',
--   '1901b064-60f4-4657-8e2d-4d0861401321','8eab2715-c9b2-42ab-b2e8-21abcf4895ee',
--   '0050f843-7599-4d89-b616-b58d37451973');
