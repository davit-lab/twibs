import { useState, useEffect } from 'react';
import { CalendarClock, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  initialContent?: string;
  replyToMessageId?: string | null;
  attachments?: {
    type: 'image' | 'audio' | 'file';
    url: string;
    name?: string | null;
    size?: number | null;
    mime_type?: string | null;
    duration?: number | null;
  }[];
  onScheduled: () => void;
}

export default function ScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
  initialContent = '',
  replyToMessageId = null,
  attachments = [],
  onScheduled,
}: ScheduleMessageDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState(initialContent);
  const [sendAt, setSendAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setContent(initialContent);
  }, [open, initialContent]);

  const handleSchedule = async () => {
    if (!user || !sendAt) return;
    if (!content.trim() && attachments.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to schedule', description: 'Add a message or attachment.' });
      return;
    }

    const parsed = new Date(sendAt);
    if (isNaN(parsed.getTime())) {
      toast({ variant: 'destructive', title: 'Invalid date', description: 'Pick a valid date and time.' });
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      toast({ variant: 'destructive', title: 'Date is in the past', description: 'Pick a future time.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('scheduled_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
        reply_to_message_id: replyToMessageId,
        attachments: attachments.length > 0 ? attachments.map(a => ({
          type: a.type,
          url: a.url,
          name: a.name ?? null,
          size: a.size ?? null,
          mime_type: a.mime_type ?? null,
          duration: a.duration ?? null,
        })) : null,
        send_at: parsed.toISOString(),
      });

      if (error) throw error;

      toast({
        title: 'Scheduled',
        description: `Message scheduled for ${parsed.toLocaleString()}.`,
      });
      onOpenChange(false);
      onScheduled();
    } catch (error) {
      console.error('Error scheduling message:', error);
      toast({
        variant: 'destructive',
        title: 'Could not schedule',
        description: error instanceof Error ? error.message : 'Something went wrong.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setContent(''); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Message</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Type a message…"
              className="mt-1.5 w-full rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {attachments.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {attachments.length} attachment{attachments.length > 1 ? 's' : ''} will be sent with this message
            </p>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Send at</Label>
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              className="mt-1.5 w-full h-10 rounded-xl bg-muted/50 border border-border/60 px-3 text-sm outline-none focus:border-primary/50"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSchedule} disabled={saving || !sendAt}>
              <CalendarClock className="h-4 w-4 mr-1.5" />
              {saving ? 'Scheduling…' : 'Schedule'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
