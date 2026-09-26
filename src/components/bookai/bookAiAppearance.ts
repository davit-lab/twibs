/**
 * bookAiAppearance.ts — Book AI color/appearance system.
 *
 * Design contract (house identity — see BookAI product spec §3–§4):
 *   * ONE base accent per user selection, everything else is DERIVED from it
 *   * the reading surface stays black/near-black (#090909 / #111111 / #181818)
 *   * the accent appears ONLY as a small number of scoped indicators:
 *       header dot, active chip, focus border, source hover, progress accent
 *   * never a full UI recolor, never a rainbow, never a glow
 *
 * Everything here is pure + serializable: no React, no DOM, no state. The UI
 * layer consumes `buildAccentTokens(base)` and writes the derived values as
 * inline CSS custom properties on the Book AI rail element, so the accent is
 * scoped to Book AI and can never restyle the surrounding Library/Reader.
 */

export type BookAiAccentKey =
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'rose'
  | 'orange'
  | 'gray';

export type BookAiDensity = 'comfortable' | 'compact';

export type BookAiAppearance = {
  /** The user's selected base accent. Controls every derived token. */
  accent: BookAiAccentKey;
  /** Reading density of the rail. */
  density: BookAiDensity;
  /** Respect reduce-motion when the OS/accessibility asks for it. */
  reduceMotion: boolean;
};

export const BOOK_AI_DEFAULT_APPEARANCE: BookAiAppearance = {
  accent: 'violet',
  density: 'comfortable',
  reduceMotion: false,
};

/**
 * Base hue/saturation for each accent key. LIGHTNESS is intentionally NOT
 * stored here: it is derived + clamped in buildAccentTokens so that a
 * user-picked accent can never collapse to illegible on a near-black rail.
 */
const ACCENT_BASES: Record<BookAiAccentKey, { h: number; s: number }> = {
  violet: { h: 262, s: 62 },
  blue: { h: 223, s: 65 },
  cyan: { h: 188, s: 66 },
  green: { h: 152, s: 58 },
  amber: { h: 39, s: 82 },
  rose: { h: 350, s: 66 },
  orange: { h: 24, s: 84 },
  gray: { h: 220, s: 5 },
};

export type BookAiAccentTokens = {
  /** Primary accent — header dot, active chip, focused border. */
  accent: string;
  /** Hover variant — chip/source hover, slightly lifted. */
  accentHover: string;
  /** Muted scrim — subtle fill behind a chip/indicator. */
  accentSoft: string;
  /** Border — hairline accent border on hover/focus. */
  accentBorder: string;
  /** On-accent text — text that sits on top of the accent. */
  accentForeground: string;
  /** Focus ring — translucent ring for keyboard focus states. */
  focusRing: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Derive the full token set from ONE base color.
 *
 * Readability contract on a near-black (#111) rail:
 *   * accent lightness is clamped to 52–62 so a "dusted" or "neon" pick still
 *     reads as a real color, never a glow
 *   * hover lifts lightness +4, never into white
 *   * on-accent text uses the dark foundation (#0a0a0a) for contrast
 *   * soft/border/focus-ring are all translucent ALPHA over the base accent —
 *     no invented alpha-fake, just layered color over the same dark bg
 */
export function buildAccentTokens(key: BookAiAccentKey): BookAiAccentTokens {
  const { h, s } = ACCENT_BASES[key];
  const l = clamp(57, 52, 62);
  return {
    accent: `hsl(${h} ${s}% ${l}%)`,
    accentHover: `hsl(${h} ${s}% ${l + 5}%)`,
    accentSoft: `hsla(${h} ${s}% ${l}% / 0.14)`,
    accentBorder: `hsla(${h} ${s}% ${l}% / 0.4)`,
    accentForeground: '#0a0a0a',
    focusRing: `hsla(${h} ${s}% ${l}% / 0.5)`,
  };
}

/**
 * Serialize the accent tokens as scoped CSS custom properties.
 * Set these on the Book AI rail element only (style={{ ...accentCssVars(key) }}).
 * Nothing global, nothing leaked to the Library/Reader theme.
 */
export function accentCssVars(key: BookAiAccentKey): React.CSSProperties {
  const t = buildAccentTokens(key);
  return {
    '--bookai-accent': t.accent,
    '--bookai-accent-hover': t.accentHover,
    '--bookai-accent-soft': t.accentSoft,
    '--bookai-accent-border': t.accentBorder,
    '--bookai-accent-foreground': t.accentForeground,
    '--bookai-accent-focus-ring': t.focusRing,
  } as React.CSSProperties;
}

import type React from 'react';
