import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAdminActions } from '@/hooks/useAdminActions';
import { toast } from '@/hooks/use-toast';
import { Loader2, Trash, ShieldAlert } from 'lucide-react';

const CONFIRM_PHRASE = 'DELETE ALL';

interface PurgeAllUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Multi-step safeguard for the destructive "Delete All Users" action:
 *  1. Type the confirmation phrase to unlock step 2.
 *  2. Confirm in a dedicated alert dialog that records the purge in the audit log.
 */
export default function PurgeAllUsersDialog({ open, onOpenChange, onDone }: PurgeAllUsersDialogProps) {
  const { writeAudit } = useAdminActions();
  const [phrase, setPhrase] = useState('');
  const [stepTwo, setStepTwo] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);

  const confirmPurge = async () => {
    setPurgeLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_purge_all_users', {
        keep_user_id: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      await writeAudit('purge_all_users', 'system', null, { deleted: data });
      toast({ title: 'Purge complete', description: `${data} user(s) were deleted. Your account was kept.` });
      setPhrase('');
      setStepTwo(false);
      onOpenChange(false);
      onDone();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Purge failed', description: error?.message || 'Something went wrong.' });
    } finally {
      setPurgeLoading(false);
    }
  };

  const close = () => {
    if (purgeLoading) return;
    setPhrase('');
    setStepTwo(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && !stepTwo} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Delete all users?
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>
                This permanently deletes <strong>every account except yours</strong> — posts, reels,
                books, comments, subscriptions and sessions. There is no undo.
              </p>
              <p>
                Type <strong>{CONFIRM_PHRASE}</strong> below to continue.
              </p>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="uppercase tracking-widest"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={close} disabled={purgeLoading}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={phrase !== CONFIRM_PHRASE || purgeLoading}
              onClick={() => setStepTwo(true)}
            >
              {purgeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash className="w-4 h-4 mr-2" />}
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={stepTwo} onOpenChange={(o) => { if (!o) { setStepTwo(false); setPhrase(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              This is the final step. All user accounts (except yours) will be permanently deleted and
              the action recorded in the audit log. This cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purgeLoading}
              onClick={confirmPurge}
            >
              {purgeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash className="w-4 h-4 mr-2" />}
              Delete all users
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
