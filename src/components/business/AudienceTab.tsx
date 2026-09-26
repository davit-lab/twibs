import { useBusinessAudience } from '@/hooks/useBusinessData';
import { MetricCard, LoadingGrid, EmptyState } from '@/components/business/bits';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Repeat, UserRound, MapPin, Languages, Hash } from 'lucide-react';

interface BucketItem {
  count: number;
  location?: string;
  language?: string;
  name?: string;
}

function BucketList({ title, icon, items, labelKey }: { title: string; icon: React.ReactNode; items: BucketItem[]; labelKey: 'location' | 'language' | 'name' }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Not enough data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 8).map((item, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate font-medium">{item[labelKey]}</span>
                <span className="tabular-nums text-muted-foreground">{item.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AudienceTab({ businessId }: { businessId: string }) {
  const { data: audience, isLoading, isError } = useBusinessAudience(businessId);

  if (isLoading) return <LoadingGrid items={4} />;
  if (isError || !audience)
    return (
      <EmptyState
        title="Could not load audience data"
        description="Audience insights appear once your promotions start delivering."
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total reach" value={audience.total_reach} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Returning viewers" value={audience.returning_viewers} icon={<Repeat className="h-4 w-4" />} hint="Saw your ad 2+ times" />
        <MetricCard label="Followers" value={audience.followers} icon={<UserRound className="h-4 w-4" />} />
        <MetricCard label="Engagers" value={audience.top_engagers.length} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <BucketList title="Top locations" icon={<MapPin className="h-4 w-4" />} items={audience.locations} labelKey="location" />
        <BucketList title="Languages" icon={<Languages className="h-4 w-4" />} items={audience.languages} labelKey="language" />
        <BucketList title="Interests" icon={<Hash className="h-4 w-4" />} items={audience.interests} labelKey="name" />
      </div>

      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-semibold">Top engagers</p>
        {audience.top_engagers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Engagement from real viewers will show up here. No fake data, ever.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {audience.top_engagers.map((eng) => (
              <div key={eng.username} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={eng.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{(eng.display_name || eng.username)[0]}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{eng.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{eng.username}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{eng.count} actions</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}