import { useEffect, useRef, useState, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { CallSession } from '@/hooks/useWebRTC';
import { createRingtone } from '@/lib/ringtone';

interface IncomingCallModalProps {
  session: CallSession;
  callerProfile: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  onAnswer: () => void;
  onDecline: () => void;
}

export default function IncomingCallModal({
  session,
  callerProfile,
  onAnswer,
  onDecline,
}: IncomingCallModalProps) {
  const [ringDuration, setRingDuration] = useState(0);
  const ringtoneRef = useRef<ReturnType<typeof createRingtone> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoDeclinedRef = useRef(false);

  // Start ringtone on mount
  useEffect(() => {
    console.log('[IncomingCall] Modal mounted, starting ringtone');
    
    // Create and start ringtone
    ringtoneRef.current = createRingtone();
    ringtoneRef.current.start();

    // Auto-decline timer (30 seconds)
    timerRef.current = setInterval(() => {
      setRingDuration(prev => {
        const newDuration = prev + 1;
        if (newDuration >= 30 && !hasAutoDeclinedRef.current) {
          hasAutoDeclinedRef.current = true;
          console.log('[IncomingCall] Auto-declining after 30s');
          onDecline();
        }
        return newDuration;
      });
    }, 1000);

    return () => {
      console.log('[IncomingCall] Modal unmounting, stopping ringtone');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (ringtoneRef.current) {
        ringtoneRef.current.stop();
        ringtoneRef.current = null;
      }
    };
  }, [onDecline]);

  const handleAnswer = useCallback(() => {
    console.log('[IncomingCall] Answer clicked');
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    onAnswer();
  }, [onAnswer]);

  const handleDecline = useCallback(() => {
    console.log('[IncomingCall] Decline clicked');
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    onDecline();
  }, [onDecline]);

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center p-8">
        {/* Caller avatar with ringing animation */}
        <div className="relative mb-8">
          {/* Pulsing rings */}
          <div className="absolute -inset-6 rounded-full border-2 border-primary/20" />
          <div className="absolute -inset-12 rounded-full border border-primary/10" />
          
          <Avatar className="h-32 w-32 ring-4 ring-primary/30 ring-offset-4 ring-offset-black/50">
            <AvatarImage src={callerProfile?.avatar_url || undefined} />
            <AvatarFallback className="bg-neutral-800 text-white text-4xl">
              {getInitials(callerProfile?.display_name || 'User')}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Call type indicator */}
        <div className="flex items-center gap-2 mb-2">
          {session.call_type === 'video' ? (
            <Video className="h-5 w-5 text-primary" />
          ) : (
            <Phone className="h-5 w-5 text-primary" />
          )}
          <span className="text-sm text-white/60 uppercase tracking-wider font-medium">
            Incoming {session.call_type} call
          </span>
        </div>

        {/* Caller name */}
        <h2 className="text-3xl font-bold text-white mb-2">
          {callerProfile?.display_name || 'Unknown'}
        </h2>
        <p className="text-white/50 mb-2">@{callerProfile?.username || 'user'}</p>
        
        {/* Ring timer */}
        <p className="text-xs text-white/30 mb-8">
          {ringDuration > 0 && `Ringing for ${ringDuration}s...`}
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-8">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleDecline}
              className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
            <span className="text-sm text-white/60">Decline</span>
          </div>

          {/* Answer */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAnswer}
              className="h-16 w-16 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {session.call_type === 'video' ? (
                <Video className="h-7 w-7 text-white" />
              ) : (
                <Phone className="h-7 w-7 text-white" />
              )}
            </button>
            <span className="text-sm text-white/60">Answer</span>
          </div>
        </div>
      </div>
    </div>
  );
}