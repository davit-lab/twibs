-- Drop the existing policy
DROP POLICY IF EXISTS "Verified users can create books" ON public.books;

-- Create new policy that allows verified OR premium users to create books
CREATE POLICY "Verified or premium users can create books" 
ON public.books 
FOR INSERT 
WITH CHECK (
  (author_id = auth.uid()) 
  AND (
    is_verified_author(auth.uid()) 
    OR has_premium_access(auth.uid())
  )
);