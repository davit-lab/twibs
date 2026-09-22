import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  SwitchCamera,
  MessageSquare,
  X,
  Settings,
  ChevronDown,
  Maximize2,
  Volume2,
  VolumeX,
  Signal,
  Send,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMessages } from '@/hooks/useMessages';
import { useAuth } from '@/contexts/AuthContext';
import { CallEndReason, CallQuality } from '@/lib/callTypes';
import { END_SCREEN_AUTO_CLOSE_MS } from '@/lib/callConstants';
import { cn } from '@/lib/utils';
import { useCall } from './callContext';

const REACTIONS = ['❤️', '😂', '👍', '👏', '😮'];

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatEndReason(reason: CallEndReason | null): string {
  switch (reason) {
    case 'cancelled':
      return 'Call cancelled';
    case 'busy':
      return 'Line busy';
    case 'declined':
      return 'Call declined';
    case 'missed':
      return 'No answer';
    case 'failed':
      return 'Call failed';
    case 'ended':
      return 'Call ended';
    default:
      return 'Call ended';
  }
}

function connectionLabel(quality: CallQuality | null, state: string | null): string {
  if (state === 'reconnecting') return 'Reconnecting';
  if (quality?.level === 'excellent') return 'Excellent';
  if (quality?.level === 'good') return 'Good';
  if (quality?.level === 'weak') return 'Weak';
  return 'Connecting…';
}

