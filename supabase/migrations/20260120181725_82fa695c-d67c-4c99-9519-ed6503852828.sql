-- Add foreign key for comments to profiles (needed for the join)
ALTER TABLE public.comments 
ADD CONSTRAINT comments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create a view or use profiles via user_id join
-- Actually, we need to reference profiles, not auth.users for the join
-- Let's fix this by creating a helper that works with our existing profiles table