import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Volume2, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { callAudio } from '@/lib/callAudio';
import { RING_TIMEOUT_MS } from '@/lib/callConstants';
import { CallSession } from '@/lib/callTypes';
import { useCall } from './callContext';

interface IncomingCallOverlayProps {
  onAnswer: (session: CallSession) => void;
  onDecline: (session: CallSession) => void;
  onMiss: (session: CallSession) => void;
}

export function IncomingCallOverlay({ onAnswer, onDecline, onMiss }: IncomingCallOverlayProps) {
  const { incomingCall, incomingCaller } = useCall();
  const [secondsLeft, setSecondsLeft] = useState(RING_TIMEOUT_MS / 1000);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [ringStarted, setRingStarted] = useState(false);

  useEffect(() => {
    setSecondsLeft(RING_TIMEOUT_MS / 1000);
    setNeedsUnlock(callAudio.isBlocked());
    setRingStarted(false);
  }, [incomingCall?.id]);

  // Incoming ringtone, with autoplay fallback.
  const startRing = useCallback(() => {
    if (!incomingCall) return;
    callAudio.startIncomingRingtone(incomingCall.id);
    setRingStarted(true);
    setNeedsUnlock(false);
  }, [incomingCall]);

  useEffect(() => {
    if (!incomingCall) return;
    if (callAudio.isBlocked()) {
      setNeedsUnlock(true);
      return;
    }
    startRing();
  }, [incomingCall, startRing]);

  useEffect(() => {
    if (!incomingCall) return;
    return () => {
      callAudio.stopIncomingRingtone(incomingCall.id);
    };
  }, [incomingCall?.id, incomingCall]);

  // Watchdog: if the caller never cancels, the call goes to missed.
  useEffect(() => {
    if (!incomingCall) return;
    const total = RING_TIMEOUT_MS;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, Math.round((total - elapsed) / 1000));
      setSecondsLeft(left);
      if (elapsed >= total) {
        window.clearInterval(timer);
        callAudio.stopIncomingRingtone(incomingCall.id);
        setRingStarted(false);
        onMiss(incomingCall);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [incomingCall?.id, incomingCall, onMiss]);

  if (!incomingCall) return null;

  const initials =
    incomingCaller?.display_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) ||
    'U';

  const isVideo = incomingCall.call_type === 'video';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[hsl(var(--background))] px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="text-center">
          <div className="mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full border border-[hsl(var(--border))] shadow-[0_0_36px_hsl(var(--primary)/0.25)]">
            <Avatar className="h-full w-full">
              <AvatarImage src={incomingCaller?.avatar_url ?? undefined} alt={incomingCaller?.display_name ?? 'Caller'} />
              <AvatarFallback className="text-2xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {incomingCaller?.display_name ?? 'Incoming call'}
          </h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
            {isVideo ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            {isVideo ? 'Incoming video call' : 'Incoming audio call'}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onDecline(incomingCall)}
            aria-label="Decline call"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(0_72%_51%)] text-white shadow-lg transition-transform active:scale-95"
          >
            <PhoneOff className="h-6 w-6 -scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => onAnswer(incomingCall)}
            aria-label="Accept call"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(142_71%_45%)] text-white shadow-lg transition-transform active:scale-95"
          >
            <Phone className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          {needsUnlock ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full"
              onClick={() => {
                callAudio.ensureUnlocked();
                setRingStarted(true);
                setNeedsUnlock(false);
              }}
            >
              <Volume2 className="h-4 w-4" />
              Tap for sound
            </Button>
          ) : ringStarted ? (
            <p className="text-xs tracking-wide text-[hsl(var(--muted-foreground))]">
              Ringing… {secondsLeft}s
            </p>
          ) : null}
          <div className="h-1 w-40 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-1000 ease-linear"
              style={{ width: `${(secondsLeft / (RING_TIMEOUT_MS / 1000)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}