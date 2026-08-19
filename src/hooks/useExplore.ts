import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getViewerLocation, geocodeLocation, haversineKm } from '@/lib/geolocation';

export interface ExploreUser {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  privacy: 'public' | 'private';
  location: string | null;
  follower_count: number;
  distanceKm: number | null;
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

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function useExplore() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<ExploreUser[]>([]);
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [reels, setReels] = useState<ExploreReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState<ExploreTab>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewerLocationKnown, setViewerLocationKnown] = useState(false);
  const [distancesReady, setDistancesReady] = useState(false);
  const [distancesLoading, setDistancesLoading] = useState(false);
  const distanceTokenRef = useRef(0);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== searchQuery) setSearchQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (q) {
        setSearchParams({ q });
      } else if (searchParams.has('q')) {
        setSearchParams({});
      }
    },
    [searchParams, setSearchParams]
  );

  const attachDistances = useCallback(
    async (list: ExploreUser[]) => {
      const token = ++distanceTokenRef.current;
      if (list.length === 0) return;

      setDistancesLoading(true);

      const profileLoc = profile?.location ?? null;
      const viewer = await getViewerLocation(profileLoc);
      if (token !== distanceTokenRef.current) return;
      setViewerLocationKnown(!!viewer);

      const withLocation = list.filter((u) => u.location && u.location.trim());
      if (!viewer || withLocation.length === 0) {
        setDistancesReady(false);
        setDistancesLoading(false);
        return;
      }

      const resolved = await mapLimit(list, 4, async (u) => {
        if (!u.location) return { user: u, dist: null };
        const coords = await geocodeLocation(u.location);
        return { user: u, dist: coords ? haversineKm(viewer, coords) : null };
      });

      if (token !== distanceTokenRef.current) return;

      const mapped = resolved.map(({ user: u, dist }) => ({ ...u, distanceKm: dist }));
      const sorted = [...mapped].sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });

      setUsers(sorted);
      setDistancesReady(true);
      setDistancesLoading(false);
    },
    [profile?.location]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);

    const profileBase = supabase
      .from('profiles')
      .select('id, user_id, username, display_name, bio, avatar_url, is_verified, privacy, location')
      .order('created_at', { ascending: false })
      .limit(20);

    const postBase = supabase
      .from('posts')
      .select('id, content, visibility, star_count, comment_count, created_at, user_id, profiles:user_id(username, display_name, avatar_url, is_verified), post_media(id, url, type)')
      .eq('visibility', 'public')
      .eq('hidden', false)
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
      profileQuery = profileBase.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,bio.ilike.%${q}%,location.ilike.%${q}%`);
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

    if (usersResult.data) {
      const userIds = usersResult.data.map(u => u.user_id);
      const counts = new Map<string, number>();
      if (userIds.length > 0) {
        const { data: followRows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('status', 'accepted')
          .in('following_id', userIds);
        for (const row of followRows || []) {
          counts.set(row.following_id, (counts.get(row.following_id) || 0) + 1);
        }
      }
      const withCounts = (usersResult.data as Omit<ExploreUser, 'follower_count' | 'distanceKm'>[]).map(u => ({
        ...u,
        follower_count: counts.get(u.user_id) || 0,
        distanceKm: null,
      })) as ExploreUser[];
      setUsers(withCounts);
      attachDistances(withCounts);
    }
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
  }, [searchQuery, user, refreshKey, attachDistances]);

  useEffect(() => {
    const timer = setTimeout(fetchData, searchQuery ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, searchQuery]);

  const handleFollowChange = () => setRefreshKey(p => p + 1);

  // Live-refresh the Explore feed when new content is published
  useEffect(() => {
    const channel = supabase
      .channel('explore-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => setRefreshKey(p => p + 1))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => setRefreshKey(p => p + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reels' }, () => setRefreshKey(p => p + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    users,
    posts,
    reels,
    loading,
    searchQuery,
    setSearchQuery: updateSearch,
    activeTab,
    setActiveTab,
    handleFollowChange,
    viewerLocationKnown,
    distancesReady,
    distancesLoading,
    hasAny: users.length > 0 || posts.length > 0 || reels.length > 0,
  };
}
