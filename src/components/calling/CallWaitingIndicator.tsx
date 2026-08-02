import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Video, Users } from 'lucide-react';
import { QueuedCall } from '@/hooks/useIncomingCalls';
import { cn } from '@/lib/utils';

interface CallWaitingIndicatorProps {
  queuedCalls: QueuedCall[];
  onAnswer: (sessionId: string) => void;
  onDecline: (sessionId: string) => void;
}

export default function CallWaitingIndicator({
  queuedCalls,
  onAnswer,
  onDecline,
}: CallWaitingIndicatorProps) {
  if (queuedCalls.length === 0) return null;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <div className="fixed top-4 right-4 z-[101] flex flex-col gap-2 max-w-sm">
      {queuedCalls.map((call, index) => (
        <div
          key={call.session.id}
          className={cn(
            "bg-card/95  border border-border rounded-xl  p-3",
            "animate-in slide-in-from-right duration-300",
            "flex items-center gap-3"
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {/* Caller avatar */}
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-primary/50">
              <AvatarImage src={call.callerProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white">
                {getInitials(call.callerProfile?.display_name || 'User')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center animate-pulse">
              <Users className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Call info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {call.session.call_type === 'video' ? (
                <Video className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Phone className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Call waiting
              </span>
            </div>
            <p className="font-medium text-sm truncate">
              {call.callerProfile?.display_name || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              @{call.callerProfile?.username || 'user'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white shadow-sm"
              onClick={() => onDecline(call.session.id)}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-emerald-500 hover: text-white shadow-sm animate-pulse"
              onClick={() => onAnswer(call.session.id)}
            >
              {call.session.call_type === 'video' ? (
                <Video className="h-4 w-4" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
