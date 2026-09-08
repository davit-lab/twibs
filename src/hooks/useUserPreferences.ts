import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { detectCountryFromIP, detectBrowserLanguage } from '@/lib/languageDetection';

function applyThemeToDOM() {
  const root = document.documentElement;
  root.classList.add('dark');
  localStorage.setItem('twibsers-theme', 'dark');
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0;
  const raw = hex.replace('#', '');
  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function normalizeHex(hex: string): string {
  let raw = hex.replace('#', '').trim();
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    raw = raw.split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return '';
}

export function colorToHslTriple(color: string): { primary: string; glow: string } | null {
  const hex = normalizeHex(color);
  if (hex) {
    const { h, s, l } = hexToHsl(hex);
    const glow = Math.max(8, Math.min(l + 12, 92));
    return { primary: `${h} ${s}% ${l}%`, glow: `${h} 100% ${glow}%` };
  }
  const hslMatch = color.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const glow = Math.max(8, Math.min(l + 12, 92));
    return { primary: `${h} ${s}% ${l}%`, glow: `${h} 100% ${glow}%` };
  }
  return null;
}

export interface UserPreferences {
  id?: string;
  user_id: string;
  theme: string;
  font_size: string;
  display_density: string;
  color_accent: string;
  message_bubble_color: string;
  autoplay_videos: boolean;
  content_filter: string;
  language: string;
  show_sensitive_content: boolean;
  reduced_motion: boolean;
  high_contrast: boolean;
  screen_reader_optimized: boolean;
  two_factor_enabled: boolean;
  login_alerts: boolean;
  do_not_disturb: boolean;
  ghost_mode: boolean;
  hide_like_counts: boolean;
}

const defaultPreferences: Omit<UserPreferences, 'user_id'> = {
  theme: 'dark',
  font_size: 'medium',
  display_density: 'comfortable',
  color_accent: 'purple',
  message_bubble_color: 'purple',
  autoplay_videos: true,
  content_filter: 'standard',
  language: 'en',
  show_sensitive_content: false,
  reduced_motion: false,
  high_contrast: false,
  screen_reader_optimized: false,
  two_factor_enabled: false,
  login_alerts: true,
  do_not_disturb: false,
  ghost_mode: false,
  hide_like_counts: false,
};

// ---- Shared singleton cache so multiple components (e.g. every PostCard)
// ---- never fire their own Supabase fetch for the same user.
let cachedPreferences: UserPreferences | null = null;
let cachedUserId: string | null = null;
let inFlight: Promise<UserPreferences | null> | null = null;
let isFetching = false;
const listeners = new Set<() => void>();

function notifySubscribers() {
  listeners.forEach((listener) => listener());
}

function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPreferencesSnapshot(): UserPreferences | null {
  return cachedPreferences;
}

function getPreferencesSnapshotAny(): UserPreferences | null | undefined {
  return cachedPreferences;
}

function setCache(userId: string, prefs: UserPreferences | null) {
  cachedUserId = userId;
  cachedPreferences = prefs;
  isFetching = false;
  inFlight = null;
  notifySubscribers();
}

async function loadPreferencesForUser(userId: string, createMissing = false): Promise<UserPreferences | null> {
  if (inFlight) return inFlight;

  isFetching = true;
  inFlight = (async () => {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      const preferred = data as UserPreferences;
      if (preferred.ghost_mode == null) preferred.ghost_mode = false;
      if (preferred.hide_like_counts == null) preferred.hide_like_counts = false;
      setCache(userId, preferred);
      return preferred;
    }

    if (!createMissing) {
      setCache(userId, null);
      return null;
    }

    // Detect language from IP/browser for new users
    let detectedLanguage = detectBrowserLanguage();
    try {
      detectedLanguage = await detectCountryFromIP();
    } catch {
      // browser language fallback
    }

    const fresh: UserPreferences = { ...defaultPreferences, user_id: userId, language: detectedLanguage };
    const { data: created, error: createError } = await supabase
      .from('user_preferences')
      .insert(fresh)
      .select()
      .single();

    if (createError) throw createError;

    const createdPrefs = created as UserPreferences;
    setCache(userId, createdPrefs);
    return createdPrefs;
  })().catch((err) => {
    isFetching = false;
    inFlight = null;
    throw err;
  });

  return inFlight;
}

