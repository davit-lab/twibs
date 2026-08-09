import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SystemSetting {
  key: string;
  value: boolean | string | number;
  updated_by: string | null;
  updated_at: string | null;
}

const SETTING_KEYS = [
  'maintenance_mode',
  'allow_registrations',
  'reels_upload_enabled',
  'comments_enabled',
  'story_posting_enabled',
  'direct_messages_enabled',
  'interest_posting_enabled',
  'signup_onboarding_enabled',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const SETTING_LABELS: Record<SettingKey, { label: string; description: string }> = {
  maintenance_mode: {
    label: 'Maintenance mode',
    description: 'Temporarily takes the entire platform offline for everyone except staff.',
  },
  allow_registrations: {
    label: 'Allow new registrations',
    description: 'When off, new account sign-ups are rejected.',
  },
  reels_upload_enabled: {
    label: 'Reels uploads',
    description: 'When off, users cannot upload new reels.',
  },
  comments_enabled: {
    label: 'Comments',
    description: 'When off, posting comments is disabled across the platform.',
  },
  story_posting_enabled: {
    label: 'Story posting',
    description: 'When off, users cannot post new stories.',
  },
  direct_messages_enabled: {
    label: 'Direct messages',
    description: 'When off, sending direct messages is disabled.',
  },
  interest_posting_enabled: {
    label: 'Interest space posts',
    description: 'When off, users cannot post in interest spaces.',
  },
  signup_onboarding_enabled: {
    label: 'Signup onboarding',
    description: 'When off, new users skip the interest onboarding flow.',
  },
};

export function useSystemSettings() {
  const [settings, setSettings] = useState<Record<string, SystemSetting>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('key, value, updated_by, updated_at');
      if (error) throw error;
      const map: Record<string, SystemSetting> = {};
      for (const row of data || []) {
        map[row.key] = { ...row, value: row.value ?? false };
      }
      setSettings(map);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const setSetting = useCallback(async (key: string, value: boolean) => {
    setSavingKey(key);
    try {
      const { error } = await (supabase as any).rpc('set_system_setting', {
        p_key: key,
        p_value: value,
      });
      if (error) throw error;
      setSettings(prev => ({
        ...prev,
        [key]: {
          key,
          value,
          updated_by: prev[key]?.updated_by ?? null,
          updated_at: new Date().toISOString(),
        },
      }));
      toast({
        title: 'Setting updated',
        description: SETTING_LABELS[key as SettingKey]?.label ?? key,
      });
    } catch (error: any) {
      console.error('Error updating setting:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to update setting',
        description: error?.message || 'Something went wrong.',
      });
    } finally {
      setSavingKey(null);
    }
  }, []);

  const list = SETTING_KEYS
    .map(key => ({
      key,
      ...SETTING_LABELS[key],
      value: Boolean(settings[key]?.value),
      updated_by: settings[key]?.updated_by ?? null,
      updated_at: settings[key]?.updated_at ?? null,
    }));

  return { settings, list, loading, savingKey, setSetting, refetch: fetchSettings };
}
