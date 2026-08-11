import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Loader2, Trash2, EyeOff, Ban, CheckCircle2, XCircle, Flag } from 'lucide-react';
import { AdminReport } from './types';

export type ReportAction = 'delete' | 'hide' | 'resolve' | 'dismiss' | 'suspend';

interface ReportInvestigationDialogProps {
  report: AdminReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processing: boolean;
  onAction: (report: AdminReport, action: ReportAction) => void;
}

const TARGET_LABELS: Record<string, string> = {
  post: 'Post',
  interest_post: 'Interest post',
  profile: 'Profile',
  group: 'Group',
  reel: 'Reel',
  comment: 'Comment',
  book: 'Book',
};

export default function ReportInvestigationDialog({
  report, open, onOpenChange, processing, onAction,
}: ReportInvestigationDialogProps) {
  if (!report) return null;

  const canHide = ['post', 'reel', 'book'].includes(report.target_type);
  const canDelete = ['post', 'reel', 'book', 'comment', 'interest_post'].includes(report.target_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-scope max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report investigation
          </DialogTitle>
          <DialogDescription>
            {TARGET_LABELS[report.target_type] || report.target_type} reported · {new Date(report.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={report.reporter?.avatar_url || undefined} />
              <AvatarFallback className="text-xs">
                {(report.reporter?.display_name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">
                Reported by {report.reporter?.display_name || 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground">@{report.reporter?.username || 'unknown'}</p>
            </div>
            <Badge variant={report.status === 'open' ? 'destructive' : 'secondary'} className="ml-auto">
              {report.status}
            </Badge>
          </div>

          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
              Reason
            </p>
            <p className="text-sm font-medium">{report.reason}</p>
            {report.details && (
              <p className="text-sm text-muted-foreground mt-2 border-t border-border/40 pt-2">
                {report.details}
              </p>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
              Reported content
            </p>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground mb-2">
                {TARGET_LABELS[report.target_type] || report.target_type}
                {report.target?.userId && (
                  <> · by {report.target.userName || 'a user'}</>
                )}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {report.target?.preview || <span className="italic text-muted-foreground">(content no longer available)</span>}
              </p>
              {report.target?.hidden && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive mt-2">Already hidden</Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={() => onAction(report, 'delete')} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Delete
            </Button>
          )}
          {canHide && (
            <Button variant="outline" size="sm" onClick={() => onAction(report, 'hide')} disabled={processing}>
              <EyeOff className="w-4 h-4 mr-1.5" />
              Hide
            </Button>
          )}
          {report.target?.userId && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onAction(report, 'suspend')} disabled={processing}>
              <Ban className="w-4 h-4 mr-1.5" />
              Suspend author
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAction(report, 'dismiss')} disabled={processing}>
              <XCircle className="w-4 h-4 mr-1.5 text-muted-foreground" />
              Dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onAction(report, 'resolve')} disabled={processing}>
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-success" />
              Resolve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
