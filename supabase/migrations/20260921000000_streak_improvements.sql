-- Streak system improvements:
-- 1. Make update_reading_streak() more explicit about date handling
-- 2. Ensure badge awarding is robust with ON CONFLICT DO NOTHING
-- 3. Improve documentation of streak calculation logic
-- No data is dropped. All existing records preserved.

-- Update the streak calculation function with clearer logic and timezone awareness notes.
-- The read_date is expected to be a DATE type. When inserting reading_logs,
-- the frontend computes read_date using the user's local timezone:
--   new Date().toLocaleDateString('en-CA')  // "YYYY-MM-DD" in local timezone
-- This avoids server UTC date mismatches.

CREATE OR REPLACE FUNCTION public.update_reading_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  streak_record reading_streaks%ROWTYPE;
  new_streak INTEGER;
  badge_milestones INTEGER[] := ARRAY[3, 7, 14, 30, 60, 100, 365];
  milestone INTEGER;
BEGIN
  -- Get or create streak record
  SELECT * INTO streak_record FROM reading_streaks WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    INSERT INTO reading_streaks (user_id, current_streak, longest_streak, last_read_date)
    VALUES (NEW.user_id, 1, 1, NEW.read_date);
    new_streak := 1;
  ELSE
    IF streak_record.last_read_date IS NULL THEN
      new_streak := 1;
    ELSIF streak_record.last_read_date = NEW.read_date THEN
      -- Same day: minutes and chapters accumulate, streak unchanged.
      new_streak := streak_record.current_streak;
    ELSIF streak_record.last_read_date = NEW.read_date - INTERVAL '1 day' THEN
      -- Consecutive day: increment streak.
      new_streak := streak_record.current_streak + 1;
    ELSE
      -- Gap detected: streak resets. The old streak is preserved in longest_streak.
      new_streak := 1;
    END IF;

    UPDATE reading_streaks
    SET
      current_streak = new_streak,
      longest_streak = GREATEST(longest_streak, new_streak),
      last_read_date = NEW.read_date,
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  -- Award badges for reached milestones (idempotent via ON CONFLICT).
  FOREACH milestone IN ARRAY badge_milestones LOOP
    IF new_streak >= milestone THEN
      INSERT INTO reading_badges (user_id, badge_type, badge_name)
      VALUES (
        NEW.user_id,
        'streak_' || milestone,
        CASE milestone
          WHEN 3 THEN 'First Chapter'
          WHEN 7 THEN 'One Week'
          WHEN 14 THEN 'Fortnight'
          WHEN 30 THEN 'One Month'
          WHEN 60 THEN 'Deep Reader'
          WHEN 100 THEN 'Century'
          WHEN 365 THEN 'Year Reader'
        END
      )
      ON CONFLICT (user_id, badge_type) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
