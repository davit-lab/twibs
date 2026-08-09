import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArmingPayload,
  RedButtonStatus,
  TriggerResponse,
  armingPayloadSchema,
  redButtonStatusSchema,
} from '@/lib/security/redButton';

const POLL_MS = 2000;

export function useRedButton() {
  const { user } = useAuth();
  const [status, setStatus] = useState<RedButtonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const { data, error: rpcError } = await (supabase as any).rpc('admin_red_button_status');
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    try {
      setStatus(redButtonStatusSchema.parse(data));
      setError(null);
    } catch {
      setError('Invalid status payload');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchStatus();
    timer.current = setInterval(fetchStatus, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [user, fetchStatus]);

  const beginArming = useCallback(async (): Promise<{ phrase: string | null; error: string | null }> => {
    const { data, error: rpcError } = await (supabase as any).rpc('admin_red_button_begin_arming');
    if (rpcError) return { phrase: null, error: rpcError.message };
    try {
      const parsed = armingPayloadSchema.parse(data);
      return { phrase: parsed.phrase, error: null };
    } catch {
      return { phrase: null, error: 'Invalid arming response' };
    }
  }, []);

  const trigger = useCallback(
    async (pin: string, phrase: string): Promise<{ jobId: string | null; error: string | null }> => {
      const { data, error: rpcError } = await (supabase as any).rpc('admin_red_button_trigger', {
        p_pin: pin,
        p_phrase: phrase,
      });
      if (rpcError) return { jobId: null, error: rpcError.message };
      const parsed = data as TriggerResponse;
      return { jobId: parsed?.job_id ?? null, error: null };
    },
    [],
  );

  const rollback = useCallback(async (): Promise<{ error: string | null }> => {
    const { error: rpcError } = await (supabase as any).rpc('admin_red_button_rollback');
    return { error: rpcError?.message ?? null };
  }, []);

  const resume = useCallback(async (): Promise<{ error: string | null }> => {
    const { error: rpcError } = await (supabase as any).rpc('admin_red_button_resume');
    return { error: rpcError?.message ?? null };
  }, []);

  return { status, loading, error, refresh: fetchStatus, beginArming, trigger, rollback, resume };
}
