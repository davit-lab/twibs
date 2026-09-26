import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SocialReadingEvent {
  key: string;
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string | null;
  bookId: string;
  bookTitle: string;
  coverUrl?: string | null;
  action: 'started' | 'reading' | 'finished';
  detail?: string;
  at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

export function useFollowingReadingFeed(preferUserId?: string) {
  const { user } = useAuth();
  const targetUserId = preferUserId || user?.id;
  const [events, setEvents] = useState<SocialReadingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!targetUserId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEvents(await queryFollowingReading(targetUserId, 20));
    } catch (error) {
      console.error('Error loading reading feed:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}

export function useFriendsReadingThisBook(bookId?: string) {
  const { user } = useAuth();
  const [events, setEvents] = useState<SocialReadingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user || !bookId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEvents(await queryFollowingReading(user.id, 12, bookId));
    } catch (error) {
      console.error('Error loading friends reading this book:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user, bookId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}

async function queryFollowingReading(
  userId: string,
  limit: number,
  bookId?: string
): Promise<SocialReadingEvent[]> {
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .limit(200);

  const following = follows?.map((f) => f.following_id) || [];
  if (following.length === 0) return [];

  let query = supabase
    .from('reading_progress')
    .select('id, user_id, book_id, completed_chapters, current_chapter_id, last_read_at')
    .in('user_id', following)
    .order('last_read_at', { ascending: false })
    .limit(limit);

  if (bookId) {
    query = query.eq('book_id', bookId);
  }

  const { data: progress, error } = await query;
  if (error || !progress || progress.length === 0) return [];

  const userIds = [...new Set(progress.map((p) => p.user_id))];
  const bookIds = [...new Set(progress.map((p) => p.book_id))];

  const [{ data: profiles }, { data: books }, { data: chapters }] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, display_name, username, avatar_url')
      .in('user_id', userIds),
    supabase
      .from('books')
      .select('id, title, cover_url')
      .in('id', bookIds),
    supabase
      .from('chapters')
      .select('book_id')
      .in('book_id', bookIds),
  ]);

  const profileMap = new Map(
    (profiles as ProfileRow[] | null)?.map((p) => [p.user_id, p]) || []
  );
  const bookMap = new Map((books || []).map((b) => [b.id, b]));
  const chapterCountMap = new Map<string, number>();
  (chapters || []).forEach((c) => {
    chapterCountMap.set(c.book_id, (chapterCountMap.get(c.book_id) || 0) + 1);
  });

  const events: SocialReadingEvent[] = [];
  for (const p of progress) {
    const profile = profileMap.get(p.user_id);
    const book = bookMap.get(p.book_id);
    if (!profile || !book) continue;

    const total = chapterCountMap.get(p.book_id) || 0;
    const completed = (p.completed_chapters as string[] | null)?.length || 0;
    let action: SocialReadingEvent['action'] = 'started';
    let detail: string | undefined;
    if (total > 0 && completed >= total) {
      action = 'finished';
    } else if (p.current_chapter_id) {
      action = 'reading';
      detail = total > 0 ? `Chapter ${Math.min(completed + 1, total)} of ${total}` : 'Reading';
    }

    events.push({
      key: `${p.user_id}-${p.book_id}-${p.last_read_at}`,
      userId: p.user_id,
      displayName: profile.display_name || profile.username || 'Reader',
      username: profile.username,
      avatarUrl: profile.avatar_url,
      bookId: book.id,
      bookTitle: book.title,
      coverUrl: book.cover_url,
      action,
      detail,
      at: p.last_read_at,
    });
  }

  return events.slice(0, limit);
}