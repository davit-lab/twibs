import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Settings2, Power, UserPlus, Clapperboard, MessageSquare, Sparkles, Send, Compass, BadgeCheck,
} from 'lucide-react';
import { useSystemSettings, type SettingKey } from '@/hooks/useSystemSettings';
import { cn } from '@/lib/utils';
import AdminSection from './AdminSection';

const SETTING_META: Record<
  SettingKey,
  { icon: React.ElementType; className: string }
> = {
  maintenance_mode: {
    icon: Power,
    className: 'bg-muted text-muted-foreground',
  },
  allow_registrations: {
    icon: UserPlus,
    className: 'bg-muted text-muted-foreground',
  },
  reels_upload_enabled: {
    icon: Clapperboard,
    className: 'bg-muted text-muted-foreground',
  },
  comments_enabled: {
    icon: MessageSquare,
    className: 'bg-muted text-muted-foreground',
  },
  story_posting_enabled: {
    icon: Sparkles,
    className: 'bg-muted text-muted-foreground',
  },
  direct_messages_enabled: {
    icon: Send,
    className: 'bg-muted text-muted-foreground',
  },
  interest_posting_enabled: {
    icon: Compass,
    className: 'bg-muted text-muted-foreground',
  },
  signup_onboarding_enabled: {
    icon: BadgeCheck,
    className: 'bg-muted text-muted-foreground',
  },
};

export default function AdminSettingsTab() {
  const { list, loading, savingKey, setSetting } = useSystemSettings();

  return (
    <AdminSection
      icon={Settings2}
      title="System Configuration"
      eyebrow="Global"
      description="Global kill switches and feature flags. Changes apply instantly and are recorded in the audit log."
    >
        {loading ? (
          <div className="py-14 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((item) => {
              const meta = SETTING_META[item.key];
              const Icon = meta?.icon ?? Settings2;
              return (
                <Card key={item.key} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        meta?.className ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      {savingKey === item.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={item.value}
                        disabled={savingKey === item.key}
                        onCheckedChange={(checked) => setSetting(item.key, checked)}
                        aria-label={item.label}
                      />
                    </div>
                  </div>
                  <p className="mt-4 font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  {item.updated_at && (
                    <p className="mt-3 text-xs text-muted-foreground/70">
                      Last changed {new Date(item.updated_at).toLocaleString()}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
    </AdminSection>
  );
}
