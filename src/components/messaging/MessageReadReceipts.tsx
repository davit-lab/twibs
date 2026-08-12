import { useEffect } from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MessageReader } from '@/hooks/useMessageReads';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface MessageReadReceiptsProps {
  messageId: string;
  isOwn: boolean;
  isRead: boolean;
  readers: MessageReader[];
  totalOthers: number;
  onFetch: (messageId: string | string[]) => void;
  className?: string;
}

export default function MessageReadReceipts({
  messageId,
  isOwn,
  isRead,
  readers,
  totalOthers,
  onFetch,
  className,
}: MessageReadReceiptsProps) {
  useEffect(() => {
    if (isOwn && isRead) {
      onFetch(messageId);
    }
  }, [isOwn, isRead, messageId, onFetch]);

  if (!isOwn) return null;

  const readCount = readers.filter(r => r.user_id).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          className={cn('inline-flex items-center cursor-default', className)}
          onMouseEnter={() => onFetch(messageId)}
        >
          {isRead ? (
            <CheckCheck className={cn('h-3.5 w-3.5', isOwn ? 'text-sky-300' : 'text-muted-foreground')} />
          ) : (
            <Check className="h-3.5 w-3.5 text-white/70" />
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align={isOwn ? 'end' : 'start'} className="w-60 p-0">
        <div className="p-3">
          {!isRead ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Not read yet
            </div>
          ) : readers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Read</p>
          ) : (
            <>
              <p className="text-xs font-semibold mb-2">
                Read by {readCount} of {totalOthers}
              </p>
              <div className="space-y-2">
                {readers.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7 rounded-full">
                      <AvatarImage src={r.avatar_url || undefined} />
                      <AvatarFallback className="rounded-full text-[10px]">
                        {r.display_name?.slice(0, 2).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.display_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(r.read_at), 'MMM d, HH:mm')}
                      </p>
                    </div>
                    <CheckCheck className="h-3.5 w-3.5 text-sky-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
