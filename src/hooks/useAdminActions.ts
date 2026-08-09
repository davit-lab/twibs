import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'super_admin' | 'admin' | 'moderator' | 'support' | 'user';

type RpcResult = { error: string | null };

/**
 * Centralized admin actions. Every destructive or privileged operation
 * goes through a SECURITY DEFINER RPC that performs its own authorization
 * check AND writes an immutable entry to admin_audit_logs server-side.
 */
export function useAdminActions() {
  const { user } = useAuth();

  const requireStaff = useCallback((): string | null => {
    if (!user) return 'Not authenticated';
    return null;
  }, [user]);

  const setRole = useCallback(async (userId: string, role: AppRole): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_set_user_role', {
      p_user_id: userId,
      p_role: role,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const deleteUser = useCallback(async (userId: string): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_delete_user', {
      target_user_id: userId,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const logoutAllSessions = useCallback(async (userId: string): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_logout_all_sessions', {
      p_user_id: userId,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const shadowBan = useCallback(async (userId: string, active: boolean, reason?: string): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_shadow_ban', {
      p_user_id: userId,
      p_active: active,
      p_reason: reason ?? null,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const toggleHidden = useCallback(async (targetType: string, targetId: string, hidden: boolean): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_toggle_content_hidden', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_hidden: hidden,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const deleteContent = useCallback(async (targetType: string, targetId: string): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('admin_delete_content', {
      p_target_type: targetType,
      p_target_id: targetId,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  const getActivity = useCallback(async (userId: string) => {
    const guard = requireStaff();
    if (guard) return null;
    const { data, error } = await (supabase as any).rpc('admin_get_user_activity', {
      p_user_id: userId,
    });
    if (error) return null;
    return data as Record<string, number> | null;
  }, [requireStaff]);

  const getEmails = useCallback(async (userIds: string[]): Promise<Record<string, string>> => {
    if (!userIds.length) return {};
    const { data, error } = await (supabase as any).rpc('admin_get_user_emails', {
      p_user_ids: userIds,
    });
    if (error) return {};
    const map: Record<string, string> = {};
    for (const row of data || []) {
      map[row.user_id] = row.email;
    }
    return map;
  }, [requireStaff]);

  const getSessions = useCallback(async (userId: string) => {
    const guard = requireStaff();
    if (guard) return [];
    const { data, error } = await (supabase as any).rpc('admin_get_user_sessions', {
      p_user_id: userId,
    });
    if (error) return [];
    return (data || []) as Array<{
      id: string;
      device_name: string | null;
      device_type: string | null;
      location: string | null;
      ip_address: string | null;
      is_current: boolean;
      last_active_at: string | null;
      created_at: string;
    }>;
  }, [requireStaff]);

  const forcePasswordReset = useCallback(async (email: string): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  // Lightweight audit write for flows that keep their primary mutation
  // client-side (e.g. ban creation via existing admin RLS policies).
  const writeAudit = useCallback(async (
    action: string,
    targetType: string | null,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): Promise<RpcResult> => {
    const guard = requireStaff();
    if (guard) return { error: guard };
    const { error } = await (supabase as any).rpc('audit_action', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_details: details ?? null,
    });
    return { error: error?.message ?? null };
  }, [requireStaff]);

  return {
    setRole,
    deleteUser,
    logoutAllSessions,
    shadowBan,
    toggleHidden,
    deleteContent,
    getActivity,
    getEmails,
    getSessions,
    forcePasswordReset,
    writeAudit,
  };
}
