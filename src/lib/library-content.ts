import type { Book, LibraryBookWithProgress } from '@/hooks/useBooks';
import type { LibraryItem } from '@/hooks/useLibraryItems';

export type ContentKind = 'book' | 'audio' | 'pdf' | 'image' | 'video';

export interface ContentCreator {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface ContentMeta {
  chapters?: number;
  completedChapters?: number;
  durationSec?: number | null;
  pageCount?: number | null;
  fileSize?: number | null;
  price?: number;
  isFree?: boolean;
  visibility?: 'public' | 'followers' | 'private';
  isComplete?: boolean;
}

export interface LibraryContent {
  key: string;
  kind: ContentKind;
  id: string;
  title: string;
  creator: ContentCreator | null;
  thumbnail: string | null;
  description: string | null;
  genre: string | null;
  tags: string[];
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  route: string;
  meta: ContentMeta;
  progressPercent?: number;
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
}

const KIND_LABELS: Record<ContentKind, string> = {
  book: 'Book',
  audio: 'Audio',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
};

export const CONTENT_KINDS: ContentKind[] = ['book', 'audio', 'pdf', 'image', 'video'];

export function kindLabel(kind: ContentKind): string {
  return KIND_LABELS[kind];
}

export function makeCreator(input: {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
} | null | undefined): ContentCreator | null {
  if (!input) return null;
  return {
    userId: input.user_id,
    username: input.username,
    displayName: input.display_name || `@${input.username}`,
    avatarUrl: input.avatar_url,
    isVerified: input.is_verified,
  };
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function displayInitials(name: string): string {
  return initials(name);
}

export function bookToContent(book: Book | LibraryBookWithProgress): LibraryContent {
  const withProgress = book as Partial<LibraryBookWithProgress>;
  const totalChapters = withProgress.total_chapters ?? book.chapter_count ?? 0;
  const completedChapters = withProgress.completed_count ?? 0;
  const progressPercent =
    totalChapters > 0 ? Math.min(100, Math.round((completedChapters / totalChapters) * 100)) : undefined;

  return {
    key: `book:${book.id}`,
    kind: 'book',
    id: book.id,
    title: book.title,
    creator: makeCreator({
      user_id: book.author_id,
      username: book.author?.username || '',
      display_name: book.author?.display_name || null,
      avatar_url: book.author?.avatar_url || null,
      is_verified: book.author?.is_verified || false,
    }),
    thumbnail: book.cover_url,
    description: book.description,
    genre: book.genre,
    tags: book.tags || [],
    viewCount: book.view_count || 0,
    createdAt: book.created_at,
    updatedAt: book.updated_at,
    route: `/library/book/${book.id}`,
    meta: {
      chapters: totalChapters,
      completedChapters,
      price: book.price,
      isFree: book.is_free || !book.price || book.price === 0,
      isComplete: totalChapters > 0 && completedChapters >= totalChapters,
    },
    progressPercent,
    liked: withProgress.is_liked,
  };
}

export function libraryItemToContent(item: LibraryItem): LibraryContent {
  return {
    key: `item:${item.id}`,
    kind: item.type,
    id: item.id,
    title: item.title,
    creator: makeCreator(
      item.profiles
        ? {
            user_id: item.user_id,
            username: item.profiles.username,
            display_name: item.profiles.display_name,
            avatar_url: item.profiles.avatar_url,
            is_verified: item.profiles.is_verified,
          }
        : null
    ),
    thumbnail: item.thumbnail_url || (item.type === 'image' ? item.file_url : null),
    description: item.description,
    genre: null,
    tags: item.tags || [],
    viewCount: item.view_count || 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    route: `/library/item/${item.id}`,
    meta: {
      durationSec: item.duration ?? null,
      pageCount: item.page_count ?? null,
      fileSize: item.file_size ?? null,
      visibility: item.visibility,
      isFree: true,
    },
    liked: item.is_liked,
    likeCount: item.like_count || 0,
    commentCount: item.comment_count || 0,
  };
}

export function matchSearch(content: LibraryContent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    content.title.toLowerCase().includes(q) ||
    (content.creator?.displayName.toLowerCase().includes(q) ?? false) ||
    (content.creator?.username.toLowerCase().includes(q) ?? false) ||
    content.tags.some((t) => t.toLowerCase().includes(q)) ||
    (content.genre?.toLowerCase().includes(q) ?? false)
  );
}

export const LEVEL_XP_BASE = 100;

export function xpFromMinutes(totalMinutes: number): number {
  return totalMinutes;
}

export interface LevelInfo {
  level: number;
  xp: number;
  intoLevel: number;
  needed: number;
  percent: number;
}

export function levelFromXp(xp: number): LevelInfo {
  const level = Math.max(1, Math.floor(xp / LEVEL_XP_BASE) + 1);
  const needed = LEVEL_XP_BASE;
  const intoLevel = xp % LEVEL_XP_BASE;
  return {
    level,
    xp,
    intoLevel,
    needed,
    percent: Math.min(100, Math.round((intoLevel / needed) * 100)),
  };
}