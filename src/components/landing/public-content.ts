import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FALLBACK_MOMENTS } from './landing-data';

export type PublicMoment = {
  id: string;
  image: string;
  caption: string;
  authorName: string;
  authorAvatar: string | null;
};

type PublicMomentsState = {
  moments: PublicMoment[];
  source: 'live' | 'fallback';
};

/**
 * Best-effort live content for the pre-auth landing page.
 *
 * The anon Supabase client can only read rows its RLS policies expose, so a
 * permission failure is expected on some deployments and every failure simply
 * falls back to the curated editorial set. Never throws, never blocks render.
 */
export function usePublicMoments(limit = 4): PublicMomentsState {
  const [state, setState] = useState<PublicMomentsState>(() => ({
    moments: FALLBACK_MOMENTS.slice(0, limit),
    source: 'fallback',
  }));

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(
            'id, content, post_media(url), profiles!inner(username, display_name, avatar_url)',
          )
          .eq('hidden', false)
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error || !data || data.length === 0) throw new Error('public content unavailable');

        const moments: PublicMoment[] = [];
        for (const row of data as unknown as Array<{
          id: string;
          content: string | null;
          post_media: Array<{ url: string | null }> | null;
          profiles: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
        }>) {
          const url = row.post_media?.[0]?.url;
          if (!url) continue;
          moments.push({
            id: row.id,
            image: url,
            caption: truncate(row.content || 'A moment worth sharing', 72),
            authorName: row.profiles?.display_name || row.profiles?.username || 'Twibsers',
            authorAvatar: row.profiles?.avatar_url ?? null,
          });
        }
        if (!moments.length) throw new Error('no public media');

        if (active) setState({ moments, source: 'live' });
      } catch {
        if (active) setState({ moments: FALLBACK_MOMENTS.slice(0, limit), source: 'fallback' });
      }
    })();

    return () => {
      active = false;
    };
  }, [limit]);

  return state;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}