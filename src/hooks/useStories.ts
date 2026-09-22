import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useToast } from '@/hooks/use-toast';
import type { FeedAd } from '@/lib/ads';
import { STORY_MAX_DURATION, parseOverlays, type StoryOverlay } from '@/lib/stories';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  overlays: StoryOverlay[];
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
  reaction?: string | null;
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

export type StoryUploadPhase = 'preparing' | 'uploading' | 'publishing' | 'done';

export interface StoryUploadState {
  phase: StoryUploadPhase;
  progress: number; // 0..1
}

export interface UploadStoryOptions {
  caption?: string;
  music?: { name: string; url: string | null };
  duration?: number;
  media_type?: 'image' | 'video';
  overlays?: StoryOverlay[];
  onProgress?: (state: StoryUploadState) => void;
}

/**
 * All story ids are passed through .in() so we only ever run 3 extra queries
 * (like counts + my likes/reactions) regardless of how many stories are loaded.
 */
async function attachLikes(stories: Story[], userId: string | null): Promise<Story[]> {
  if (stories.length === 0) return stories;
  const ids = stories.map((s) => s.id);

  const { data: likeRows } = await supabase
    .from('story_likes')
    .select('story_id')
    .in('story_id', ids);

  const counts = new Map<string, number>();
  for (const row of likeRows || []) {
    counts.set(row.story_id, (counts.get(row.story_id) || 0) + 1);
  }

  let mine = new Map<string, string>();
  if (userId) {
    // `reaction` column is added by the stories-redesign migration; until the
    // generated types are refreshed it won't be known to supabase-js.
    const res = (await supabase
      .from('story_likes')
      .select('story_id, reaction')
      .eq('user_id', userId)
      .in('story_id', ids)) as unknown as {
      data: { story_id: string; reaction: string | null }[] | null;
      error: Error | null;
    };
    if (res.error) throw res.error;
    mine = new Map((res.data || []).map((r) => [r.story_id, r.reaction ?? 'like']));
  }

  return stories.map((story) => ({
    ...story,
    like_count: counts.get(story.id) ?? story.like_count ?? 0,
    is_liked: mine.has(story.id),
    reaction: mine.get(story.id) ?? null,
  }));
}

function enrichStoryRow(row: Record<string, unknown>): Story {
  return {
    ...row,
    media_type: (row.media_type as 'image' | 'video') ?? 'image',
    like_count: row.like_count ?? 0,
    overlays: parseOverlays(row.overlays),
  } as Story;
}

