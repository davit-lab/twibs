export interface ChatWallpaper {
  id: string;
  name: string;
  background: string;
}

const PATTERN =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 10px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 10px)';

export const NONE_WALLPAPER_ID = 'none';

export const BUILT_IN_WALLPAPERS: ChatWallpaper[] = [
  {
    id: 'dusk',
    name: 'Dusk',
    background: `${PATTERN}, linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background: `${PATTERN}, linear-gradient(135deg, #f093fb 0%, #f5576c 100%)`,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: `${PATTERN}, linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)`,
  },
  {
    id: 'forest',
    name: 'Forest',
    background: `${PATTERN}, linear-gradient(135deg, #11998e 0%, #38ef7d 100%)`,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: `${PATTERN}, linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)`,
  },
  {
    id: 'candy',
    name: 'Candy',
    background: `${PATTERN}, linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)`,
  },
  {
    id: 'gold',
    name: 'Gold',
    background: `${PATTERN}, linear-gradient(135deg, #f6d365 0%, #fda085 100%)`,
  },
  {
    id: 'grape',
    name: 'Grape',
    background: `${PATTERN}, linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)`,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background: `${PATTERN}, linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)`,
  },
  {
    id: 'berry',
    name: 'Berry',
    background: `${PATTERN}, linear-gradient(135deg, #ec008c 0%, #fc6767 100%)`,
  },
  {
    id: 'slate',
    name: 'Slate',
    background: `${PATTERN}, linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)`,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    background: `${PATTERN}, linear-gradient(135deg, #c3cfe2 0%, #f5f7fa 100%)`,
  },
];

export function isCustomWallpaper(value: string): boolean {
  return /^https?:\/\//.test(value);
}

export function getWallpaperBackground(value: string | null | undefined): string | null {
  if (!value || value === NONE_WALLPAPER_ID) return null;
  const builtIn = BUILT_IN_WALLPAPERS.find((w) => w.id === value);
  if (builtIn) return builtIn.background;
  if (isCustomWallpaper(value)) return `url("${value}") center / cover no-repeat`;
  return null;
}

export function wallpaperName(value: string | null | undefined): string {
  if (!value || value === NONE_WALLPAPER_ID) return 'Default';
  const builtIn = BUILT_IN_WALLPAPERS.find((w) => w.id === value);
  if (builtIn) return builtIn.name;
  if (isCustomWallpaper(value)) return 'Custom';
  return 'Default';
}
