import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Play, PauseCircle } from 'lucide-react';
import { HeldCall } from '@/hooks/useIncomingCalls';
import { cn } from '@/lib/utils';

interface HeldCallsIndicatorProps {
  heldCalls: HeldCall[];
  onResume: (sessionId: string) => void;
  onEnd: (sessionId: string) => void;
}

export default function HeldCallsIndicator({
  heldCalls,
  onResume,
  onEnd,
}: HeldCallsIndicatorProps) {
  if (heldCalls.length === 0) return null;

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  return (
    <div className="fixed bottom-20 left-4 z-[99] flex flex-col gap-2 max-w-xs">
      {heldCalls.map((call, index) => (
        <div
          key={call.session.id}
          className={cn(
            "bg-card/95  border border-amber-500/30 rounded-xl  p-3",
            "animate-in slide-in-from-left duration-300",
            "flex items-center gap-3"
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {/* Caller avatar */}
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-amber-500/50">
              <AvatarImage src={call.callerProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                {getInitials(call.callerProfile?.display_name || 'User')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
              <PauseCircle className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Call info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-amber-500 uppercase tracking-wide font-medium">
                On Hold
              </span>
            </div>
            <p className="font-medium text-sm truncate">
              {call.callerProfile?.display_name || 'Unknown'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white shadow-sm"
              onClick={() => onEnd(call.session.id)}
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-white shadow-sm"
              onClick={() => onResume(call.session.id)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
