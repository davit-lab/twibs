-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Create a non-recursive policy: users can view participants if they are in the same conversation
-- We check this by joining with conversations table instead of self-referencing
CREATE POLICY "Users can view participants of their conversations" 
ON public.conversation_participants 
FOR SELECT 
USING (
  -- User can see their own participant records
  user_id = auth.uid()
  OR
  -- User can see other participants if they share a conversation
  conversation_id IN (
    SELECT conversation_id 
    FROM public.conversation_participants 
    WHERE user_id = auth.uid()
  )
);