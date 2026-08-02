import { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Volume2,
  VolumeX,
  Maximize2,
  MoreVertical,
  X,
  Monitor,
  MonitorOff,
  RefreshCw,
  AlertTriangle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallState } from '@/hooks/useWebRTC';

interface CallOverlayProps {
  type: 'audio' | 'video';
  user: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
  callState: CallState;
  onEnd: () => void;
  onToggleAudio: () => boolean;
  onToggleVideo: () => boolean;
  onToggleScreenShare: () => Promise<boolean>;
  onRetry?: () => void;
}

export default function CallOverlay({ 
  type, 
  user, 
  callState,
  onEnd, 
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onRetry,
}: CallOverlayProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Connection state formatting
  const getConnectionStateLabel = (state: RTCPeerConnectionState | null): string => {
    if (!state) return 'Not started';
    const labels: Record<string, string> = {
      new: 'Initializing',
      connecting: 'Connecting',
      connected: 'Connected',
      disconnected: 'Disconnected',
      failed: 'Failed',
      closed: 'Closed',
    };
    return labels[state] || state;
  };

  const getIceStateLabel = (state: RTCIceConnectionState | null): string => {
    if (!state) return 'Not started';
    const labels: Record<string, string> = {
      new: 'Gathering',
      checking: 'Checking',
      connected: 'Connected',
      completed: 'Completed',
      failed: 'Failed',
      disconnected: 'Disconnected',
      closed: 'Closed',
    };
    return labels[state] || state;
  };

  const getStateColor = (state: string | null): string => {
    if (!state) return 'text-muted-foreground';
    if (state === 'connected' || state === 'completed') return 'text-green-400';
    if (state === 'failed' || state === 'disconnected') return 'text-destructive';
    if (state === 'connecting' || state === 'checking') return 'text-yellow-400';
    return 'text-muted-foreground';
  };

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState.localStream]);

  // Attach screen stream to video element
  useEffect(() => {
    if (screenVideoRef.current && callState.screenStream) {
      screenVideoRef.current.srcObject = callState.screenStream;
    }
  }, [callState.screenStream]);

  // Attach remote stream to video/audio element
  useEffect(() => {
    if (callState.remoteStream) {
      if (type === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = callState.remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = callState.remoteStream;
      }
    }
  }, [callState.remoteStream, type]);

  // Call duration timer
  useEffect(() => {
    if (!callState.isConnected) return;

    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [callState.isConnected]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const handleToggleAudio = () => {
    const muted = onToggleAudio();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const videoOff = onToggleVideo();
    setIsVideoOff(videoOff);
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOff(!isSpeakerOff);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOff;
    }
  };

  const handleToggleScreenShare = async () => {
    await onToggleScreenShare();
  };

  const getCallStatus = () => {
    if (callState.error) return callState.error;
    if (callState.isConnecting) {
      if (callState.session?.status === 'ringing') return 'Ringing...';
      return 'Connecting...';
    }
    if (callState.isConnected) return formatDuration(duration);
    return 'Starting call...';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Hidden audio element for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Background */}
      <div className="absolute inset-0 bg-neutral-950">
      </div>

      {/* Video call UI */}
      {type === 'video' && (
        <>
          {/* Remote video (full screen) */}
          {callState.remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="relative inline-block mb-6">
                  <Avatar className="h-32 w-32 ring-4 ring-primary/30 ring-offset-4 ring-offset-transparent">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-neutral-800 text-white text-4xl">
                      {getInitials(user.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  {callState.isConnecting && (
                    <>
                      <div className="absolute inset-0 rounded-full  border-2 border-primary/50" />
                      <div className="absolute inset-0 rounded-full  border-2 border-primary/30" style={{ animationDelay: '0.5s' }} />
                    </>
                  )}
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">{user.display_name}</h2>
                <p className="text-white/60">{getCallStatus()}</p>
              </div>
            </div>
          )}

          {/* Screen share preview (when sharing) */}
          {callState.isScreenSharing && callState.screenStream && (
            <div className="absolute top-20 left-6 w-64 h-36 rounded-2xl overflow-hidden bg-black/50 border border-white/10 border border-white/10 ">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-primary/80 text-white text-xs font-medium flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                Sharing screen
              </div>
            </div>
          )}

          {/* Local video preview (picture-in-picture) */}
          {callState.localStream && !isVideoOff && !callState.isScreenSharing && (
            <div className="absolute bottom-32 right-6 w-40 h-56 rounded-2xl overflow-hidden bg-black/50 border border-white/10 border border-white/10 ">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 text-white"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Audio call UI */}
      {type === 'audio' && (
        <div className="text-center z-10">
          <div className="relative inline-block mb-8">
            <Avatar className="h-40 w-40 ring-4 ring-primary/30 ring-offset-8 ring-offset-transparent ">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="bg-neutral-800 text-white text-5xl">
                {getInitials(user.display_name)}
              </AvatarFallback>
            </Avatar>
            {callState.isConnecting && (
              <>
                <div className="absolute inset-0 rounded-full  border-2 border-primary/50" />
                <div className="absolute inset-0 rounded-full  border-2 border-primary/30" style={{ animationDelay: '0.5s' }} />
              </>
            )}
            {callState.isConnected && (
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-online rounded-full border-4 border-[#1a0a2e] shadow-[0_0_15px_hsl(160_70%_45%/0.5)]" />
            )}
          </div>
          <h2 className="text-3xl font-semibold text-white mb-2">{user.display_name}</h2>
          <p className="text-white/60 text-lg">{getCallStatus()}</p>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex flex-col gap-3 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {callState.isConnected && (
              <div className="flex items-center gap-3 bg-black/50 border border-white/10 px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-online rounded-full animate-pulse" />
                <span className="text-white font-medium">{formatDuration(duration)}</span>
              </div>
            )}
            {callState.error && (
              <div className="flex items-center gap-3 bg-black/50 border border-white/10 px-4 py-2 rounded-full border border-destructive/50">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-destructive font-medium">{callState.error}</span>
              </div>
            )}
            {/* Diagnostics toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="rounded-full bg-white/10 hover:bg-white/20 text-white text-xs gap-2"
            >
              <Wifi className="h-3 w-3" />
              Diagnostics
              {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onEnd}
            className="rounded-full h-10 w-10 bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Diagnostics panel */}
        {showDiagnostics && (
          <div className="bg-black/50 border border-white/10 px-4 py-3 rounded-xl border border-white/10">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/60">Connection:</span>
                <span className={cn('font-medium', getStateColor(callState.connectionState))}>
                  {getConnectionStateLabel(callState.connectionState)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60">ICE:</span>
                <span className={cn('font-medium', getStateColor(callState.iceState))}>
                  {getIceStateLabel(callState.iceState)}
                </span>
              </div>
              {callState.error && (
                <div className="col-span-2 flex items-center gap-2">
                  <span className="text-white/60">Error:</span>
                  <span className="text-destructive font-medium">{callState.error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Retry button when call fails */}
        {callState.isFailed && onRetry && (
          <div className="flex justify-center">
            <Button
              onClick={onRetry}
              className="bg-primary hover:bg-primary/90 text-white gap-2 rounded-full px-6"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Call
            </Button>
          </div>
        )}
      </div>

      {/* Call controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-black/50 border border-white/10 px-6 py-4 rounded-full flex items-center gap-4">
          {/* Mute */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleAudio}
            className={cn(
              "rounded-full h-14 w-14 transition-all duration-300",
              isMuted 
                ? "bg-white/20 text-white" 
                : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>

          {/* Video toggle (only for video calls) */}
          {type === 'video' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleVideo}
              className={cn(
                "rounded-full h-14 w-14 transition-all duration-300",
                isVideoOff 
                  ? "bg-white/20 text-white" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
            </Button>
          )}

          {/* End call */}
          <Button
            onClick={onEnd}
            className="btn-call-end h-16 w-16"
          >
            <PhoneOff className="h-7 w-7 text-white" />
          </Button>

          {/* Screen share toggle (only for video calls) */}
          {type === 'video' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleScreenShare}
              className={cn(
                "rounded-full h-14 w-14 transition-all duration-300",
                callState.isScreenSharing 
                  ? "bg-primary/30 text-white" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {callState.isScreenSharing ? <MonitorOff className="h-6 w-6" /> : <Monitor className="h-6 w-6" />}
            </Button>
          )}

          {/* Speaker */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleSpeaker}
            className={cn(
              "rounded-full h-14 w-14 transition-all duration-300",
              isSpeakerOff 
                ? "bg-white/20 text-white" 
                : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            {isSpeakerOff ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          </Button>

          {/* More options */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-14 w-14 bg-white/10 text-white hover:bg-white/20"
          >
            <MoreVertical className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
