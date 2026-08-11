import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const SETTING_KEYS = [
  'maintenance_mode',
  'allow_registrations',
  'reels_upload_enabled',
  'comments_enabled',
  'story_posting_enabled',
  'direct_messages_enabled',
  'interest_posting_enabled',
  'signup_onboarding_enabled',
  'face_auth_enabled',
] as const;

export type AppSettingKey = (typeof SETTING_KEYS)[number];

// Safe defaults if a key is missing (maintenance off, everything else on).
const DEFAULTS: Record<AppSettingKey, boolean> = {
  maintenance_mode: false,
  allow_registrations: true,
  reels_upload_enabled: true,
  comments_enabled: true,
  story_posting_enabled: true,
  direct_messages_enabled: true,
  interest_posting_enabled: true,
  signup_onboarding_enabled: true,
  face_auth_enabled: false,
};

interface SystemSettingsContextType {
  settings: Record<AppSettingKey, boolean>;
  isLoading: boolean;
  isEnabled: (key: AppSettingKey) => boolean;
  refetch: () => Promise<void>;
}

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<AppSettingKey, boolean>>({ ...DEFAULTS });
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('key, value')
        .in('key', [...SETTING_KEYS]);
      if (error) throw error;
      const next = { ...DEFAULTS };
      for (const row of (data || []) as Array<{ key: AppSettingKey; value: boolean }>) {
        if (row.key in next) next[row.key] = Boolean(row.value);
      }
      setSettings(next);
    } catch {
      // Keep defaults; settings load is non-critical.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const channel = (supabase as any)
      .channel('system-settings-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => refetch()
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [refetch]);

  const isEnabled = useCallback((key: AppSettingKey) => settings[key] ?? DEFAULTS[key], [settings]);

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoading, isEnabled, refetch }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error('useAppSettings must be used within a SystemSettingsProvider');
  }
  return context;
}
