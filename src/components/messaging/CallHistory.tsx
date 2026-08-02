import { useCallHistory, CallHistoryItem } from '@/hooks/useCallHistory';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Phone, 
  Video, 
  PhoneIncoming, 
  PhoneOutgoing, 
  PhoneMissed,
  Clock,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface CallHistoryProps {
  onClose?: () => void;
}

export default function CallHistory({ onClose }: CallHistoryProps) {
  const { calls, loading, deleteCall } = useCallHistory();
  const navigate = useNavigate();

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const formatCallTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    }
    if (isYesterday(date)) {
      return `Yesterday ${format(date, 'HH:mm')}`;
    }
    return format(date, 'MMM d, HH:mm');
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getCallIcon = (call: CallHistoryItem) => {
    const isMissed = call.status === 'missed' || call.status === 'declined';
    
    if (isMissed) {
      return <PhoneMissed className="h-4 w-4 text-destructive" />;
    }
    
    if (call.direction === 'incoming') {
      return <PhoneIncoming className="h-4 w-4 text-online" />;
    }
    
    return <PhoneOutgoing className="h-4 w-4 text-primary" />;
  };

  const getCallStatus = (call: CallHistoryItem) => {
    switch (call.status) {
      case 'missed':
        return 'Missed';
      case 'declined':
        return call.direction === 'incoming' ? 'Declined' : 'No answer';
      case 'ended':
        return formatDuration(call.duration) || 'Completed';
      case 'accepted':
        return 'In progress';
      case 'ringing':
        return 'Ringing...';
      default:
        return call.status;
    }
  };

  const handleCallClick = (call: CallHistoryItem) => {
    navigate(`/messages?conv=${call.conversation_id}`);
    onClose?.();
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Phone className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">No call history</h3>
        <p className="text-sm text-muted-foreground">
          Your recent calls will appear here
        </p>
      </div>
    );
  }

  // Group calls by date
  const groupedCalls: { date: string; calls: CallHistoryItem[] }[] = [];
  calls.forEach((call) => {
    const date = new Date(call.created_at);
    let dateLabel: string;
    
    if (isToday(date)) {
      dateLabel = 'Today';
    } else if (isYesterday(date)) {
      dateLabel = 'Yesterday';
    } else {
      dateLabel = format(date, 'MMMM d, yyyy');
    }

    const lastGroup = groupedCalls[groupedCalls.length - 1];
    if (lastGroup?.date === dateLabel) {
      lastGroup.calls.push(call);
    } else {
      groupedCalls.push({ date: dateLabel, calls: [call] });
    }
  });

  return (
    <ScrollArea className="h-[400px]">
      <div className="p-2">
        {groupedCalls.map((group) => (
          <div key={group.date}>
            <div className="px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {group.date}
              </span>
            </div>
            
            {group.calls.map((call) => (
              <div
                key={call.id}
                className="group flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleCallClick(call)}
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={call.otherUser?.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/80 to-accent/80 text-white">
                      {getInitials(call.otherUser?.display_name || 'User')}
                    </AvatarFallback>
                  </Avatar>
                  {/* Call type badge */}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border-2 border-background flex items-center justify-center">
                    {call.call_type === 'video' ? (
                      <Video className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Phone className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Call info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {call.otherUser?.display_name || 'Unknown'}
                    </span>
                    {call.direction === 'incoming' ? (
                      <ArrowDownLeft className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {getCallIcon(call)}
                    <span className={cn(
                      call.status === 'missed' || call.status === 'declined' 
                        ? 'text-destructive' 
                        : ''
                    )}>
                      {getCallStatus(call)}
                    </span>
                  </div>
                </div>

                {/* Time & actions */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatCallTime(call.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCall(call.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
