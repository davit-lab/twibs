import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, StopCircle, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveLocationMap } from './LiveLocationMap';
import {
  LiveLocationSession,
  LiveLocationDuration,
  isSessionActive,
  LocationSignal,
  formatAccuracy,
} from '@/hooks/useLiveLocation';
import { formatDistanceToNowStrict } from 'date-fns';

interface LocationShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: LiveLocationSession[];
  currentUserId?: string | null;
  requesting: boolean;
  error: string | null;
  signal: LocationSignal;
  lastAccuracy: number | null;
  onStart: (duration: LiveLocationDuration) => Promise<string | null>;
  onStop: (sessionId: string) => Promise<void>;
}

const DURATIONS: { minutes: LiveLocationDuration; label: string; sub: string }[] = [
  { minutes: 15, label: '15 minutes', sub: 'Short share' },
  { minutes: 60, label: '1 hour', sub: 'Long share' },
];

export default function LocationShareDialog({
  open,
  onOpenChange,
  sessions,
  currentUserId,
  requesting,
  error,
  signal,
  lastAccuracy,
  onStart,
  onStop,
}: LocationShareDialogProps) {
  const [stopping, setStopping] = useState(false);

  const ownActive = sessions.find((s) => s.user_id === currentUserId && isSessionActive(s));
  const activeSessions = sessions.filter(isSessionActive);

  const handleStop = async () => {
    if (!ownActive || stopping) return;
    setStopping(true);
    try {
      await onStop(ownActive.id);
      onOpenChange(false);
    } finally {
      setStopping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Share live location
          </DialogTitle>
          <DialogDescription>
            Everyone in this chat can see where you are, updating in real time until you stop or the
            timer runs out. Uses GPS — allow precise location for an accurate pin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {activeSessions.length > 0 && (
            <LiveLocationMap
              sessions={activeSessions}
              currentUserId={currentUserId}
              follow={!!ownActive}
              className="h-44"
            />
          )}

          {error && (
            <p className="text-xs text-destructive rounded-lg bg-destructive/10 px-3 py-2">{error}</p>
          )}

          {requesting && !ownActive ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Getting your precise location…</p>
                <p className="text-xs text-muted-foreground">
                  Waiting for a GPS fix so the pin is accurate.
                </p>
              </div>
            </div>
          ) : ownActive ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-2">
                  Sharing your location
                  <span
                    className={cn(
                      'text-[10px] font-bold rounded-full px-1.5 py-0.5',
                      signal === 'coarse' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'
                    )}
                  >
                    {signal === 'coarse' ? 'Approximate' : 'GPS'}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {lastAccuracy != null && `Accuracy ${formatAccuracy(lastAccuracy)} · `}
                  Ends in {formatDistanceToNowStrict(new Date(ownActive.expires_at))}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={stopping}
                className="h-8 rounded-full gap-1.5 text-destructive hover:text-destructive"
              >
                {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                Stop
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <Button
                    key={d.minutes}
                    variant="outline"
                    disabled={requesting}
                    onClick={() => onStart(d.minutes)}
                    className="h-auto flex-col gap-0.5 rounded-xl py-3 hover:border-primary/50 hover:bg-primary/5"
                  >
                    <Timer className="h-4 w-4 mb-1 text-primary" />
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="text-[11px] text-muted-foreground">{d.sub}</span>
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Only live while this chat is open on your device. Your position is written straight to
                this chat only and is not stored after sharing ends. On desktop the browser can only
                guess your position from your network (IP/VPN) — the pin will be wrong; use your phone
                for real GPS.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
