import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { detectCountryFromIP, detectBrowserLanguage } from '@/lib/languageDetection';

function applyThemeToDOM(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem('twibsers-theme', theme);
}

export interface UserPreferences {
  id?: string;
  user_id: string;
  theme: string;
  font_size: string;
  display_density: string;
  color_accent: string;
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
}

const defaultPreferences: Omit<UserPreferences, 'user_id'> = {
  theme: 'system',
  font_size: 'medium',
  display_density: 'comfortable',
  color_accent: 'purple',
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
};

export function useUserPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences(data as UserPreferences);
        // Apply theme from preferences
        if (data.theme) {
          applyThemeToDOM(data.theme);
        }
        // Apply font size
        applyFontSize(data.font_size);
        // Apply accent color
        applyAccentColor(data.color_accent);
        // Apply accessibility settings
        applyAccessibilitySettings(data);
      } else {
        // Detect language from IP/browser for new users
        let detectedLanguage = detectBrowserLanguage();
        try {
          detectedLanguage = await detectCountryFromIP();
        } catch (e) {
          console.log('Using browser language fallback');
        }
        
        // Create default preferences with detected language
        const newPreferences = { ...defaultPreferences, user_id: user.id, language: detectedLanguage };
        const { data: created, error: createError } = await supabase
          .from('user_preferences')
          .insert(newPreferences)
          .select()
          .single();

        if (createError) throw createError;
        setPreferences(created as UserPreferences);
      }
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
    const colors = accents[accent] || accents.purple;
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--primary-glow', colors.glow);
    root.style.setProperty('--ring', colors.primary);
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
    if (!user || !preferences) return;

    // Optimistically update the UI
    if (updates.theme) {
      applyThemeToDOM(updates.theme);
    }
    if (updates.font_size) {
      applyFontSize(updates.font_size);
    }
    if (updates.color_accent) {
      applyAccentColor(updates.color_accent);
    }
    if (updates.reduced_motion !== undefined || updates.high_contrast !== undefined) {
      applyAccessibilitySettings({ ...preferences, ...updates });
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) throw error;

      setPreferences({ ...preferences, ...updates });
      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated.',
      });
    } catch (error: any) {
      // Revert on error
      if (updates.theme && preferences.theme) {
        applyThemeToDOM(preferences.theme);
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
