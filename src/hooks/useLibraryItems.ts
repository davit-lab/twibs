import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface LibraryItem {
  id: string;
  user_id: string;
  type: 'audio' | 'pdf' | 'image' | 'video';
  file_url: string;
  thumbnail_url: string | null;
  title: string;
  description: string | null;
  tags: string[];
  visibility: 'public' | 'followers' | 'private';
  allow_downloads: boolean;
  allow_comments: boolean;
  view_count: number;
  download_count: number;
  like_count: number;
  comment_count: number;
  duration: number | null;
  file_size: number | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  is_liked?: boolean;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  is_public: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export function useLibraryItems(userId?: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('library_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch profiles for all items
      const userIds = [...new Set(data?.map(d => d.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, is_verified')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Check if current user has liked each item
      let likedIds = new Set<string>();
      if (user && data) {
        const { data: likes } = await supabase
          .from('library_likes')
          .select('item_id')
          .eq('user_id', user.id);

        likedIds = new Set(likes?.map(l => l.item_id) || []);
      }

      setItems(data?.map(item => ({
        ...item,
        type: item.type as LibraryItem['type'],
        visibility: item.visibility as LibraryItem['visibility'],
        profiles: profileMap.get(item.user_id) as LibraryItem['profiles'],
        is_liked: likedIds.has(item.id)
      })) || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching library items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [userId, user?.id]);

  const uploadItem = async (
    file: File,
    metadata: {
      title: string;
      description?: string;
      tags?: string[];
      visibility?: 'public' | 'followers' | 'private';
      allow_downloads?: boolean;
      allow_comments?: boolean;
    }
  ) => {
    if (!user) {
      toast.error('Please sign in to upload');
      return null;
    }

    try {
      // Determine file type
      let type: LibraryItem['type'];
      if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type === 'application/pdf') type = 'pdf';
      else if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else {
        toast.error('Unsupported file type');
        return null;
      }

      // Upload file
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('library-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('library-files')
        .getPublicUrl(fileName);

      // Generate thumbnail for images
      let thumbnail_url = null;
      if (type === 'image') {
        thumbnail_url = publicUrl;
      }

      // Create library item
      const { data, error: insertError } = await supabase
        .from('library_items')
        .insert({
          user_id: user.id,
          type,
          file_url: publicUrl,
          thumbnail_url,
          title: metadata.title,
          description: metadata.description || null,
          tags: metadata.tags || [],
          visibility: metadata.visibility || 'public',
          allow_downloads: metadata.allow_downloads ?? true,
          allow_comments: metadata.allow_comments ?? true,
          file_size: file.size
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('Item uploaded successfully!');
      fetchItems();
      return data;
    } catch (err: any) {
      toast.error('Failed to upload: ' + err.message);
      console.error('Upload error:', err);
      return null;
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('library_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      toast.success('Item deleted');
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch (err: any) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  const likeItem = async (itemId: string) => {
    if (!user) {
      toast.error('Please sign in to like');
      return;
    }

    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      if (item.is_liked) {
        await supabase
          .from('library_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('item_id', itemId);
      } else {
        await supabase
          .from('library_likes')
          .insert({ user_id: user.id, item_id: itemId });
      }

      setItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, is_liked: !i.is_liked, like_count: i.like_count + (i.is_liked ? -1 : 1) }
          : i
      ));
    } catch (err: any) {
      toast.error('Failed to update like');
    }
  };

  const incrementView = async (itemId: string) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (item) {
        await supabase
          .from('library_items')
          .update({ view_count: item.view_count + 1 })
          .eq('id', itemId);
      }
    } catch (err) {
      // Silent fail for view count
    }
  };

  return {
    items,
    loading,
    error,
    uploadItem,
    deleteItem,
    likeItem,
    incrementView,
    refetch: fetchItems
  };
}

export function useCollections(userId?: string) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCollections(data || []);
    } catch (err: any) {
      console.error('Error fetching collections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [userId]);

  const createCollection = async (name: string, description?: string, isPublic = true) => {
    if (!user) {
      toast.error('Please sign in');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('collections')
        .insert({
          user_id: user.id,
          name,
          description: description || null,
          is_public: isPublic
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Collection created!');
      fetchCollections();
      return data;
    } catch (err: any) {
      toast.error('Failed to create collection');
      return null;
    }
  };

  const addToCollection = async (collectionId: string, itemId: string) => {
    try {
      const { error } = await supabase
        .from('collection_items')
        .insert({ collection_id: collectionId, item_id: itemId });

      if (error) {
        if (error.code === '23505') {
          toast.error('Item already in collection');
        } else {
          throw error;
        }
        return false;
      }

      toast.success('Added to collection!');
      fetchCollections();
      return true;
    } catch (err: any) {
      toast.error('Failed to add to collection');
      return false;
    }
  };

  const deleteCollection = async (collectionId: string) => {
    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collectionId);

      if (error) throw error;

      toast.success('Collection deleted');
      setCollections(prev => prev.filter(c => c.id !== collectionId));
    } catch (err: any) {
      toast.error('Failed to delete collection');
    }
  };

  return {
    collections,
    loading,
    createCollection,
    addToCollection,
    deleteCollection,
    refetch: fetchCollections
  };
}