export function useStories(options: UseStoriesOptions = {}) {
  const { user } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [groupedStories, setGroupedStories] = useState<GroupedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState<StoryUploadState>({ phase: 'publishing', progress: 0 });
  const enabled = options.enabled ?? true;
  const lastProfileUserId = useRef<string | undefined>(undefined);
  const fetchTokenRef = useRef(0);

  const fetchStories = useCallback(async () => {
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

        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .eq('user_id', options.profileUserId);
        if (fetchTokenRef.current !== token) return;

        let viewedStoryIds: string[] = [];
        if (user) {
          const { data: views } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id);
          if (fetchTokenRef.current !== token) return;
          viewedStoryIds = (views || []).map((v) => v.story_id);
        }

        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
        let enrichedStories = (storiesData || []).map((row) => {
          const story = enrichStoryRow(row);
          story.profile = profileMap.get(story.user_id);
          story.is_viewed = viewedStoryIds.includes(story.id);
          return story;
        });

        enrichedStories = await attachLikes(enrichedStories, user?.id ?? null);
        if (fetchTokenRef.current !== token) return;

        setStories(enrichedStories);

        if (enrichedStories.length > 0 && options.profileUserId) {
          const profile = profileMap.get(options.profileUserId);
          setGroupedStories([
            {
              user_id: options.profileUserId,
              username: profile?.username || 'unknown',
              display_name: profile?.display_name || 'Unknown',
              avatar_url: profile?.avatar_url || null,
              stories: enrichedStories,
              has_unviewed: enrichedStories.some((s) => !s.is_viewed),
            },
          ]);
        } else {
          setGroupedStories([]);
        }

        setLoading(false);
        return;
      }

      // For feed view: only show stories from people the user follows + their own
      if (!user) {
        setStories([]);
        setGroupedStories([]);
        setLoading(false);
        return;
      }

      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .eq('status', 'accepted');
      if (fetchTokenRef.current !== token) return;
      if (followsError) throw followsError;

      const followingIds = (followsData || []).map((f) => f.following_id);
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

      const userIds = [...new Set((storiesData || []).map((s) => s.user_id))];
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

      const { data: views, error: viewsError } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id);
      if (fetchTokenRef.current !== token) return;
      if (viewsError) throw viewsError;
      const viewedStoryIds = (views || []).map((v) => v.story_id);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
      let enrichedStories = (storiesData || []).map((row) => {
        const story = enrichStoryRow(row);
        story.profile = profileMap.get(story.user_id);
        story.is_viewed = viewedStoryIds.includes(story.id);
        return story;
      });

      enrichedStories = await attachLikes(enrichedStories, user.id);
      if (fetchTokenRef.current !== token) return;

      setStories(enrichedStories);

      const grouped = userIds.map((userId) => {
        const userStories = enrichedStories.filter((s) => s.user_id === userId);
        const profile = profileMap.get(userId);
        return {
          user_id: userId,
          username: profile?.username || 'unknown',
          display_name: profile?.display_name || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          stories: userStories,
          has_unviewed: userStories.some((s) => !s.is_viewed),
        };
      });

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

      setStories((prev) => prev.map((s) => (s.id === storyId ? { ...s, is_viewed: true } : s)));
    } catch (error) {
      console.error('Error recording story view:', error);
    }
  };

  // -------------------------------------------------------------------------
  // Uploading
  // -------------------------------------------------------------------------

  function uploadFileWithProgress(url: string, file: File, onProgress: (f: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(0.92, e.loaded / e.total));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
      xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
      xhr.send(file);
    });
  }

  const uploadStory = async (file: File, opts: UploadStoryOptions = {}) => {
    if (!user) throw new Error('Not authenticated');
    if (!isEnabled('story_posting_enabled')) throw new Error('Story posting is currently disabled by the admin.');

    const tick = (state: StoryUploadState) => {
      setUploadState(state);
      opts.onProgress?.(state);
    };

    const mediaType = opts.media_type ?? (file.type.startsWith('video/') ? 'video' : 'image');
    const fileExt = (file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    setUploading(true);
    try {
      tick({ phase: 'preparing', progress: 0 });

      // Try a signed URL (real byte progress). Fall back to the regular upload
      // API if signed upload is disabled on the bucket.
      const signed = await supabase.storage.from('stories').createSignedUploadUrl(fileName);
      if (!signed.error && signed.data?.signedUrl) {
        await uploadFileWithProgress(signed.data.signedUrl, file, (p) => tick({ phase: 'uploading', progress: p }));
      } else {
        let uploadProgress = 0;
        // simulate progress ticks so the UI never appears frozen
        const pulse = window.setInterval(() => {
          uploadProgress = Math.min(0.9, uploadProgress + 0.08);
          tick({ phase: 'uploading', progress: uploadProgress });
        }, 220);
        const { error: uploadError } = await supabase.storage.from('stories').upload(fileName, file);
        window.clearInterval(pulse);
        if (uploadError) throw uploadError;
      }

      tick({ phase: 'publishing', progress: 0.98 });

      const { data: urlData } = supabase.storage.from('stories').getPublicUrl(fileName);

      const { data, error: insertError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: urlData.publicUrl,
          media_type: mediaType,
          caption: opts.caption?.trim() ? opts.caption.trim() : null,
          duration: mediaType === 'video' ? Math.min(opts.duration ?? STORY_MAX_DURATION, STORY_MAX_DURATION) : 5,
          music_url: opts.music?.url ?? null,
          music_name: opts.music?.name ?? null,
          overlays: opts.overlays ?? [],
          like_count: 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      tick({ phase: 'done', progress: 1 });

      toast({
        title: 'Story published',
        description: 'Your story is live for your followers for the next 24 hours.',
      });

      await fetchStories();
      return data as Story;
    } catch (err) {
      tick({ phase: 'publishing', progress: 1 });
      throw err;
    } finally {
      setUploading(false);
    }
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

      const remove = (s: Story) => s.id !== storyId;
      setStories((prev) => prev.filter(remove));
      setGroupedStories((prev) => prev.map((g) => ({ ...g, stories: g.stories.filter(remove) })).filter((g) => g.stories.length > 0));
      toast({ title: 'Story deleted', description: 'Your story has been removed.' });
    } catch (error) {
      console.error('Error deleting story:', error);
    }
  };

  // -------------------------------------------------------------------------
  // Reactions (hearts + quick reactions)
  // -------------------------------------------------------------------------

  const patchState = (storyId: string, patch: (s: Story) => Story) => {
    setStories((prev) => prev.map((s) => (s.id === storyId ? patch(s) : s)));
    setGroupedStories((prev) =>
      prev.map((g) => ({ ...g, stories: g.stories.map((s) => (s.id === storyId ? patch(s) : s)) })),
    );
  };

  const toggleStoryLike = useCallback(
    async (storyId: string) => {
      if (!user) return;

      const target = stories.find((s) => s.id === storyId);
      const wasLiked = !!target?.is_liked;
      const newCount = Math.max(0, (target?.like_count ?? 0) + (wasLiked ? -1 : 1));

      patchState(storyId, (s) => ({ ...s, is_liked: !wasLiked, like_count: newCount, reaction: wasLiked ? null : 'like' }));

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
            .upsert({ story_id: storyId, user_id: user.id, reaction: 'like' }, { onConflict: 'story_id,user_id' });
          if (error) throw error;
        }
      } catch (error) {
        console.error('Error toggling story like:', error);
        patchState(storyId, (s) => ({
          ...s,
          is_liked: wasLiked,
          like_count: target?.like_count ?? s.like_count,
          reaction: target?.reaction ?? null,
        }));
      }
    },
    [user, stories],
  );

  const setStoryReaction = useCallback(
    async (storyId: string, reaction: string) => {
      if (!user) return;

      const target = stories.find((s) => s.id === storyId);
      const wasLiked = !!target?.is_liked;
      const same = target?.reaction === reaction;
      const remove = wasLiked && same;
      const newCount = Math.max(0, (target?.like_count ?? 0) + (remove ? -1 : wasLiked ? 0 : 1));

      patchState(storyId, (s) => ({
        ...s,
        is_liked: remove ? false : true,
        like_count: newCount,
        reaction: remove ? null : reaction,
      }));

      try {
        if (remove) {
          const { error } = await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', user.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('story_likes')
            .upsert({ story_id: storyId, user_id: user.id, reaction }, { onConflict: 'story_id,user_id' });
          if (error) throw error;
        }
      } catch (error) {
        console.error('Error reacting to story:', error);
        patchState(storyId, (s) => ({
          ...s,
          is_liked: wasLiked,
          like_count: target?.like_count ?? s.like_count,
          reaction: target?.reaction ?? null,
        }));
      }
    },
    [user, stories],
  );

  const sendStoryReply = useCallback(
    async (storyOwnerId: string, content: string) => {
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

      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: text,
        effect: null,
        client_id: crypto.randomUUID(),
      });
      if (error) throw error;
      return conversationId;
    },
    [user, isEnabled],
  );

  const fetchStoryViewers = useCallback(async (storyId: string): Promise<StoryViewerProfile[]> => {
    const { data: views, error } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    if (error) throw error;
    if (!views || views.length === 0) return [];

    const viewerIds = views.map((v) => v.viewer_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url')
      .in('user_id', viewerIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    return views.map((v) => ({
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
    uploading,
    uploadState,
    viewStory,
    uploadStory,
    deleteStory,
    toggleStoryLike,
    setStoryReaction,
    sendStoryReply,
    fetchStoryViewers,
    refetch: fetchStories,
  };
}