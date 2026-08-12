import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ScheduledMessage {
  id: string;
  content: string | null;
  send_at: string;
  status: string;
  attachments: Array<{
    type: string;
    url: string;
    name: string | null;
    size: number | null;
    mime_type: string | null;
    duration: number | null;
  }> | null;
}

interface ScheduledMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export default function ScheduledMessagesDialog({
  open,
  onOpenChange,
  conversationId,
}: ScheduledMessagesDialogProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('id, content, send_at, status, attachments')
        .eq('conversation_id', conversationId)
        .eq('sender_id', user.id)
        .eq('status', 'pending')
        .order('send_at', { ascending: true });

      if (error) throw error;
      setItems((data || []) as ScheduledMessage[]);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await supabase.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error cancelling scheduled message:', error);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Scheduled messages
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No scheduled messages</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.send_at).toLocaleString()}
                  </p>
                  <p className="text-sm mt-0.5 break-words line-clamp-2">
                    {item.content || (item.attachments?.length ? `📎 ${item.attachments.length} attachment(s)` : '')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full text-destructive hover:text-destructive flex-shrink-0"
                  onClick={() => handleCancel(item.id)}
                  disabled={cancellingId === item.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
