import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, ZoomControl } from 'react-leaflet';
import { LiveLocationSession, isSessionActive, formatAccuracy } from '@/hooks/useLiveLocation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Crosshair, Locate, MapPin, Navigation } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';

const SHARER_COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

function sharerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return SHARER_COLORS[hash % SHARER_COLORS.length];
}

function buildIcon(userId: string, isOwn: boolean) {
  const color = sharerColor(userId);
  const fill = isOwn ? color : '#ffffff';
  const stroke = isOwn ? '#ffffff' : color;
  return L.divIcon({
    className: 'live-loc-icon',
    html: `
      <div class="live-loc-pin" style="--loc-color: ${color};">
        <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 37C15 37 28 23.5 28 14C28 6.8 22.2 1 15 1C7.8 1 2 6.8 2 14C2 23.5 15 37 15 37Z" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
          <circle cx="15" cy="14" r="5.5" fill="${stroke}"/>
        </svg>
      </div>
    `,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
    popupAnchor: [0, -34],
    tooltipAnchor: [0, -34],
  });
}

function getInitialCenter(sessions: LiveLocationSession[]) {
  const active = sessions.filter(isSessionActive);
  for (const s of active) {
    if (s.current_lat != null && s.current_lng != null) {
      return { lat: s.current_lat, lng: s.current_lng };
    }
  }
  return { lat: 0, lng: 0 };
}

function AutoCenter({ sessions, follow }: { sessions: LiveLocationSession[]; follow: boolean }) {
  const map = useMap();
  const lastRef = useRef('');

  useEffect(() => {
    if (!follow) return;
    const active = sessions.filter(isSessionActive);
    const withPos = active.filter((s) => s.current_lat != null && s.current_lng != null);
    if (!withPos.length) return;
    const latest = withPos.reduce((a, b) =>
      new Date(a.updated_at).getTime() > new Date(b.updated_at).getTime() ? a : b
    );
    const key = `${latest.current_lat},${latest.current_lng}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    const lat = latest.current_lat as number;
    const lng = latest.current_lng as number;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.5 });
  }, [sessions, follow, map]);

  return null;
}

function CenterOnce({ sessions }: { sessions: LiveLocationSession[] }) {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const active = sessions.filter(isSessionActive);
    const withPos = active.filter((s) => s.current_lat != null && s.current_lng != null);
    if (!withPos.length) return;
    const first = withPos.reduce((a, b) =>
      new Date(a.started_at).getTime() < new Date(b.started_at).getTime() ? a : b
    );
    map.setView([first.current_lat as number, first.current_lng as number], 15);
    doneRef.current = true;
  }, [sessions, map]);

  return null;
}

interface LiveLocationMapProps {
  sessions: LiveLocationSession[];
  currentUserId?: string | null;
  follow?: boolean;
  className?: string;
  interactive?: boolean;
}

export function LiveLocationMap({
  sessions,
  currentUserId,
  follow = false,
  className,
  interactive = true,
}: LiveLocationMapProps) {
  const [followEnabled, setFollowEnabled] = useState(follow);

  const center = useMemo(() => getInitialCenter(sessions), [sessions]);
  const active = sessions.filter((s) => isSessionActive(s));
  const withPos = active.filter((s) => s.current_lat != null && s.current_lng != null);

  return (
    <div className={cn('relative h-56 w-full overflow-hidden rounded-2xl', className)}>
      <MapContainer
        center={center}
        zoom={15}
        zoomControl={false}
        scrollWheelZoom={interactive}
        dragging={interactive}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {interactive && <ZoomControl position="bottomright" />}
        {withPos.map((session) => {
          const lat = session.current_lat as number;
          const lng = session.current_lng as number;
          const isOwn = session.user_id === currentUserId;
          const color = sharerColor(session.user_id);
          return (
            <div key={session.id}>
              <Circle
                center={[lat, lng]}
                radius={session.accuracy ?? 25}
                pathOptions={{ color, weight: 1, opacity: 0.4, fillColor: color, fillOpacity: 0.08 }}
              />
              <Marker
                position={[lat, lng]}
                icon={buildIcon(session.user_id, isOwn)}
                zIndexOffset={isOwn ? 1000 : 0}
              >
                <Popup>
                  <div className="flex items-center gap-2 px-0.5 py-1">
                    <Avatar className="h-7 w-7 rounded-full">
                      <AvatarImage src={session.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                        {(session.profiles?.display_name || 'U').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">
                        {isOwn ? 'You' : session.profiles?.display_name || 'Someone'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {isSessionActive(session)
                          ? `Updated ${formatDistanceToNowStrict(new Date(session.updated_at), { addSuffix: true })}`
                          : 'Stopped sharing'}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
        {interactive ? (
          <AutoCenter sessions={sessions} follow={followEnabled} />
        ) : (
          <CenterOnce sessions={sessions} />
        )}
      </MapContainer>

      {interactive && (
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            'absolute bottom-4 right-4 h-9 w-9 rounded-full shadow-md',
            followEnabled && 'text-primary'
          )}
          onClick={() => setFollowEnabled((f) => !f)}
          title={followEnabled ? 'Following — tap to stop' : 'Tap to follow location'}
        >
          {followEnabled ? <Navigation className="h-4 w-4" /> : <Locate className="h-4 w-4" />}
        </Button>
      )}

      {active.length > 0 && (
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 shadow-sm border border-border/60">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[11px] font-medium text-foreground">
            {active.length === 1 ? 'Live' : `${active.length} live`}
          </span>
        </div>
      )}
    </div>
  );
}

interface LocationPreviewProps {
  session: LiveLocationSession | null;
  currentUserId?: string | null;
  isOwn: boolean;
  onExpand?: () => void;
}

export function LocationPreview({ session, currentUserId, isOwn, onExpand }: LocationPreviewProps) {
  const sessions = useMemo(() => (session ? [session] : []), [session]);
  const isLive = !!session && isSessionActive(session);

  if (!session) {
    return (
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-muted/40 text-muted-foreground">
        <MapPin className="h-5 w-5" />
        <span className="text-sm">Location unavailable</span>
      </div>
    );
  }

  return (
    <div className="min-w-[260px] max-w-[320px] overflow-hidden rounded-2xl">
      <LiveLocationMap sessions={sessions} currentUserId={currentUserId} interactive={false} className="h-40" />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isLive ? (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 flex-shrink-0" />
          )}
          <span className={cn('text-xs font-medium truncate', isOwn ? 'text-white' : 'text-foreground')}>
            {isLive ? 'Live location' : 'Location'}
          </span>
          {isLive && session.accuracy != null && (
            <span className={cn('text-[10px] flex-shrink-0', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
              {formatAccuracy(session.accuracy)}
            </span>
          )}
        </div>
        {isLive && onExpand && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className={cn(
              'h-7 gap-1 rounded-full px-2.5 text-[11px]',
              isOwn ? 'text-white hover:bg-white/15 hover:text-white' : 'text-primary'
            )}
          >
            <Crosshair className="h-3.5 w-3.5" />
            View live
          </Button>
        )}
      </div>
    </div>
  );
}
