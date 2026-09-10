import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';
import type { FeedAd } from '@/lib/ads';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  duration: number;
  view_count: number;
  like_count: number;
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
  is_liked?: boolean;
}

export interface StoryViewerProfile {
  viewer_id: string;
  viewed_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface GroupedStories {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  stories: Story[];
  has_unviewed: boolean;
  ad?: FeedAd;
}

interface UseStoriesOptions {
  // If provided, fetch stories for a specific user (profile page view)
  profileUserId?: string;
  // When false, the hook is inert and returns empty data (e.g. profile still loading)
  enabled?: boolean;
}

/**
 * All story ids are passed through .in() so we only ever run 2 extra queries
 * (like counts + my likes) regardless of how many stories are loaded.
 */
async function attachLikes(stories: Story[], userId: string | null): Promise<Story[]> {
  if (stories.length === 0) return stories;
  const ids = stories.map(s => s.id);

  const { data: likeRows } = await supabase
    .from('story_likes')
    .select('story_id')
    .in('story_id', ids);

  const counts = new Map<string, number>();
  for (const row of likeRows || []) {
    counts.set(row.story_id, (counts.get(row.story_id) || 0) + 1);
  }

  let mine = new Set<string>();
  if (userId) {
    const { data: myLikes } = await supabase
      .from('story_likes')
      .select('story_id')
      .eq('user_id', userId)
      .in('story_id', ids);
    mine = new Set((myLikes || []).map(r => r.story_id));
  }

  return stories.map(story => ({
    ...story,
    like_count: counts.get(story.id) ?? story.like_count ?? 0,
    is_liked: mine.has(story.id),
  }));
}

export function useStories(options: UseStoriesOptions = {}) {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [groupedStories, setGroupedStories] = useState<GroupedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const enabled = options.enabled ?? true;
  const lastProfileUserId = useRef<string | undefined>(undefined);
  const fetchTokenRef = useRef(0);

  const fetchStories = useCallback(async () => {
    // Not enabled (e.g. profile target hasn't loaded yet): show nothing so we
    // never flash the current user's own (feed) stories on a profile page.
    if (enabled === false) {
      fetchTokenRef.current++;
      lastProfileUserId.current = undefined;
      setStories([]);
      setGroupedStories([]);
      setError(null);
      setLoading(false);
      return;
    }

    const token = ++fetchTokenRef.current;
    setError(null);
    setLoading(true);

    try {
      // If viewing a specific profile, show that user's stories
      if (options.profileUserId) {
        // Target user changed: drop the previous user's stories immediately so
        // we never show stale (or our own) stories while refetching.
        if (lastProfileUserId.current !== options.profileUserId) {
          lastProfileUserId.current = options.profileUserId;
          setStories([]);
          setGroupedStories([]);
        }

        const { data: storiesData, error } = await supabase
          .from('stories')
          .select('*')
          .eq('user_id', options.profileUserId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (fetchTokenRef.current !== token) return;
        if (error) throw error;

        // Fetch profile
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .eq('user_id', options.profileUserId);
        if (fetchTokenRef.current !== token) return;

        // Fetch user's viewed stories
        let viewedStoryIds: string[] = [];
        if (user) {
          const { data: views } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id);
          if (fetchTokenRef.current !== token) return;
          viewedStoryIds = (views || []).map(v => v.story_id);
        }

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        let enrichedStories = (storiesData || []).map(story => ({
          ...story,
          media_type: story.media_type as 'image' | 'video',
          like_count: story.like_count ?? 0,
          profile: profileMap.get(story.user_id),
          is_viewed: viewedStoryIds.includes(story.id),
        })) as Story[];

        enrichedStories = await attachLikes(enrichedStories, user?.id ?? null);
        if (fetchTokenRef.current !== token) return;

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
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .eq('status', 'accepted');
      if (fetchTokenRef.current !== token) return;
      if (followsError) throw followsError;

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

      if (fetchTokenRef.current !== token) return;
      if (error) throw error;

      // Fetch profiles
      const userIds = [...new Set((storiesData || []).map(s => s.user_id))];
      let profiles: { user_id: string; username: string; display_name: string | null; avatar_url: string | null }[] | null = [];
      if (userIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', userIds);
        if (fetchTokenRef.current !== token) return;
        if (profilesError) throw profilesError;
        profiles = data;
      }

      // Fetch user's viewed stories
      const { data: views, error: viewsError } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id);
      if (fetchTokenRef.current !== token) return;
      if (viewsError) throw viewsError;
      const viewedStoryIds = (views || []).map(v => v.story_id);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
      let enrichedStories = (storiesData || []).map(story => ({
        ...story,
        media_type: story.media_type as 'image' | 'video',
        like_count: story.like_count ?? 0,
        profile: profileMap.get(story.user_id),
        is_viewed: viewedStoryIds.includes(story.id),
      })) as Story[];

      enrichedStories = await attachLikes(enrichedStories, user.id);
      if (fetchTokenRef.current !== token) return;

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
      setError('Could not load stories');
    } finally {
      if (fetchTokenRef.current === token) setLoading(false);
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
    if (!isEnabled('story_posting_enabled')) throw new Error('Story posting is currently disabled by the admin.');

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
        caption: caption?.trim() ? caption.trim() : null,
        duration: mediaType === 'video' ? (duration ?? 15) : 5,
        music_url: music?.url ?? null,
        music_name: music?.name ?? null,
        like_count: 0,
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
      setGroupedStories(prev =>
        prev
          .map(g => ({ ...g, stories: g.stories.filter(s => s.id !== storyId) }))
          .filter(g => g.stories.length > 0)
      );
      toast({
        title: 'Story deleted',
        description: 'Your story has been removed.',
      });
    } catch (error) {
      console.error('Error deleting story:', error);
    }
  };

  const toggleStoryLike = useCallback(async (storyId: string) => {
    if (!user) return;

    const target = stories.find(s => s.id === storyId);
    const wasLiked = !!target?.is_liked;
    const newCount = Math.max(0, (target?.like_count ?? 0) + (wasLiked ? -1 : 1));

    const patch = (s: Story): Story =>
      s.id === storyId ? { ...s, is_liked: !wasLiked, like_count: newCount } : s;

    setStories(prev => prev.map(patch));
    setGroupedStories(prev => prev.map(g => ({ ...g, stories: g.stories.map(patch) })));

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('story_likes')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('story_likes')
          .upsert({ story_id: storyId, user_id: user.id }, { onConflict: 'story_id,user_id' });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling story like:', error);
      const revert = (s: Story): Story =>
        s.id === storyId ? { ...s, is_liked: wasLiked, like_count: target?.like_count ?? newCount } : s;
      setStories(prev => prev.map(revert));
      setGroupedStories(prev => prev.map(g => ({ ...g, stories: g.stories.map(revert) })));
    }
  }, [user, stories]);

  const sendStoryReply = useCallback(async (storyOwnerId: string, content: string) => {
    if (!user) throw new Error('Not authenticated');
    if (!isEnabled('direct_messages_enabled')) throw new Error('Direct messages are currently disabled by the admin.');

    const text = content.trim().slice(0, 1000);
    if (!text) throw new Error('Reply cannot be empty');

    // Replies are delivered as a direct message to the story owner.
    const { data: conversationId, error: convError } = await supabase.rpc('get_or_create_dm_conversation', {
      other_user_id: storyOwnerId,
    });
    if (convError) throw convError;
    if (!conversationId) throw new Error('Could not open a conversation with this user.');

    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: text,
        effect: null,
        client_id: crypto.randomUUID(),
      });
    if (error) throw error;
    return conversationId;
  }, [user, isEnabled]);

  const fetchStoryViewers = useCallback(async (storyId: string): Promise<StoryViewerProfile[]> => {
    const { data: views, error } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    if (error) throw error;
    if (!views || views.length === 0) return [];

    const viewerIds = views.map(v => v.viewer_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url')
      .in('user_id', viewerIds);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
    return views.map(v => ({
      viewer_id: v.viewer_id,
      viewed_at: v.viewed_at,
      username: profileMap.get(v.viewer_id)?.username || 'unknown',
      display_name: profileMap.get(v.viewer_id)?.display_name || 'Unknown',
      avatar_url: profileMap.get(v.viewer_id)?.avatar_url || null,
    }));
  }, []);

  return {
    stories,
    groupedStories,
    loading,
    error,
    viewStory,
    uploadStory,
    deleteStory,
    toggleStoryLike,
    sendStoryReply,
    fetchStoryViewers,
    refetch: fetchStories,
  };
}