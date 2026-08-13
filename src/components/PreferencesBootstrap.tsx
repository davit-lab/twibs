import { useUserPreferences } from '@/hooks/useUserPreferences';

export default function PreferencesBootstrap() {
  useUserPreferences();
  return null;
}
