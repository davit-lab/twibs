import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useCall } from './callContext';

export function CallMiniPlayer() {
  const call = useCall();
  const { peerProfile, remoteStream, isMuted, phase } = call;
  const [elapsed, setElapsed] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (phase !== 'connected') {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { pointerId: e.pointerId, offsetX: e.clientX, offsetY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    setPos({
      x: clamp(e.clientX - ds.offsetX, 8, window.innerWidth - 330),
      y: clamp(e.clientY - ds.offsetY, 12, window.innerHeight - 120),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const duration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const initials =
    peerProfile?.display_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const hasVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0;

  const ends = (
    <>
      <button
        type="button"
        aria-label="Restore call"
        onClick={call.restore}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        onClick={() => void call.toggleMute()}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          isMuted
            ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'
        )}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      <button
        type="button"
        aria-label="End call"
        onClick={() => void call.endCall()}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(0_72%_51%)] text-white transition-transform active:scale-95"
      >
        <PhoneOff className="h-4 w-4 -scale-x-100" />
      </button>
    </>
  );

  // ---- mobile: full-width bottom bar (not draggable) ----
  if (typeof window !== 'undefined' && window.innerWidth < 640) {
    return (
      <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-[55] flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-2xl">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-black object-cover"
          />
        ) : (
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={peerProfile?.avatar_url ?? undefined} alt={peerProfile?.display_name ?? 'Remote'} />
            <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">{initials}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{peerProfile?.display_name ?? 'Call'}</p>
          <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
            {phase === 'connected' ? duration : phase === 'ringing' ? 'Ringing…' : phase === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
          </p>
        </div>
        {ends}
      </div>
    );
  }

  // ---- desktop: floating draggable card ----
  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="fixed z-[55] flex w-[320px] touch-none select-none items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 shadow-2xl"
      style={
        pos
          ? { left: pos.x, top: pos.y }
          : { right: '1.25rem', bottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }
      }
    >
      <button type="button" className="cursor-grab active:cursor-grabbing">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-14 w-14 overflow-hidden rounded-xl bg-black object-cover"
          />
        ) : (
          <Avatar className="h-14 w-14">
            <AvatarImage src={peerProfile?.avatar_url ?? undefined} alt={peerProfile?.display_name ?? 'Remote'} />
            <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">{initials}</AvatarFallback>
          </Avatar>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{peerProfile?.display_name ?? 'Call'}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              phase === 'reconnecting' ? 'bg-[hsl(48_96%_53%)]' : 'bg-[hsl(var(--primary))]'
            )}
          />
          {phase === 'connected' ? duration : phase === 'reconnecting' ? 'Reconnecting…' : phase === 'ringing' ? 'Ringing…' : 'Connecting…'}
        </p>
      </div>
      <div className="flex items-center gap-1">{ends}</div>
    </div>
  );
}