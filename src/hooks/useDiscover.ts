import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBlockedUsers } from './useSafety';

export interface SuggestedUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  follower_count: number;
}

export function useSuggestedUsers(limit = 4) {
  const { user } = useAuth();
  const { data: blockedIds = [] } = useBlockedUsers();

  return useQuery({
    queryKey: ['suggested-users', limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      if (!user) return [];

      const { data: follows } = await (supabase as any)
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .eq('status', 'accepted');

      const followedIds = new Set((follows || []).map((f: any) => f.following_id));
      const exclude = new Set([...followedIds, ...blockedIds, user.id]);

      const { data: profiles, error } = await (supabase as any)
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, bio, is_verified')
        .limit(80);

      if (error) throw error;

      const candidates = (profiles || []).filter((p: any) => !exclude.has(p.user_id));
      const userIds = candidates.map((c: any) => c.user_id);

      const counts = new Map<string, number>();
      if (userIds.length > 0) {
        const { data: rows } = await (supabase as any)
          .from('follows')
          .select('following_id')
          .eq('status', 'accepted')
          .in('following_id', userIds);
        for (const r of rows || []) {
          counts.set(r.following_id, (counts.get(r.following_id) || 0) + 1);
        }
      }

      return candidates
        .map((c: any) => ({ ...c, follower_count: counts.get(c.user_id) || 0 }))
        .sort((a: any, b: any) => b.follower_count - a.follower_count)
        .slice(0, limit);
    },
    enabled: !!user,
  });
}

export interface TrendingPost {
  id: string;
  content: string;
  created_at: string;
  star_count: number;
  comment_count: number;
  repost_count: number;
  user_id: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export function useTrendingPosts(limit = 5) {
  return useQuery({
    queryKey: ['trending-posts', limit],
    queryFn: async (): Promise<TrendingPost[]> => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await (supabase as any)
        .from('posts')
        .select(`
          id,
          content,
          created_at,
          star_count,
          comment_count,
          repost_count,
          user_id,
          profiles!inner (
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('visibility', 'public')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const posts = (data || []).map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
      }));

      const score = (p: TrendingPost) =>
        p.star_count + p.comment_count * 2 + (p.repost_count || 0) * 3;

      return (posts as TrendingPost[])
        .sort((a, b) => score(b) - score(a))
        .slice(0, limit);
    },
  });
}
