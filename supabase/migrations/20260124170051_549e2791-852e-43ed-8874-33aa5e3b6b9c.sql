-- Create library_items table for multi-format uploads
CREATE TABLE public.library_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('audio', 'pdf', 'image', 'video')),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  allow_downloads BOOLEAN NOT NULL DEFAULT true,
  allow_comments BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  duration INTEGER, -- for audio/video in seconds
  file_size INTEGER, -- in bytes
  page_count INTEGER, -- for PDFs
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create collections table
CREATE TABLE public.collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create collection_items junction table
CREATE TABLE public.collection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(collection_id, item_id)
);

-- Create library_likes table
CREATE TABLE public.library_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Create library_comments table
CREATE TABLE public.library_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.library_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_comments ENABLE ROW LEVEL SECURITY;

-- library_items policies
CREATE POLICY "Users can view public items"
ON public.library_items FOR SELECT
USING (
  visibility = 'public' 
  OR user_id = auth.uid()
  OR (visibility = 'followers' AND EXISTS (
    SELECT 1 FROM follows 
    WHERE follower_id = auth.uid() 
    AND following_id = library_items.user_id 
    AND status = 'accepted'
  ))
  OR is_admin_or_moderator()
);

CREATE POLICY "Users can create their own items"
ON public.library_items FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own items"
ON public.library_items FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own items"
ON public.library_items FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- collections policies
CREATE POLICY "Users can view public collections or their own"
ON public.collections FOR SELECT
USING (is_public = true OR user_id = auth.uid() OR is_admin_or_moderator());

CREATE POLICY "Users can create their own collections"
ON public.collections FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own collections"
ON public.collections FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own collections"
ON public.collections FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- collection_items policies
CREATE POLICY "Users can view collection items"
ON public.collection_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM collections 
    WHERE id = collection_items.collection_id 
    AND (is_public = true OR user_id = auth.uid())
  )
);

CREATE POLICY "Users can add items to their collections"
ON public.collection_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM collections 
    WHERE id = collection_items.collection_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove items from their collections"
ON public.collection_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM collections 
    WHERE id = collection_items.collection_id 
    AND user_id = auth.uid()
  )
);

-- library_likes policies
CREATE POLICY "Anyone can view likes"
ON public.library_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like items"
ON public.library_likes FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unlike items"
ON public.library_likes FOR DELETE
USING (user_id = auth.uid());

-- library_comments policies
CREATE POLICY "Users can view comments on accessible items"
ON public.library_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM library_items 
    WHERE id = library_comments.item_id 
    AND (
      visibility = 'public' 
      OR user_id = auth.uid()
      OR (visibility = 'followers' AND EXISTS (
        SELECT 1 FROM follows 
        WHERE follower_id = auth.uid() 
        AND following_id = library_items.user_id 
        AND status = 'accepted'
      ))
    )
  )
);

CREATE POLICY "Users can comment on items"
ON public.library_comments FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own comments"
ON public.library_comments FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
ON public.library_comments FOR DELETE
USING (user_id = auth.uid() OR is_admin_or_moderator());

-- Create storage bucket for library files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('library-files', 'library-files', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for library-files bucket
CREATE POLICY "Anyone can view library files"
ON storage.objects FOR SELECT
USING (bucket_id = 'library-files');

CREATE POLICY "Authenticated users can upload library files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'library-files' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own library files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'library-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own library files"
ON storage.objects FOR DELETE
USING (bucket_id = 'library-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Function to update like count
CREATE OR REPLACE FUNCTION update_library_item_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE library_items SET like_count = like_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE library_items SET like_count = like_count - 1 WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER library_likes_count_trigger
AFTER INSERT OR DELETE ON library_likes
FOR EACH ROW EXECUTE FUNCTION update_library_item_like_count();

-- Function to update comment count
CREATE OR REPLACE FUNCTION update_library_item_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE library_items SET comment_count = comment_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE library_items SET comment_count = comment_count - 1 WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER library_comments_count_trigger
AFTER INSERT OR DELETE ON library_comments
FOR EACH ROW EXECUTE FUNCTION update_library_item_comment_count();

-- Function to update collection item count
CREATE OR REPLACE FUNCTION update_collection_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE collections SET item_count = item_count + 1 WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE collections SET item_count = item_count - 1 WHERE id = OLD.collection_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER collection_items_count_trigger
AFTER INSERT OR DELETE ON collection_items
FOR EACH ROW EXECUTE FUNCTION update_collection_item_count();

-- Trigger for updated_at
CREATE TRIGGER update_library_items_updated_at
BEFORE UPDATE ON library_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collections_updated_at
BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_library_comments_updated_at
BEFORE UPDATE ON library_comments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for library items
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_comments;