import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AccountChangeType = 'username' | 'display_name';

export interface AccountChangeLimit {
  change_type: AccountChangeType;
  used: number;
  remaining: number;
  change_limit: number;
}

export function useAccountChangeUsage() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['account-change-usage', user?.id],
    queryFn: async (): Promise<AccountChangeLimit[]> => {
      if (!user) return [];
      const { data, error } = await (supabase as any).rpc('get_account_change_usage');
      if (error) throw error;
      return (data || []) as AccountChangeLimit[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export async function recordAccountChange(changeType: AccountChangeType) {
  const { error } = await (supabase as any).rpc('record_account_change', { p_type: changeType });
  if (error) throw error;
}

// ─── Email verification (OTP) ────────────────────────────────────────────────

export type VerificationStatus = 'idle' | 'sent' | 'verifying' | 'verified';

export function useEmailVerification(email: string) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = useCallback(async () => {
    if (!email) throw new Error('No email on file');
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (err) {
      setError(err.message);
      throw err;
    }
    setStatus('sent');
    setResendIn(60);
  }, [email]);

  const verify = useCallback(
    async (token: string) => {
      if (!email) throw new Error('No email on file');
      setError(null);
      setStatus('verifying');
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (err) {
        setStatus('sent');
        setError(err.message);
        throw err;
      }
      setStatus('verified');
    },
    [email]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResendIn(0);
    setError(null);
  }, []);

  return { status, resendIn, error, sendCode, verify, reset };
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}
