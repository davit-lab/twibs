import { Phone, PhoneOff, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PeerProfile } from '@/lib/callTypes';
import { useCall } from './callContext';

export function CallWaitingCard() {
  const { callQueue, declineQueuedCall, incomingCaller, endOrCancel, answerCall, restore } = useCall();

  const queued = callQueue[0];
  if (!queued) return null;

  const profile: PeerProfile = queued.callerProfile
    ? { ...queued.callerProfile, user_id: queued.session.caller_id }
    : {
        user_id: queued.session.caller_id,
        display_name: 'Unknown user',
        username: 'unknown',
        avatar_url: null,
      };

  const initials =
    queued.callerProfile?.display_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) ||
    'U';

  const accept = () => {
    endOrCancel();
    void answerCall(queued.session, profile);
    restore();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[68] flex justify-center p-4 sm:bottom-6">
      <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={queued.callerProfile?.avatar_url ?? undefined} alt={queued.callerProfile?.display_name ?? 'Caller'} />
            <AvatarFallback className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{queued.callerProfile?.display_name ?? 'Unknown user'}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {queued.session.call_type === 'video' ? 'Video' : 'Audio'} call waiting…
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 rounded-full text-[hsl(0_72%_51%)]"
            onClick={() => void declineQueuedCall(queued.session.id)}
          >
            <X className="h-4 w-4" />
            Decline
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 rounded-full"
            onClick={accept}
          >
            <Phone className="h-4 w-4" />
            End current &amp; accept
          </Button>
        </div>

        {incomingCaller ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <PhoneOff className="h-3.5 w-3.5" />
            In a call with {incomingCaller.display_name}
          </p>
        ) : null}
      </div>
    </div>
  );
}