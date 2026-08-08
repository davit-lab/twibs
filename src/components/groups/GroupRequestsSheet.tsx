import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Check, X, Loader2, Inbox, BadgeCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroupJoinRequests, useGroupActions } from '@/hooks/useGroups';
import { cn } from '@/lib/utils';

interface GroupRequestsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
}

export default function GroupRequestsSheet({ open, onOpenChange, groupId, groupName }: GroupRequestsSheetProps) {
  const { data: requests, isLoading } = useGroupJoinRequests(groupId);
  const { approveJoinRequest, declineJoinRequest } = useGroupActions();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handle = async (requestId: string, approve: boolean) => {
    setProcessingId(requestId);
    try {
      if (approve) await approveJoinRequest.mutateAsync(requestId);
      else await declineJoinRequest.mutateAsync(requestId);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left pr-8">
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Join Requests
            <span className="text-sm font-bold text-muted-foreground">{requests?.length ?? 0}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5">
          {isLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : !requests || requests.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-full bg-surface-2 mx-auto mb-3 flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-bold text-lg mb-1">No pending requests</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                When someone requests to join {groupName}, you'll review it here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {requests.map((request) => (
                <div key={request.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface/70 transition-colors">
                  <Link to={`/profile/${request.profiles?.username}`} className="flex-shrink-0">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={request.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-sm">
                        {request.profiles?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/profile/${request.profiles?.username}`}
                      className="flex items-center gap-1.5 font-semibold hover:underline truncate block"
                    >
                      <span className="truncate">{request.profiles?.display_name}</span>
                      {request.profiles?.is_verified && <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />}
                    </Link>
                    <p className="text-xs text-muted-foreground font-medium">
                      @{request.profiles?.username} ·{' '}
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      size="icon"
                      className={cn(
                        'h-9 w-9 rounded-xl bg-success text-success-foreground hover:bg-success/90',
                        'transition-all hover:scale-105'
                      )}
                      onClick={() => handle(request.id, true)}
                      disabled={processingId === request.id}
                      aria-label="Approve request"
                    >
                      {processingId === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-xl hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                      onClick={() => handle(request.id, false)}
                      disabled={processingId === request.id}
                      aria-label="Decline request"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