export function useUserPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<boolean>(() => !cachedPreferences);
  const [saving, setSaving] = useState(false);

  const preferences = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getPreferencesSnapshotAny
  ) as UserPreferences | null;

  // Apply runtime styles whenever the cached value changes (once per boot).
  const lastApplied = useRef('');
  useEffect(() => {
    if (!preferences) return;
    const key = `${preferences.theme}|${preferences.font_size}|${preferences.color_accent}|${preferences.message_bubble_color}|${preferences.reduced_motion}|${preferences.high_contrast}`;
    if (lastApplied.current === key) return;
    lastApplied.current = key;
    applyThemeToDOM();
    applyFontSize(preferences.font_size);
    applyAccentColor(preferences.color_accent);
    applyBubbleColor(preferences.message_bubble_color);
    applyAccessibilitySettings(preferences);
  }, [preferences]);

  const fetchPreferences = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (cachedUserId === user.id && cachedPreferences !== null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadPreferencesForUser(user.id, true);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchPreferences();
    } else {
      setLoading(false);
    }
  }, [user, fetchPreferences]);

  const applyFontSize = (size: string) => {
    const root = document.documentElement;
    const sizes: Record<string, string> = {
      small: '14px',
      medium: '16px',
      large: '18px',
      xlarge: '20px',
    };
    root.style.setProperty('--base-font-size', sizes[size] || '16px');
    root.style.fontSize = sizes[size] || '16px';
  };

  const applyAccentColor = (accent: string) => {
    const root = document.documentElement;
    const accents: Record<string, { primary: string; glow: string }> = {
      purple: { primary: '270 70% 55%', glow: '270 100% 65%' },
      blue: { primary: '220 70% 55%', glow: '220 100% 65%' },
      green: { primary: '160 70% 45%', glow: '160 100% 55%' },
      orange: { primary: '30 90% 55%', glow: '30 100% 65%' },
      pink: { primary: '330 80% 55%', glow: '330 100% 65%' },
      red: { primary: '0 75% 55%', glow: '0 100% 65%' },
    };
    const colors = accents[accent] || colorToHslTriple(accent) || accents.purple;
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-glow', colors.glow);
    root.style.setProperty('--ring', colors.primary);
  };

  const applyBubbleColor = (color: string) => {
    const root = document.documentElement;
    const bubbleColors: Record<string, { color: string; glow: string }> = {
      purple: { color: '262 83% 62%', glow: '262 100% 68%' },
      blue: { color: '220 70% 60%', glow: '220 100% 68%' },
      green: { color: '160 70% 45%', glow: '160 100% 55%' },
      teal: { color: '185 75% 45%', glow: '185 100% 55%' },
      orange: { color: '30 90% 55%', glow: '30 100% 65%' },
      pink: { color: '330 80% 60%', glow: '330 100% 68%' },
      red: { color: '0 75% 55%', glow: '0 100% 65%' },
      indigo: { color: '245 60% 62%', glow: '245 100% 70%' },
    };
    const colors = bubbleColors[color] || bubbleColors.purple;
    root.style.setProperty('--bubble-own', colors.color);
    root.style.setProperty('--bubble-own-glow', colors.glow);
  };

  const applyAccessibilitySettings = (prefs: Partial<UserPreferences>) => {
    const root = document.documentElement;

    if (prefs.reduced_motion) {
      root.style.setProperty('--transition-duration', '0ms');
      root.classList.add('reduce-motion');
    } else {
      root.style.removeProperty('--transition-duration');
      root.classList.remove('reduce-motion');
    }

    if (prefs.high_contrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    if (!user) return;
    const current = cachedPreferences ?? (await loadPreferencesForUser(user.id, true).catch(() => null));
    const next = { ...defaultPreferences, ...(current as UserPreferences | {}), user_id: user.id, ...updates };

    // Optimistically update the UI
    if (updates.theme) {
      applyThemeToDOM();
    }
    if (updates.font_size) {
      applyFontSize(updates.font_size);
    }
    if (updates.color_accent) {
      applyAccentColor(updates.color_accent);
    }
    if (updates.message_bubble_color) {
      applyBubbleColor(updates.message_bubble_color);
    }
    if (updates.reduced_motion !== undefined || updates.high_contrast !== undefined) {
      applyAccessibilitySettings(next);
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) throw error;

      setCache(user.id, next as UserPreferences);
      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated.',
      });
    } catch (error: any) {
      // Revert on error
      if (updates.theme && cachedPreferences?.theme) {
        applyThemeToDOM();
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save preferences',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    preferences,
    loading,
    saving,
    updatePreferences,
  };
}
