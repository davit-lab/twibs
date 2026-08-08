import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSafetyActions, type ReportTargetType } from '@/hooks/useSafety';
import { cn } from '@/lib/utils';

const REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Hate speech',
  'Misinformation',
  'Nudity or sexual content',
  'Illegal content',
  'Something else',
] as const;

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
}

export default function ReportDialog({ open, onOpenChange, targetType, targetId, targetLabel }: ReportDialogProps) {
  const { reportContent } = useSafetyActions();
  const [reason, setReason] = useState<string>('Spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason('Spam');
    setDetails('');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const ok = await reportContent(targetType, targetId, reason, details.trim() || undefined);
    setSubmitting(false);
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Report {targetLabel}</DialogTitle>
          <DialogDescription>What\u2019s the issue?</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-0.5">
            {REPORT_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-sm text-left transition-colors',
                  reason === option ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option}
                <span
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    reason === option ? 'bg-foreground' : 'border border-muted-foreground/40'
                  )}
                />
              </button>
            ))}
          </div>

          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            placeholder="Anything else we should know? (optional)"
            maxLength={500}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