export function CallScreen() {
  const call = useCall();
  const { user } = useAuth();
  const {
    phase,
    session,
    peerProfile,
    localStream,
    remoteStream,
    screenStream,
    quality,
    connectionState,
    isMuted,
    isVideoOff,
    isScreenSharing,
    mediaError,
    isOutgoingRinging,
    minimized,
    reactions,
  } = call;

  const [elapsed, setElapsed] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const isVideoCall = session?.call_type === 'video' || !!localStream?.getVideoTracks().length;
  const isConnected = phase === 'connected';
  const isReconnecting = phase === 'reconnecting';

  // Call timer
  useEffect(() => {
    if (phase !== 'connected') {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Attach local/remote streams
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Auto-close the end screen so it never blocks navigation forever.
  useEffect(() => {
    if (phase !== 'ended') return;
    const t = window.setTimeout(() => call.dismissEndScreen(), END_SCREEN_AUTO_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [phase, call.dismissEndScreen]);

  const toggleSpeaker = useCallback(() => {
    const el: HTMLMediaElement | null =
      (remoteVideoRef.current as HTMLMediaElement | null) ?? remoteAudioRef.current;
    if (!el || typeof el.setSinkId !== 'function') {
      setSpeakerOn((v) => !v);
      return;
    }
    const next = !speakerOn;
    const out = call.devices.audioOutputs[0]?.deviceId;
    el.setSinkId(next && out ? out : '').catch(() => {});
    setSpeakerOn(next);
  }, [speakerOn, call.devices.audioOutputs]);

  const initials =
    peerProfile?.display_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const bg = (
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_0%,hsl(var(--primary)/0.12),transparent_60%)]" />
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* ---------- top bar ---------- */}
      <div className="relative z-20 flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{peerProfile?.display_name ?? 'Call'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            {isConnected ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--primary))]" />
                {formatDuration(elapsed)}
              </>
            ) : isReconnecting ? (
              'Reconnecting…'
            ) : isOutgoingRinging ? (
              'Ringing…'
            ) : (
              'Connecting…'
            )}
            <span className="text-[hsl(var(--muted-foreground)/0.7)]">•</span>
            <span className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              {connectionLabel(quality, connectionState)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected && isVideoCall && !isScreenSharing ? (
            <button
              type="button"
              aria-label="Picture in picture"
              onClick={() => {
                const el = remoteVideoRef.current;
                if (el && typeof el.requestPictureInPicture === 'function') {
                  el.requestPictureInPicture().catch(() => {});
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Minimize call"
            onClick={call.minimize}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {bg}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end">
        {phase === 'ended' ? <EndScreen /> : isVideoCall && (isConnected || isReconnecting) ? (
          <VideoStage />
        ) : (
          <VoiceStage />
        )}
        <ControlsBar
          isVideoCall={isVideoCall}
          openChat={() => {
            setSettingsOpen(false);
            setChatOpen((v) => !v);
          }}
          openSettings={() => {
            setChatOpen(false);
            setSettingsOpen((v) => !v);
          }}
        />
      </div>

      {/* Reactions floating above everything in the stage */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="call-reaction-float absolute bottom-36 text-4xl"
            style={{ left: `${(r.id * 13) % 80 + 10}%`, animationDelay: '0s' }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* ---------- chat overlay ---------- */}
      {chatOpen && session ? <CallChat conversationId={session.conversation_id} onClose={() => setChatOpen(false)} /> : null}

      {/* ---------- settings overlay ---------- */}
      {settingsOpen && isConnected ? <CallSettingsPanel onClose={() => setSettingsOpen(false)} /> : null}

      {/* ---------- media error banner ---------- */}
      {mediaError && phase !== 'ended' ? (
        <div className="absolute inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 shadow-xl">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Unable to access {mediaError.audio && mediaError.video ? 'camera and microphone' : mediaError.video ? 'camera' : 'microphone'}</p>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{mediaError.message}</p>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => call.retryLastCall()}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void call.endOrCancel()}>
              End
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------- reconnecting banner ---------- */}
      {isReconnecting ? (
        <div className="absolute inset-x-0 top-0 z-40 flex justify-center pt-6">
          <p className="rounded-full bg-[hsl(var(--muted)/0.9)] px-4 py-1.5 text-xs font-medium tracking-wide">
            Connection lost — reconnecting…
          </p>
        </div>
      ) : null}
    </div>
  );

  function VideoStage() {
    const showRemote = !!remoteStream && remoteStream.getVideoTracks().length > 0;
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
        {screenStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full rounded-2xl object-contain"
          />
        ) : showRemote ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full rounded-2xl bg-black object-contain sm:object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="h-28 w-28 animate-pulse overflow-hidden rounded-full border border-[hsl(var(--border))]">
              <Avatar className="h-full w-full">
                <AvatarImage src={peerProfile?.avatar_url ?? undefined} alt={peerProfile?.display_name ?? 'Remote'} />
                <AvatarFallback className="bg-[hsl(var(--muted))] text-2xl text-[hsl(var(--foreground))]">{initials}</AvatarFallback>
              </Avatar>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {isReconnecting ? 'Trying to reconnect…' : `Waiting for ${peerProfile?.display_name ?? 'them'}…`}
            </p>
          </div>
        )}
        {localStream ? (
          <div className="absolute right-4 top-4 h-36 w-24 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-black shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn('h-full w-full object-cover', isVideoCall && !isScreenSharing && 'scale-x-[-1]')}
            />
            {isVideoOff ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[hsl(var(--muted))]">
                <UserRound className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
              </div>
            ) : null}
          </div>
        ) : null}

        {screenStream ? (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
            <Monitor className="h-3.5 w-3.5" />
            Presenting screen
          </div>
        ) : null}
      </div>
    );
  }

  function VoiceStage() {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-4">
        <div className="relative">
          {isConnected ? (
            <span className="absolute -inset-3 rounded-full bg-[hsl(var(--primary)/0.2)] blur-xl" />
          ) : null}
          <div
            className={cn(
              'relative h-32 w-32 overflow-hidden rounded-full border border-[hsl(var(--border))]',
              isConnected && 'shadow-[0_0_48px_hsl(var(--primary)/0.35)]'
            )}
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={peerProfile?.avatar_url ?? undefined} alt={peerProfile?.display_name ?? 'Remote'} />
              <AvatarFallback className="bg-[hsl(var(--muted))] text-3xl text-[hsl(var(--foreground))]">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold">{peerProfile?.display_name ?? 'Call'}</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isConnected ? formatDuration(elapsed) : isOutgoingRinging ? 'Ringing…' : 'Connecting…'}
          </p>
        </div>
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    );
  }

  function EndScreen() {
    const reason = call.endReason;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-4 text-center">
        <div className="h-24 w-24 overflow-hidden rounded-full border border-[hsl(var(--border))]">
          <Avatar className="h-full w-full">
            <AvatarImage src={peerProfile?.avatar_url ?? undefined} alt={peerProfile?.display_name ?? 'Remote'} />
            <AvatarFallback className="bg-[hsl(var(--muted))] text-2xl text-[hsl(var(--foreground))]">{initials}</AvatarFallback>
          </Avatar>
        </div>
        <div>
          <h2 className="text-xl font-semibold">{formatEndReason(reason)}</h2>
          {reason === 'busy' ? (
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {peerProfile?.display_name ?? 'The person'} is on another call right now.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button className="gap-2 rounded-full" onClick={() => void call.retryLastCall()}>
            <Phone className="h-4 w-4" />
            Call again
          </Button>
          <Button variant="outline" className="gap-2 rounded-full" onClick={call.navigateToConversation}>
            <MessageSquare className="h-4 w-4" />
            Send message
          </Button>
          <Button variant="ghost" className="gap-2 rounded-full" onClick={call.dismissEndScreen}>
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
      </div>
    );
  }

  function ControlsBar({
    isVideoCall: videoMode,
    openChat,
    openSettings,
  }: {
    isVideoCall: boolean;
    openChat: () => void;
    openSettings: () => void;
  }) {
    if (phase === 'ended') return null;
    if (phase === 'dialing' || phase === 'ringing') {
      return (
        <div className="flex items-center justify-center gap-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <CircleButton danger onClick={() => void call.cancelCall()} label="Cancel call">
            <PhoneOff className="h-6 w-6 -scale-x-100" />
          </CircleButton>
        </div>
      );
    }

    const primaryOn = (isConnected || isReconnecting) && !minimized;
    return (
      <div className="flex flex-col items-center gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {(isConnected || isReconnecting) ? (
          <>
            <div className="flex items-center gap-5">
              {videoMode ? (
                <SquareButton active={!isVideoOff} onClick={() => void call.toggleVideo()} label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </SquareButton>
              ) : (
                <SquareButton onClick={() => void call.toggleVideo()} label="Turn on video">
                  <Video className="h-5 w-5" />
                </SquareButton>
              )}
              <SquareButton active={!isMuted} onClick={() => void call.toggleMute()} label={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </SquareButton>
              <SquareButton active={speakerOn} onClick={toggleSpeaker} label={speakerOn ? 'Speaker off' : 'Speaker on'}>
                {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </SquareButton>
            </div>
            <div className="flex items-center gap-5">
              <SquareButton onClick={openChat} label="Chat">
                <MessageSquare className="h-5 w-5" />
              </SquareButton>
              <SquareButton onClick={openSettings} label="Settings">
                <Settings className="h-5 w-5" />
              </SquareButton>
              {videoMode ? (
                <SquareButton onClick={() => void call.switchCamera()} label="Switch camera">
                  <SwitchCamera className="h-5 w-5" />
                </SquareButton>
              ) : null}
              <SquareButton active={isScreenSharing} disabled={!isConnected} onClick={() => void call.toggleScreenShare()} label={isScreenSharing ? 'Stop presenting' : 'Present screen'}>
                {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              </SquareButton>
            </div>
          </>
        ) : null}

        <div className="flex">
          {primaryOn ? (
            <button
              type="button"
              onClick={() => void call.endCall()}
              aria-label="End call"
              className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[hsl(0_72%_51%)] text-white shadow-lg shadow-[hsl(0_72%_51%/0.35)] transition-transform active:scale-95"
            >
              <PhoneOff className="h-7 w-7 -scale-x-100" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}

function CircleButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95',
        danger ? 'bg-[hsl(0_72%_51%)] shadow-[hsl(0_72%_51%/0.35)]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
      )}
    >
      {children}
    </button>
  );
}

function SquareButton({
  children,
  onClick,
  label,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50',
        active === false
          ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]'
          : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.7)]',
        disabled && 'cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

function CallChat({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { messages, sendMessage } = useMessages(conversationId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    void sendMessage(text).catch(() => {});
    setDraft('');
  }, [draft, sendMessage]);

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold">Call chat</p>
        <button type="button" aria-label="Close chat" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3">
        <div ref={scrollRef} className="flex min-h-full flex-col gap-2 py-2">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              Say hi before the call ends 👋
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn('flex', m.sender_id === user?.id ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    m.sender_id === user?.id
                      ? 'rounded-br-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'rounded-bl-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
                  )}
                >
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="flex items-center gap-2 border-t border-[hsl(var(--border))] px-3 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Send a message…"
          className="flex-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-4 py-2 text-sm outline-none focus:border-[hsl(var(--primary))]"
        />
        <button type="button" aria-label="Send message" onClick={submit} className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CallSettingsPanel({ onClose }: { onClose: () => void }) {
  const call = useCall();
  const { devices, settings, updateSettings, setAudioInput, setVideoInput, setAudioOutput } = call;

  const Select = ({ label, value, options, onChange }: {
    label: string;
    value: string | null;
    options: { deviceId: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-sm outline-none focus:border-[hsl(var(--primary))]"
      >
        <option value="" disabled>
          Default
        </option>
        {options.map((o) => (
          <option key={o.deviceId} value={o.deviceId}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl px-1 py-2"
    >
      <span className="text-sm">{label}</span>
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', value ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', value ? 'left-[1.375rem]' : 'left-0.5')} />
      </span>
    </button>
  );

  return (
    <div className="absolute inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-semibold">Call settings</p>
        <button type="button" aria-label="Close settings" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-4">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Devices</p>
            <Select label="Microphone" value={settings.audioInputDeviceId} options={devices.audioInputs} onChange={(v) => void setAudioInput(v)} />
            <Select label="Speaker" value={settings.audioOutputDeviceId} options={devices.audioOutputs} onChange={(v) => setAudioOutput(v)} />
            {settings.videoInputDeviceId || devices.videoInputs.length > 0 ? (
              <Select label="Camera" value={settings.videoInputDeviceId} options={devices.videoInputs} onChange={(v) => void setVideoInput(v)} />
            ) : null}
          </div>
          <div className="flex flex-col divide-y divide-[hsl(var(--border))]">
            <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Quality</p>
            <Toggle label="HD video" value={settings.hdVideo} onChange={(v) => void updateSettings({ hdVideo: v })} />
          </div>
          <div className="flex flex-col divide-y divide-[hsl(var(--border))]">
            <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Audio processing</p>
            <Toggle label="Noise suppression" value={settings.noiseSuppression} onChange={(v) => void updateSettings({ noiseSuppression: v })} />
            <Toggle label="Echo cancellation" value={settings.echoCancellation} onChange={(v) => void updateSettings({ echoCancellation: v })} />
            <Toggle label="Auto gain control" value={settings.autoGainControl} onChange={(v) => void updateSettings({ autoGainControl: v })} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}