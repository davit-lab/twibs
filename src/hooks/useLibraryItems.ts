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
      let profiles: { user_id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean }[] | null = [];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', userIds);
        profiles = profilesData;
      }

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

      const nextLiked = !item.is_liked;
      const nextCount = item.like_count + (nextLiked ? 1 : -1);

      setItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, is_liked: nextLiked, like_count: nextCount }
          : i
      ));

      await supabase
        .from('library_items')
        .update({ like_count: Math.max(0, nextCount) })
        .eq('id', itemId);
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
          toast.error('Failed to add to collection: ' + error.message);
        }
        return false;
      }

      toast.success('Added to collection!');
      fetchCollections();
      return true;
    } catch (err: any) {
      console.error('addToCollection error:', err);
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

  const removeFromCollection = async (collectionId: string, itemId: string) => {
    try {
      const { error } = await supabase
        .from('collection_items')
        .delete()
        .eq('collection_id', collectionId)
        .eq('item_id', itemId);

      if (error) throw error;

      toast.success('Removed from collection');
      fetchCollections();
      return true;
    } catch (err: any) {
      toast.error('Failed to remove from collection');
      return false;
    }
  };

  return {
    collections,
    loading,
    createCollection,
    addToCollection,
    removeFromCollection,
    deleteCollection,
    refetch: fetchCollections
  };
}

export function useCollectionItems(collectionId: string | null) {
  const { user } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollectionItems = async () => {
    if (!collectionId) {
      setCollection(null);
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: collectionData, error: collectionError } = await supabase
        .from('collections')
        .select('*')
        .eq('id', collectionId)
        .maybeSingle();

      if (collectionError) throw collectionError;
      setCollection((collectionData as Collection) || null);

      const { data: entries, error: entriesError } = await supabase
        .from('collection_items')
        .select('item_id')
        .eq('collection_id', collectionId)
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;

      const itemIds = entries?.map((e) => e.item_id) || [];
      if (itemIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from('library_items')
        .select('*')
        .in('id', itemIds);

      if (itemError) throw itemError;

      const itemMap = new Map((itemData || []).map((i) => [i.id, i]));
      const orderedItems = (itemIds
        .map((id) => itemMap.get(id))
        .filter(Boolean) as (typeof itemData)[number][]);

      const userIds = [...new Set(orderedItems.map((d) => d.user_id))];
      let profileMap = new Map<string, { user_id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean }>();
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', userIds);
        profileMap = new Map(profilesData?.map((p) => [p.user_id, p]) || []);
      }

      let likedIds = new Set<string>();
      if (user && orderedItems.length > 0) {
        const { data: likes } = await supabase
          .from('library_likes')
          .select('item_id')
          .eq('user_id', user.id);
        likedIds = new Set(likes?.map((l) => l.item_id) || []);
      }

      setItems(orderedItems.map((item) => ({
        ...item,
        type: item.type as LibraryItem['type'],
        visibility: item.visibility as LibraryItem['visibility'],
        profiles: profileMap.get(item.user_id) as LibraryItem['profiles'],
        is_liked: likedIds.has(item.id),
      })));
    } catch (err: any) {
      console.error('Error fetching collection items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectionItems();
  }, [collectionId, user?.id]);

  return {
    collection,
    items,
    loading,
    refetch: fetchCollectionItems,
  };
}
