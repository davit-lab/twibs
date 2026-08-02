-- Table to track daily reading activity
CREATE TABLE public.reading_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_read_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Table to track daily reading logs
CREATE TABLE public.reading_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_date DATE NOT NULL DEFAULT CURRENT_DATE,
  minutes_read INTEGER NOT NULL DEFAULT 0,
  chapters_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, read_date)
);

-- Table to track earned badges
CREATE TABLE public.reading_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_type)
);

-- Enable RLS
ALTER TABLE public.reading_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_badges ENABLE ROW LEVEL SECURITY;

-- RLS policies for reading_streaks
CREATE POLICY "Users can view their own streak" ON public.reading_streaks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streak" ON public.reading_streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streak" ON public.reading_streaks
  FOR UPDATE USING (auth.uid() = user_id);

-- Anyone can view streaks (for profile display)
CREATE POLICY "Anyone can view streaks" ON public.reading_streaks
  FOR SELECT USING (true);

-- RLS policies for reading_logs
CREATE POLICY "Users can view their own logs" ON public.reading_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own logs" ON public.reading_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own logs" ON public.reading_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for reading_badges
CREATE POLICY "Anyone can view badges" ON public.reading_badges
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own badges" ON public.reading_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to update streak and award badges
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
    -- Create new streak record
    INSERT INTO reading_streaks (user_id, current_streak, longest_streak, last_read_date)
    VALUES (NEW.user_id, 1, 1, NEW.read_date);
    new_streak := 1;
  ELSE
    -- Calculate new streak
    IF streak_record.last_read_date IS NULL THEN
      new_streak := 1;
    ELSIF streak_record.last_read_date = NEW.read_date THEN
      -- Same day, no change
      new_streak := streak_record.current_streak;
    ELSIF streak_record.last_read_date = NEW.read_date - INTERVAL '1 day' THEN
      -- Consecutive day, increment streak
      new_streak := streak_record.current_streak + 1;
    ELSE
      -- Streak broken, reset to 1
      new_streak := 1;
    END IF;
    
    -- Update streak record
    UPDATE reading_streaks 
    SET 
      current_streak = new_streak,
      longest_streak = GREATEST(longest_streak, new_streak),
      last_read_date = NEW.read_date,
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  
  -- Check and award badges for milestones
  FOREACH milestone IN ARRAY badge_milestones LOOP
    IF new_streak >= milestone THEN
      INSERT INTO reading_badges (user_id, badge_type, badge_name)
      VALUES (
        NEW.user_id, 
        'streak_' || milestone,
        CASE milestone
          WHEN 3 THEN 'Getting Started'
          WHEN 7 THEN 'Week Warrior'
          WHEN 14 THEN 'Two Week Champion'
          WHEN 30 THEN 'Monthly Master'
          WHEN 60 THEN 'Reading Enthusiast'
          WHEN 100 THEN 'Century Reader'
          WHEN 365 THEN 'Legendary Reader'
        END
      )
      ON CONFLICT (user_id, badge_type) DO NOTHING;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger to update streak on reading log insert
CREATE TRIGGER on_reading_log_insert
  AFTER INSERT ON public.reading_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reading_streak();

-- Trigger for updated_at
CREATE TRIGGER update_reading_streaks_updated_at
  BEFORE UPDATE ON public.reading_streaks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();