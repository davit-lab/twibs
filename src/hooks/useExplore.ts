import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ExploreUser {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  privacy: 'public' | 'private';
}

export interface ExplorePost {
  id: string;
  content: string;
  visibility: string;
  star_count: number;
  comment_count: number;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  post_media: { id: string; url: string; type: string }[];
}

export interface ExploreReel {
  id: string;
  caption: string | null;
  thumbnail_url: string | null;
  video_url: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: number | null;
  created_at: string;
  user_id: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export type ExploreTab = 'all' | 'people' | 'posts' | 'reels';

export function useExplore() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [reels, setReels] = useState<ExploreReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ExploreTab>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const profileBase = supabase
      .from('profiles')
      .select('id, user_id, username, display_name, bio, avatar_url, is_verified, privacy')
      .order('created_at', { ascending: false })
      .limit(20);

    const postBase = supabase
      .from('posts')
      .select('id, content, visibility, star_count, comment_count, created_at, user_id, profiles:user_id(username, display_name, avatar_url, is_verified), post_media(id, url, type)')
      .eq('visibility', 'public')
      .order('star_count', { ascending: false })
      .limit(20);

    const reelBase = supabase
      .from('reels')
      .select('id, caption, thumbnail_url, video_url, view_count, like_count, comment_count, duration, created_at, user_id')
      .eq('is_published', true)
      .order('view_count', { ascending: false })
      .limit(20);

    let profileQuery = profileBase;
    let postQuery = postBase;
    let reelQuery = reelBase;

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      profileQuery = profileBase.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,bio.ilike.%${q}%`);
      postQuery = postBase.or(`content.ilike.%${q}%`);
      reelQuery = reelBase.or(`caption.ilike.%${q}%`);
    }

    if (user) {
      profileQuery = profileQuery.neq('user_id', user.id);
    }

    const [usersResult, postsResult, reelsResult] = await Promise.all([
      profileQuery,
      postQuery,
      reelQuery,
    ]);

    if (usersResult.error) console.error('Explore users error:', usersResult.error);
    if (postsResult.error) console.error('Explore posts error:', postsResult.error);
    if (reelsResult.error) console.error('Explore reels error:', reelsResult.error);

    if (usersResult.data) setUsers(usersResult.data as ExploreUser[]);
    if (postsResult.data) setPosts(postsResult.data as unknown as ExplorePost[]);

    if (reelsResult.data) {
      const reelRows = (reelsResult.data as (Omit<ExploreReel, 'profiles'>)[]);
      const reelUserIds = [...new Set(reelRows.map(r => r.user_id))];
      let reelProfileMap = new Map<string, ExploreReel['profiles']>();
      if (reelUserIds.length > 0) {
        const { data: reelProfiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', reelUserIds);
        if (reelProfiles) {
          reelProfileMap = new Map((reelProfiles as { user_id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean }[]).map(p => [p.user_id, p]));
        }
      }
      setReels(reelRows.map(r => ({
        ...r,
        profiles: reelProfileMap.get(r.user_id) || {
          username: 'unknown',
          display_name: 'Unknown User',
          avatar_url: null,
          is_verified: false,
        },
      })));
    }

    setLoading(false);
  }, [searchQuery, user, refreshKey]);

  useEffect(() => {
    const timer = setTimeout(fetchData, searchQuery ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, searchQuery]);

  const handleFollowChange = () => setRefreshKey(p => p + 1);

  return {
    users,
    posts,
    reels,
    loading,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    handleFollowChange,
    hasAny: users.length > 0 || posts.length > 0 || reels.length > 0,
  };
}
