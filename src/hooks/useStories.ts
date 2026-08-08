import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  duration: number;
  view_count: number;
  created_at: string;
  expires_at: string;
  music_url: string | null;
  music_name: string | null;
  profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  is_viewed?: boolean;
}

export interface GroupedStories {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  stories: Story[];
  has_unviewed: boolean;
}

interface UseStoriesOptions {
  // If provided, fetch stories for a specific user (profile page view)
  profileUserId?: string;
  // When false, the hook is inert and returns empty data (e.g. profile still loading)
  enabled?: boolean;
}

export function useStories(options: UseStoriesOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [groupedStories, setGroupedStories] = useState<GroupedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const enabled = options.enabled ?? true;
  const lastProfileUserId = useRef<string | undefined>(undefined);

  const fetchStories = useCallback(async () => {
    // Not enabled (e.g. profile target hasn't loaded yet): show nothing so we
    // never flash the current user's own (feed) stories on a profile page.
    if (enabled === false) {
      lastProfileUserId.current = undefined;
      setStories([]);
      setGroupedStories([]);
      setLoading(false);
      return;
    }

    try {
      // If viewing a specific profile, show that user's stories
      if (options.profileUserId) {
        // Target user changed: drop the previous user's stories immediately so
        // we never show stale (or our own) stories while refetching.
        if (lastProfileUserId.current !== options.profileUserId) {
          lastProfileUserId.current = options.profileUserId;
          setStories([]);
          setGroupedStories([]);
          setLoading(true);
        }

        const { data: storiesData, error } = await supabase
          .from('stories')
          .select('*')
          .eq('user_id', options.profileUserId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch profile
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .eq('user_id', options.profileUserId);

        // Fetch user's viewed stories
        let viewedStoryIds: string[] = [];
        if (user) {
          const { data: views } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id);
          viewedStoryIds = (views || []).map(v => v.story_id);
        }

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        const enrichedStories = (storiesData || []).map(story => ({
          ...story,
          media_type: story.media_type as 'image' | 'video',
          profile: profileMap.get(story.user_id),
          is_viewed: viewedStoryIds.includes(story.id),
        })) as Story[];

        setStories(enrichedStories);

        // Group for profile view
        if (enrichedStories.length > 0 && options.profileUserId) {
          const profile = profileMap.get(options.profileUserId);
          setGroupedStories([{
            user_id: options.profileUserId,
            username: profile?.username || 'unknown',
            display_name: profile?.display_name || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            stories: enrichedStories,
            has_unviewed: enrichedStories.some(s => !s.is_viewed),
          }]);
        } else {
          setGroupedStories([]);
        }

        setLoading(false);
        return;
      }

      // For feed view: Only show stories from people the user follows + their own
      if (!user) {
        setStories([]);
        setGroupedStories([]);
        setLoading(false);
        return;
      }

      // Get list of users the current user follows
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .eq('status', 'accepted');

      const followingIds = (followsData || []).map(f => f.following_id);
      
      // Include current user's own stories
      const allowedUserIds = [...followingIds, user.id];

      if (allowedUserIds.length === 0) {
        setStories([]);
        setGroupedStories([]);
        setLoading(false);
        return;
      }

      const { data: storiesData, error } = await supabase
        .from('stories')
        .select('*')
        .in('user_id', allowedUserIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles
      const userIds = [...new Set((storiesData || []).map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      // Fetch user's viewed stories
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id);
      const viewedStoryIds = (views || []).map(v => v.story_id);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
      const enrichedStories = (storiesData || []).map(story => ({
        ...story,
        media_type: story.media_type as 'image' | 'video',
        profile: profileMap.get(story.user_id),
        is_viewed: viewedStoryIds.includes(story.id),
      })) as Story[];

      setStories(enrichedStories);

      // Group stories by user
      const grouped = userIds.map(userId => {
        const userStories = enrichedStories.filter(s => s.user_id === userId);
        const profile = profileMap.get(userId);
        return {
          user_id: userId,
          username: profile?.username || 'unknown',
          display_name: profile?.display_name || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          stories: userStories,
          has_unviewed: userStories.some(s => !s.is_viewed),
        };
      });

      // Sort: current user first, then users with unviewed stories
      grouped.sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        if (a.has_unviewed && !b.has_unviewed) return -1;
        if (!a.has_unviewed && b.has_unviewed) return 1;
        return 0;
      });

      setGroupedStories(grouped);
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setLoading(false);
    }
  }, [user, options.profileUserId, enabled]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  const viewStory = async (storyId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('story_views')
        .upsert({ story_id: storyId, viewer_id: user.id }, { onConflict: 'story_id,viewer_id' });

      setStories(prev => prev.map(s => 
        s.id === storyId ? { ...s, is_viewed: true } : s
      ));
    } catch (error) {
      console.error('Error recording story view:', error);
    }
  };

  const uploadStory = async (file: File, caption?: string, music?: { name: string; url: string | null }, duration?: number) => {
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('stories')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('stories')
      .getPublicUrl(fileName);

    // Create story record
    const { data, error: insertError } = await supabase
      .from('stories')
      .insert({
        user_id: user.id,
        media_url: urlData.publicUrl,
        media_type: mediaType,
        caption,
        duration: mediaType === 'video' ? (duration ?? 15) : 5,
        music_url: music?.url ?? null,
        music_name: music?.name ?? null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    toast({
      title: 'Story posted!',
      description: 'Your story is now visible to your followers for 24 hours.',
    });

    await fetchStories();
    return data;
  };

  const deleteStory = async (storyId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId)
        .eq('user_id', user.id);

      if (error) throw error;

      setStories(prev => prev.filter(s => s.id !== storyId));
      toast({
        title: 'Story deleted',
        description: 'Your story has been removed.',
      });
    } catch (error) {
      console.error('Error deleting story:', error);
    }
  };

  return {
    stories,
    groupedStories,
    loading,
    viewStory,
    uploadStory,
    deleteStory,
    refetch: fetchStories,
  };
}
