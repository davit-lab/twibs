import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2 } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';

export default function AdminSettingsTab() {
  const { list, loading, savingKey, setSetting } = useSystemSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          System Configuration
        </CardTitle>
        <CardDescription>
          Global kill switches and feature flags. Changes apply instantly and are recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center"><Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" /></div>
        ) : (
          <div className="divide-y divide-border/60 rounded-xl border border-border/60">
            {list.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  {item.updated_at && (
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Last changed {new Date(item.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={item.value ? 'default' : 'secondary'} className={item.value ? '' : 'text-muted-foreground'}>
                    {item.value ? 'ON' : 'OFF'}
                  </Badge>
                  <Switch
                    checked={item.value}
                    disabled={savingKey === item.key}
                    onCheckedChange={(checked) => setSetting(item.key, checked)}
                    aria-label={item.label}
                  />
                  {savingKey === item.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
