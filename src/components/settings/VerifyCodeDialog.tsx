import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Mail } from 'lucide-react';
import { useEmailVerification, maskEmail } from '@/hooks/useAccountSecurity';
import OtpInput from './OtpInput';

const CODE_LENGTH = 6;

interface VerifyCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  title: string;
  description: string;
  onVerified: () => Promise<void> | void;
}

export default function VerifyCodeDialog({
  open,
  onOpenChange,
  email,
  title,
  description,
  onVerified,
}: VerifyCodeDialogProps) {
  const { status, resendIn, error, sendCode, verify, reset } = useEmailVerification(email);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [applying, setApplying] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setDigits(Array(CODE_LENGTH).fill(''));
    }
  }, [open, reset]);

  const handleSendCode = async () => {
    setSending(true);
    try {
      await sendCode();
    } catch {
      /* error surfaced by hook */
    } finally {
      setSending(false);
    }
  };

  const code = digits.join('');
  const codeComplete = code.length === CODE_LENGTH;

  const handleVerify = async () => {
    if (!codeComplete) return;
    setApplying(true);
    try {
      await verify(code);
      await onVerified();
      onOpenChange(false);
    } catch {
      /* error surfaced by hook */
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Code sent to</p>
              <p className="text-sm text-muted-foreground truncate">{maskEmail(email)}</p>
            </div>
          </div>

          {status === 'idle' ? (
            <Button className="w-full" onClick={handleSendCode} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send verification code'
              )}
            </Button>
          ) : (
            <>
              <OtpInput value={digits} onChange={setDigits} autoFocus />

              {error && (
                <p className="text-sm text-destructive font-medium text-center">{error}</p>
              )}

              <Button
                className="w-full"
                onClick={handleVerify}
                disabled={!codeComplete || applying || status === 'verifying'}
              >
                {(applying || status === 'verifying') ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & continue'
                )}
              </Button>

              <div className="text-center">
                {resendIn > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend code in {resendIn}s
                  </p>
                ) : (
                  <button
                    onClick={handleSendCode}
                    disabled={sending}
                    className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Resend code'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
