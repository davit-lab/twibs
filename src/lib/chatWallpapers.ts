/**
 * Chat background library.
 *
 * System backgrounds are an editorially curated set of real photography
 * served from the Unsplash CDN (stable, license-compliant photo URLs).
 * There are no gradients, placeholders or demo assets here.
 *
 * `conversations.chat_wallpaper` stores either a system background id or the
 * public URL of a user-uploaded (custom) background.
 */

export type WallpaperCategory =
  | 'Featured'
  | 'Nature'
  | 'Cities'
  | 'Architecture'
  | 'Dark & Moody'
  | 'Minimal';

export interface ChatWallpaper {
  id: string;
  name: string;
  category: WallpaperCategory;
  description: string;
  /** Base Unsplash CDN URL for this photo (no query params yet). */
  url: string;
  /** Color sampled at the average tint — used as the tile placeholder. */
  tint: string;
}

export const NONE_WALLPAPER_ID = 'none';

const IMAGE_HOST = 'https://images.unsplash.com';

/** Build a sized, cropped URL for the chat surface (default 1600px wide). */
export function wallpaperSourceUrl(base: string, width = 1600): string {
  return `${IMAGE_HOST}${base}?auto=format&fm=webp&fit=crop&crop=entropy&w=${width}&q=80`;
}

/** Build a small crop for the selector grid (portrait tiles). */
export function wallpaperThumbUrl(base: string, width = 400, height = 500): string {
  return `${IMAGE_HOST}${base}?auto=format&fm=webp&fit=crop&crop=entropy&w=${width}&h=${height}&q=70`;
}

export const BUILT_IN_WALLPAPERS: ChatWallpaper[] = [
  // ------------------------------------------------------------- Featured --
  {
    id: 'dusk',
    name: 'Alpine Dusk',
    category: 'Featured',
    description: 'Ridge lines fading into dusk light',
    url: '/photo-1501785888041-af3ef285b470',
    tint: '#3a3d4a',
  },
  {
    id: 'sunset',
    name: 'Golden Field',
    category: 'Featured',
    description: 'Warm light over open countryside',
    url: '/photo-1472214103451-9374bd1c798e',
    tint: '#4a3b2a',
  },
  // --------------------------------------------------------------- Nature --
  {
    id: 'ocean',
    name: 'Open Water',
    category: 'Nature',
    description: 'Deep blue sea meeting the shore',
    url: '/photo-1507525428034-b723cf961d3e',
    tint: '#1f3a4a',
  },
  {
    id: 'forest',
    name: 'Forest Light',
    category: 'Nature',
    description: 'Sunbeams through dense green canopy',
    url: '/photo-1441974231531-c6227db76b6e',
    tint: '#23331f',
  },
  {
    id: 'aurora',
    name: 'Northern Sky',
    category: 'Nature',
    description: 'Aurora sweeping over a quiet coast',
    url: '/photo-1531366936337-7c912a4589a7',
    tint: '#1c2a33',
  },
  // --------------------------------------------------------------- Cities --
  {
    id: 'slate',
    name: 'City at Night',
    category: 'Cities',
    description: 'Chicago skyline glowing after dark',
    url: '/photo-1477959858617-67f85cf4f1df',
    tint: '#20273a',
  },
  {
    id: 'candy',
    name: 'Neon Streets',
    category: 'Cities',
    description: 'Lit facades and night foot traffic',
    url: '/photo-1519501025264-65ba15a82390',
    tint: '#2a2433',
  },
  // ---------------------------------------------------------- Architecture --
  {
    id: 'grape',
    name: 'White Lines',
    category: 'Architecture',
    description: 'Minimal concrete geometry',
    url: '/photo-1487958449943-2429e8be8625',
    tint: '#2e3338',
  },
  {
    id: 'gold',
    name: 'Glass Facade',
    category: 'Architecture',
    description: 'Modern offices refracted in late sun',
    url: '/photo-1518005020951-eccb494ad742',
    tint: '#2c3240',
  },
  // ---------------------------------------------------------- Dark & Moody --
  {
    id: 'midnight',
    name: 'Star Field',
    category: 'Dark & Moody',
    description: 'Milky way over still mountains',
    url: '/photo-1519681393784-d120267933ba',
    tint: '#101420',
  },
  {
    id: 'berry',
    name: 'Low Cloud',
    category: 'Dark & Moody',
    description: 'Moody mist rolling over the hills',
    url: '/photo-1504893524553-b855bce32c67',
    tint: '#20242b',
  },
  // -------------------------------------------------------------- Minimal --
  {
    id: 'lavender',
    name: 'Quiet Room',
    category: 'Minimal',
    description: 'Soft daylight in an empty interior',
    url: '/photo-1497366754035-f200968a6e72',
    tint: '#2b2e31',
  },
];

export const WALLPAPER_CATEGORIES: WallpaperCategory[] = [
  'Featured',
  'Nature',
  'Cities',
  'Architecture',
  'Dark & Moody',
  'Minimal',
];

export function getWallpaperBaseUrl(id: string): ChatWallpaper | null {
  return BUILT_IN_WALLPAPERS.find((w) => w.id === id) || null;
}

export function isCustomWallpaper(value: string): boolean {
  return /^https?:\/\//.test(value);
}

/** Resolve a stored conversation value into a CSS background shorthand. */
export function getWallpaperBackground(value: string | null | undefined): string | null {
  if (!value || value === NONE_WALLPAPER_ID) return null;
  const builtIn = getWallpaperBaseUrl(value);
  if (builtIn) return `url("${wallpaperSourceUrl(builtIn.url)}") center / cover no-repeat`;
  if (isCustomWallpaper(value)) return `url("${value}") center / cover no-repeat`;
  return null;
}

export function wallpaperName(value: string | null | undefined): string {
  if (!value || value === NONE_WALLPAPER_ID) return 'Default';
  const builtIn = getWallpaperBaseUrl(value);
  if (builtIn) return builtIn.name;
  if (isCustomWallpaper(value)) return 'Custom';
  return 'Default';
}

/** Thumbnail used by the selector and for `getWallpaperPreview`. */
export function wallpaperThumbForValue(value: string | null | undefined): string | null {
  if (!value || value === NONE_WALLPAPER_ID) return null;
  const builtIn = getWallpaperBaseUrl(value);
  if (builtIn) return wallpaperThumbUrl(builtIn.url);
  if (isCustomWallpaper(value)) return value;
  return null;
}

/** A custom background the user has uploaded (mirrors custom_backgrounds row). */
export interface CustomBackground {
  id: string;
  user_id: string;
  url: string;
  storage_path: string | null;
  thumb_path: string | null;
  mime: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}