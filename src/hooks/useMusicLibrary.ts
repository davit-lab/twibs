import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MusicTrack {
  id: string;
  name: string;
  url: string | null;
  duration: number;
  isCustom?: boolean;
  scope?: 'library' | 'mine';
}

const SOUNDHELIX_BASE = 'https://www.soundhelix.com/examples/mp3';

// Seeded royalty-free library so music is available out of the box.
// SoundHelix provides these free sample tracks for testing/demo purposes.
const SEEDED_TRACKS: MusicTrack[] = Array.from({ length: 17 }, (_, i) => ({
  id: `soundhelix/${i + 1}`,
  name: `SoundHelix Song ${i + 1}`,
  url: `${SOUNDHELIX_BASE}/SoundHelix-Song-${i + 1}.mp3`,
  duration: 0,
  scope: 'library',
}));

export const DEFAULT_MUSIC_TRACKS: MusicTrack[] = [
  { id: 'none', name: 'No Music', url: null, duration: 0 },
  ...SEEDED_TRACKS,
];

export function useMusicLibrary() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<MusicTrack[]>(DEFAULT_MUSIC_TRACKS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setTracks(DEFAULT_MUSIC_TRACKS);
      return;
    }

    setLoading(true);
    try {
      const [{ data: libData, error: libError }, { data: mineData, error: mineError }] =
        await Promise.all([
          supabase.storage.from('reel-music').list('library', { limit: 100 }),
          supabase.storage.from('reel-music').list(user.id, { limit: 100 }),
        ]);

      if (libError) console.error('Error loading library tracks:', libError);
      if (mineError) console.error('Error loading my tracks:', mineError);

      const libraryTracks: MusicTrack[] = (libData || [])
        .filter((f) => f.name)
        .map((file) => ({
          id: `library/${file.name}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: supabase.storage.from('reel-music').getPublicUrl(`library/${file.name}`).data.publicUrl,
          duration: 0,
          scope: 'library',
        }));

      const customTracks: MusicTrack[] = (mineData || [])
        .filter((f) => f.name)
        .map((file) => ({
          id: `${user.id}/${file.name}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: supabase.storage.from('reel-music').getPublicUrl(`${user.id}/${file.name}`).data.publicUrl,
          duration: 0,
          isCustom: true,
          scope: 'mine',
        }));

      setTracks([...DEFAULT_MUSIC_TRACKS, ...libraryTracks, ...customTracks]);
    } catch (error) {
      console.error('Error loading music tracks:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tracks, loading, refresh };
}
